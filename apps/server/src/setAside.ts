import { Hono } from 'hono'
import { fromStroops } from '@noirx402/agent-sdk'
import {
  AGENCIES,
  AGENCY_LABEL,
  contributionFor,
  contributionRule,
  deadlineFor,
  formatPeso,
  periodOf,
  phpToStroops,
  setAsideFor,
  stroopsToPhp,
  type Agency,
  type Period,
} from '@envelo/shared'
import { prioritizeSetAsides } from '@envelo/agent'
import { clock } from './clock.ts'
import { sql } from './db.ts'
import { agencyPublicKey, type Chain } from './noir.ts'
import { recoverGasOp } from './gas.ts'

const rate = () => {
  const r = process.env.XLM_PHP_RATE
  if (!r) throw new Error('XLM_PHP_RATE is not set')
  return r
}
const perAgency = <T>(f: (a: Agency) => T) => Object.fromEntries(AGENCIES.map((a) => [a, f(a)])) as Record<Agency, T>

export async function periodIncome(period: string) {
  const [{ total }] = await sql<{ total: string }[]>`select coalesce(sum(amount_stroops), 0)::text as total from client_payments where period = ${period}`
  return stroopsToPhp(BigInt(total), rate())
}

async function fundedThisPeriod(period: string) {
  return sql<{ agency: Agency; client_payment_id: string; php: number }[]>`
    select agency, client_payment_id, sum(php_centavos)::int as php from set_asides
    where period = ${period} and status = 'funded' group by agency, client_payment_id`
}

/**
 * The set-aside for one client payment. Safe to re-run: what to fund is computed from recorded
 * funded set-asides, so a retry after a failure only funds what is still missing.
 */
