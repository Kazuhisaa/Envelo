import { Hono } from 'hono'
import { Keypair } from '@stellar/stellar-sdk'
import { keypairSigner, fromStroops } from '@noirx402/agent-sdk'
import {
  AGENCIES,
  AGENCY_LABEL,
  contributionFor,
  deadlineFor,
  periodOf,
  phpToStroops,
  stroopsToPhp,
  type Agency,
  type Period,
} from '@envelo/shared'
import {
  applyHardRules,
  decideRemittance,
  type ModelCaller,
  type RemittanceFacts,
  type RemittanceDecision,
} from '@envelo/agent'
import { clock } from './clock.ts'
import { sql } from './db.ts'
import {
  XLM,
  agencyKey,
  agencyPublicKey,
  agentKey,
  agentPublicKey,
  envelopeHash,
  noir,
  remittanceChain,
  type RemittanceChain,
  NoirContractError,
} from './noir.ts'
import { periodIncome, serialized } from './setAside.ts'

const rate = () => {
  const r = process.env.XLM_PHP_RATE
  if (!r) throw new Error('XLM_PHP_RATE is not set')
  return r
}

export function explainCheckReason(reason: string): string {
  switch (reason) {
    case 'over_limit':
      return 'Remittance exceeds envelope per-remittance cap (over_limit).'
    case 'expired':
      return 'Envelope policy has expired (expired).'
    case 'insufficient_escrow':
      return 'Envelope escrow balance is insufficient (insufficient_escrow).'
    case 'no_agent':
      return 'No agent policy registered for this envelope (no_agent).'
    case 'wrong_agent':
      return 'Authorized agent does not match envelope policy (wrong_agent).'
    case 'wrong_asset':
      return 'Asset does not match envelope policy asset (wrong_asset).'
    case 'invalid_amount':
      return 'Remittance amount is invalid (invalid_amount).'
    default:
      return `Contract check failed: ${reason}.`
  }
}

export type EnvelopeReads = {
  getEscrowBalance(deviceHash: string): Promise<bigint>
  getPolicy(deviceHash: string): Promise<{ maxAmount: bigint; expiresAt: Date | null } | null>
}

export type TickEnvOptions = {
  chain?: RemittanceChain
  reads?: EnvelopeReads
  modelCaller?: ModelCaller
  agentSecret?: string
  db?: typeof sql
  period?: Period
  /** This period's income in centavos; read from client_payments when omitted. */
  income?: number
}

export type DecisionRow = {
  id: string
  agency: Agency
  period: string
  action: string
  amount_stroops: string
  reason: string
  facts_snapshot: any
  model: string
  created_at: Date
}

export type RemittanceRow = {
  id: string
  agency: Agency
  period: string
  amount_stroops: string
  authorize_tx_hash: string
  claim_tx_hash: string
  nonce: string
  decision_id: string | null
  created_at: Date
}

export async function isRemittedThisPeriod(agency: Agency, period: string, database = sql): Promise<boolean> {
  try {
    const [{ count }] = await database<{ count: string }[]>`
      select count(*)::text as count from remittances where agency = ${agency} and period = ${period}`
    return Number(count) > 0
  } catch {
    return false
  }
}

export async function gatherFacts(agency: Agency, options?: TickEnvOptions): Promise<RemittanceFacts> {
  const now = clock.now()
  const period = options?.period ?? periodOf(now)
  const hash = envelopeHash(agency)

  const reads = options?.reads ?? {
    getEscrowBalance: (dh: string) => noir.getEscrowBalance(dh),
    getPolicy: (dh: string) => noir.getPolicy(dh),
  }

  let escrowBalance = 0n
  try {
    escrowBalance = await reads.getEscrowBalance(hash)
  } catch (err) {
    console.warn(`could not read escrow balance for ${agency}:`, err)
  }

  let policy: { maxAmount: bigint; expiresAt: Date | null } | null = null
  try {
    policy = await reads.getPolicy(hash)
  } catch (err) {
    console.warn(`could not read policy for ${agency}:`, err)
  }

  let income = options?.income ?? 0
  if (options?.income === undefined) {
    try {
      income = await periodIncome(period)
    } catch {
      income = 0
    }
  }

  const contributionCentavos = contributionFor(agency, income)
  const contributionStroops = phpToStroops(contributionCentavos, rate())
  const deadline = deadlineFor(agency, period)
  const alreadyRemitted = await isRemittedThisPeriod(agency, period, options?.db ?? sql)

  return {
    agency,
    agencyLabel: AGENCY_LABEL[agency],
    period,
    contributionStroops,
    escrowBalanceStroops: escrowBalance,
    policy,
    deadline,
    alreadyRemitted,
    now,
    contributionPhpCentavos: contributionCentavos,
    escrowBalancePhpCentavos: stroopsToPhp(escrowBalance, rate()),
  }
}