async function setAside(clientPaymentId: string, chain: Chain) {
  const [cp] = await sql<{ id: string; amount_stroops: string; period: Period }[]>`select id, amount_stroops, period from client_payments where id = ${clientPaymentId}`
  if (!cp) throw new Error(`client payment ${clientPaymentId} not found`)
  const income = await periodIncome(cp.period)
  const funded = await fundedThisPeriod(cp.period)
  const already = perAgency((a) => funded.filter((f) => f.agency === a).reduce((s, f) => s + f.php, 0))
  const usedByThis = funded.filter((f) => f.client_payment_id === cp.id).reduce((s, f) => s + f.php, 0)

  const needed = perAgency((a) => setAsideFor(a, income, already[a]))
  const available = stroopsToPhp(BigInt(cp.amount_stroops), rate()) - usedByThis
  const totalNeeded = AGENCIES.reduce((s, a) => s + needed[a], 0)

  let amounts = needed
  let why = ''
  if (totalNeeded > available) {
    const decision = await prioritizeSetAsides({
      availableCentavos: Math.max(0, available),
      needed,
      deadlines: perAgency((a) => deadlineFor(a, cp.period)),
      balances: already,
      today: new Date(),
    })
    // Whatever the prioritizer returns, never above a need and never above what is available.
    let left = Math.max(0, available)
    amounts = perAgency((a) => {
      const x = Math.max(0, Math.min(needed[a], Math.floor(decision.amounts[a] ?? 0), left))
      left -= x
      return x
    })
    why = decision.reason
  }

  for (const a of AGENCIES) {
    const php = amounts[a]
    if (php <= 0) continue
    const stroops = phpToStroops(php, rate())
    const reason = `Set aside ${formatPeso(php)} for ${AGENCY_LABEL[a]} toward this period's ${formatPeso(contributionFor(a, income))}: ${contributionRule(a, income)}.${why ? ` ${why}` : ''}`

    // Insert or find the row first to obtain a stable setAsideId for the idempotency key.
    const [existing] = await sql<
      {
        id: string
        status: string
        gas_request_id: string | null
        inner_tx_hash: string | null
      }[]
    >`
      select id, status, gas_request_id, inner_tx_hash from set_asides
      where client_payment_id = ${cp.id} and agency = ${a}`

    let row = existing
    if (!row) {
      const [inserted] = await sql<
        {
          id: string
          status: string
          gas_request_id: string | null
          inner_tx_hash: string | null
        }[]
      >`
        insert into set_asides (client_payment_id, agency, period, php_centavos, stroops, status, reason)
        values (${cp.id}, ${a}, ${cp.period}, ${php}, ${stroops.toString()}, 'pending', ${reason})
        returning id, status, gas_request_id, inner_tx_hash`
      row = inserted
    }

    if (row.status === 'funded') {
      continue
    }

    // If previously attempted with Gas Station and has an identity, recover without re-signing or resubmitting:
    if (row.gas_request_id && row.inner_tx_hash) {
      try {
        const recovered = await recoverGasOp({
          requestId: row.gas_request_id,
          transactionHash: row.inner_tx_hash,
        })
        if (recovered?.status === 'succeeded') {
          await sql`
            update set_asides set
              status = 'funded',
              tx_hash = ${recovered.outerTransactionHash ?? recovered.transactionHash},
              outer_tx_hash = ${recovered.outerTransactionHash},
              inner_tx_hash = ${recovered.transactionHash},
              actual_fee_stroops = ${recovered.actualFeeStroops ?? null},
              error = null
            where id = ${row.id}`
          continue
        }
      } catch (e) {
        console.warn(`recovery for set-aside ${row.id} did not succeed:`, e)
      }
    }

    let status: 'funded' | 'failed' = 'funded'
    let txHash: string | null = null
    let outerTxHash: string | null = null
    let innerTxHash: string | null = null
    let actualFeeStroops: string | null = null
    let gasRequestId: string | null = null
    let error: string | null = null

    try {
      const fundRes = await chain.fund(a, stroops, {
        idempotencyKey: `setaside:${row.id}`,
        correlationId: `setaside:${row.id}`,
        setAsideId: row.id,
      })
      if (typeof fundRes === 'string') {
        txHash = fundRes
        innerTxHash = fundRes
      } else if (fundRes) {
        txHash = fundRes.hash
        outerTxHash = fundRes.outerTxHash ?? null
        innerTxHash = fundRes.innerTxHash ?? null
        actualFeeStroops = fundRes.actualFeeStroops ?? null
        gasRequestId = fundRes.requestId ?? null
      }
    } catch (e) {
      status = 'failed'
      error = e instanceof Error ? e.message : String(e)
      console.error(`fundEscrow ${a} failed: ${error}`)
    }

    await sql`
      update set_asides set
        php_centavos = ${php},
        stroops = ${stroops.toString()},
        status = ${status},
        tx_hash = ${txHash},
        outer_tx_hash = ${outerTxHash},
        inner_tx_hash = ${innerTxHash},
        actual_fee_stroops = ${actualFeeStroops ?? null},
        gas_request_id = ${gasRequestId},
        reason = ${reason},
        error = ${error},
        created_at = now()
      where id = ${row.id}`
  }

  // Each envelope's per-remittance cap = this period's full contribution (what makes over_limit meaningful).
  for (const a of AGENCIES) {
    try {
      await chain.ensureCap(a, phpToStroops(contributionFor(a, income), rate()), deadlineFor(a, cp.period))
    } catch (e) {
      console.error(`cap update ${a} failed:`, e)
    }
  }
}

// ponytail: in-process queue, one server instance. Use a Postgres advisory lock if the server scales out.
// Set-asides and agent ticks share it: a set-aside ends by re-registering each envelope's agent cap
// (revokeAgent then registerAgent), and an agent authorize landing in that gap is refused on-chain.
let queue: Promise<unknown> = Promise.resolve()
export function serialized<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn)
  queue = run.catch((e) => console.error(`${label} failed:`, e))
  return run
}
export function runSetAside(clientPaymentId: string, chain: Chain) {
  return serialized(`set-aside for client payment ${clientPaymentId}`, () => setAside(clientPaymentId, chain))
}

type Reads = { balance(agency: Agency): Promise<bigint>; hash(agency: Agency): string }