export async function tickEnvelope(agency: Agency, options?: TickEnvOptions) {
  const facts = await gatherFacts(agency, options)
  const chain = options?.chain ?? remittanceChain
  const database = options?.db ?? sql
  const agentSec = options?.agentSecret ?? process.env.AGENT_SECRET

  // 1. Decision layer (Gemini + fallback)
  const rawDecision = await decideRemittance(facts, { caller: options?.modelCaller })

  // 2. Hard rules check (code, after AI, before chain)
  const { decision: hardDecision, blocked, rule } = applyHardRules(rawDecision, facts)
  let finalDecision: RemittanceDecision = hardDecision

  let remittanceResult: {
    authorizeTxHash: string
    claimTxHash: string
    nonce: bigint
  } | null = null
  let contractError: string | null = null

  // 3. Remittance execution if pay
  if (finalDecision.action === 'pay') {
    const hash = envelopeHash(agency)
    const agentPub = agentSec ? Keypair.fromSecret(agentSec).publicKey() : agentPublicKey()
    const agencyPub = agencyPublicKey(agency)

    const check = await chain.checkPayment({
      deviceHash: hash,
      agent: agentPub,
      asset: XLM,
      amount: finalDecision.amount,
    })

    if (!check.ok) {
      const explanation = explainCheckReason(check.reason ?? 'unknown')
      finalDecision = {
        action: 'wait',
        amount: 0n,
        reason: `Remittance checkPayment prevented remittance: ${explanation}`,
        model: rawDecision.model,
      }
    } else {
      if (!agentSec) {
        throw new Error('AGENT_SECRET is not set for remittance authorization')
      }
      try {
        const auth = await chain.authorizePayment({
          agent: keypairSigner(agentSec),
          deviceHash: hash,
          merchant: agencyPub,
          asset: XLM,
          amount: finalDecision.amount,
        })

        const claim = await chain.claim({
          merchant: keypairSigner(agencyKey(agency).secret()),
          token: XLM,
        })

        remittanceResult = {
          authorizeTxHash: auth.hash,
          claimTxHash: claim.hash,
          nonce: auth.nonce,
        }
      } catch (err: any) {
        if (err instanceof NoirContractError || err?.name === 'NoirContractError') {
          contractError = `NoirContractError: ${err.message}`
        } else {
          contractError = err instanceof Error ? err.message : String(err)
        }
        console.error(`remittance transaction failed for ${agency}:`, contractError)
        finalDecision = {
          action: 'wait',
          amount: 0n,
          reason: `Remittance failed on chain: ${contractError}`,
          model: rawDecision.model,
        }
      }
    }
  }

  // 4. Record decision in DB
  let decisionId: string | null = null
  try {
    const factsSnapshot = {
      agency: facts.agency,
      period: facts.period,
      contributionStroops: facts.contributionStroops.toString(),
      escrowBalanceStroops: facts.escrowBalanceStroops.toString(),
      policy: facts.policy ? { maxAmount: facts.policy.maxAmount.toString(), expiresAt: facts.policy.expiresAt } : null,
      deadline: facts.deadline.toISOString(),
      alreadyRemitted: facts.alreadyRemitted,
      now: facts.now.toISOString(),
    }

    const [dRow] = await database<{ id: string }[]>`
      insert into decisions (agency, period, action, amount_stroops, reason, facts_snapshot, model)
      values (
        ${facts.agency},
        ${facts.period},
        ${finalDecision.action},
        ${finalDecision.amount.toString()},
        ${finalDecision.reason},
        ${database.json(factsSnapshot)},
        ${finalDecision.model}
      )
      returning id`
    decisionId = dRow?.id ?? null
  } catch (err) {
    console.error('failed to record decision in database:', err)
  }

  // 5. Record remittance in DB if completed
  if (remittanceResult) {
    try {
      await database`
        insert into remittances (
          agency, period, amount_stroops, authorize_tx_hash, claim_tx_hash, nonce, decision_id
        ) values (
          ${facts.agency},
          ${facts.period},
          ${finalDecision.amount.toString()},
          ${remittanceResult.authorizeTxHash},
          ${remittanceResult.claimTxHash},
          ${remittanceResult.nonce.toString()},
          ${decisionId}
        )
        on conflict (agency, period) do nothing`
    } catch (err) {
      console.error('failed to record remittance in database:', err)
    }
  }

  return {
    agency,
    facts,
    decision: finalDecision,
    blockedByHardRule: blocked ? rule : null,
    remittance: remittanceResult,
    contractError,
  }
}