export function setAsideRoutes(chain: Chain, reads: Reads) {
  const routes = new Hono()

  routes.get('/envelopes', async (c) => {
    const now = clock.now()
    const period = periodOf(now)
    const income = await periodIncome(period)
    const rows = await sql<{
      agency: Agency
      status: string
      php_centavos: number
      tx_hash: string | null
      outer_tx_hash: string | null
      inner_tx_hash: string | null
      actual_fee_stroops: string | null
      reason: string
      error: string | null
      client_payment_id: string
      created_at: Date
    }[]>`
      select distinct on (agency) agency, status, php_centavos, tx_hash, outer_tx_hash, inner_tx_hash, actual_fee_stroops, reason, error, client_payment_id, created_at
      from set_asides where period = ${period} order by agency, created_at desc`
    const funded = await fundedThisPeriod(period)

    let remittances: { agency: Agency; amount_stroops: string; authorize_tx_hash: string; claim_tx_hash: string; created_at: Date }[] = []
    try {
      remittances = await sql<{ agency: Agency; amount_stroops: string; authorize_tx_hash: string; claim_tx_hash: string; created_at: Date }[]>`
        select agency, amount_stroops, authorize_tx_hash, claim_tx_hash, created_at from remittances where period = ${period}`
    } catch {}

    const envelopes = await Promise.all(
      AGENCIES.map(async (a) => {
        const balance = await reads.balance(a).catch(() => null)
        const latest = rows.find((r) => r.agency === a)
        const rem = remittances.find((r) => r.agency === a)
        return {
          agency: a,
          label: AGENCY_LABEL[a],
          agencyAccount: (() => { try { return agencyPublicKey(a) } catch { return null } })(),
          deviceHash: reads.hash(a),
          deadline: deadlineFor(a, period),
          contributionCentavos: contributionFor(a, income),
          setAsideCentavos: funded.filter((f) => f.agency === a).reduce((s, f) => s + f.php, 0),
          balanceXlm: balance === null ? null : fromStroops(balance),
          balanceCentavos: balance === null ? null : stroopsToPhp(balance, rate()),
          remitted: Boolean(rem),
          remittance: rem ? {
            amountStroops: rem.amount_stroops,
            amountXlm: fromStroops(BigInt(rem.amount_stroops)),
            amountPhpCentavos: stroopsToPhp(BigInt(rem.amount_stroops), rate()),
            authorizeTxHash: rem.authorize_tx_hash,
            claimTxHash: rem.claim_tx_hash,
            createdAt: rem.created_at,
          } : null,
          latest: latest && {
            status: latest.status,
            amountCentavos: latest.php_centavos,
            txHash: latest.tx_hash,
            outerTxHash: latest.outer_tx_hash ?? null,
            innerTxHash: latest.inner_tx_hash ?? null,
            actualFeeStroops: latest.actual_fee_stroops ?? null,
            reason: latest.reason,
            error: latest.error,
            clientPaymentId: latest.client_payment_id,
            at: latest.created_at,
          },
        }
      }),
    )

    // The notification line for the newest client payment.
    const [newest] = await sql<{ id: string; received_at: Date }[]>`select id, received_at from client_payments order by received_at desc limit 1`
    let notice: string | null = null
    if (newest) {
      const mine = await sql<{ agency: Agency; php_centavos: number; status: string }[]>`select agency, php_centavos, status from set_asides where client_payment_id = ${newest.id}`
      const ok = mine.filter((m) => m.status === 'funded')
      const running = mine.some((m) => m.status === 'pending') || (!mine.length && Date.now() - newest.received_at.getTime() < 10 * 60_000)
      if (running) notice = 'Setting aside your contributions…'
      else if (ok.length) notice = `I set aside ${ok.map((m) => `${formatPeso(m.php_centavos)} for ${AGENCY_LABEL[m.agency]}`).join(', ')}.`
    }

    return c.json({
      period,
      incomeCentavos: income,
      envelopes,
      notice,
      failed: envelopes.some((e) => e.latest?.status === 'failed'),
      clockNow: now.toISOString(),
      isSimulated: clock.isSimulated(),
    })
  })

  // Retry a client payment's set-aside after a failure (demo passcode). Never double-funds.
  routes.post('/client-payments/:id/set-aside', async (c) => {
    const id = c.req.param('id')
    runSetAside(id, chain).catch(() => {})
    return c.json({ ok: true, started: true }, 202)
  })

  return routes
}