// Waits for any running set-aside (same queue), so the agent never pays mid cap update.
export function tickAll(options?: TickEnvOptions) {
  return serialized('agent tick', async () => {
    const results = []
    for (const agency of AGENCIES) {
      results.push(await tickEnvelope(agency, options))
    }
    return results
  })
}

export async function fastForward(to?: Date, options?: TickEnvOptions) {
  if (to) {
    clock.set(to)
  } else {
    const period = periodOf(clock.now())
    const deadlines = AGENCIES.map((a) => deadlineFor(a, period).getTime())
    const earliest = new Date(Math.min(...deadlines))
    // Set simulated clock to 2 hours before the earliest deadline
    const justBefore = new Date(earliest.getTime() - 2 * 3600_000)
    clock.set(justBefore)
  }

  const results = await tickAll(options)
  return {
    now: clock.now(),
    isSimulated: clock.isSimulated(),
    results,
  }
}

export function agentRoutes(options?: TickEnvOptions) {
  const routes = new Hono()

  routes.get('/agent/clock', (c) => {
    const now = clock.now()
    const period = periodOf(now)
    return c.json({
      now: now.toISOString(),
      isSimulated: clock.isSimulated(),
      period,
    })
  })

  routes.post('/agent/tick', async (c) => {
    const results = await tickAll(options)
    return c.json({ ok: true, now: clock.now().toISOString(), results })
  })

  routes.post('/agent/fast-forward', async (c) => {
    const body = await c.req.json().catch(() => null)
    let to: Date | undefined
    if (typeof body?.to === 'string' && body.to.trim()) {
      to = new Date(body.to.trim())
      if (isNaN(to.getTime())) {
        return c.json({ error: 'invalid date in "to"' }, 400)
      }
    }
    const data = await fastForward(to, options)
    return c.json({ ok: true, ...data })
  })

  routes.post('/agent/reset-clock', (c) => {
    clock.reset()
    return c.json({ ok: true, now: clock.now().toISOString(), isSimulated: false })
  })

  routes.get('/agent/decisions', async (c) => {
    try {
      const database = options?.db ?? sql
      const rows = await database<DecisionRow[]>`
        select * from decisions order by created_at desc limit 50`
      return c.json(
        rows.map((r) => ({
          id: r.id,
          agency: r.agency,
          period: r.period,
          action: r.action,
          amountStroops: r.amount_stroops,
          amountXlm: fromStroops(BigInt(r.amount_stroops)),
          amountPhpCentavos: rate() ? stroopsToPhp(BigInt(r.amount_stroops), rate()) : null,
          reason: r.reason,
          factsSnapshot: r.facts_snapshot,
          model: r.model,
          createdAt: r.created_at,
        })),
      )
    } catch (err) {
      console.warn('could not fetch decisions:', err)
      return c.json([])
    }
  })

  routes.get('/agent/remittances', async (c) => {
    try {
      const database = options?.db ?? sql
      const rows = await database<(RemittanceRow & { reason?: string })[]>`
        select r.*, d.reason from remittances r
        left join decisions d on d.id = r.decision_id
        order by r.created_at desc limit 50`
      return c.json(
        rows.map((r) => ({
          id: r.id,
          agency: r.agency,
          period: r.period,
          amountStroops: r.amount_stroops,
          amountXlm: fromStroops(BigInt(r.amount_stroops)),
          amountPhpCentavos: rate() ? stroopsToPhp(BigInt(r.amount_stroops), rate()) : null,
          authorizeTxHash: r.authorize_tx_hash,
          claimTxHash: r.claim_tx_hash,
          nonce: r.nonce,
          decisionId: r.decision_id,
          reason: r.reason ?? null,
          createdAt: r.created_at,
        })),
      )
    } catch (err) {
      console.warn('could not fetch remittances:', err)
      return c.json([])
    }
  })

  return routes
}
