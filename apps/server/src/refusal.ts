// "Try to break it" (#9): force a remittance the Noir contract must refuse, and show it refusing.
// The hard-rule layer is deliberately bypassed here; the contract is the last line of defence.
import { Hono } from 'hono'
import { Keypair } from '@stellar/stellar-sdk'
import { fromStroops, keypairSigner, toStroops } from '@noirx402/agent-sdk'
import { formatPeso, periodOf, phpToStroops, stroopsToPhp } from '@envelo/shared'
import { deviceHash } from '@envelo/shared/device'
import { clock } from './clock.ts'
import { sql } from './db.ts'
import { XLM, agencyPublicKey, envelopeHash, noir, ownerKey, remittanceChain, type RemittanceChain } from './noir.ts'
import type { EnvelopeReads } from './agent.ts'

export type BreakKind = 'over-cap' | 'expired'

export type BreakDeps = {
  chain?: RemittanceChain
  reads?: EnvelopeReads
  db?: typeof sql
  agentSecret?: string
  rate?: string
  hash?: string
  merchant?: string
}

const day = (d: Date) => d.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

export async function tryToBreak(kind: BreakKind, deps: BreakDeps = {}) {
  const chain = deps.chain ?? remittanceChain
  const reads = deps.reads ?? noir
  const db = deps.db ?? sql
  const rate = deps.rate ?? process.env.XLM_PHP_RATE
  const agentSecret = deps.agentSecret ?? process.env.AGENT_SECRET
  if (!rate || !agentSecret) throw new Error('XLM_PHP_RATE and AGENT_SECRET must be set')

  const label = kind === 'over-cap' ? 'SSS' : "last month's SSS"
  const hash = deps.hash ?? (kind === 'over-cap' ? envelopeHash('sss') : deviceHash(ownerKey().publicKey(), 'sss', 'expired-demo'))
  const policy = await reads.getPolicy(hash)
  if (!policy) throw new Error(`The ${label} envelope has no agent policy. Run pnpm setup:testnet first.`)

  // Over the cap: the cap plus ₱1,000. Expired: 1 XLM, well inside that envelope's cap and escrow.
  const amount = kind === 'over-cap' ? policy.maxAmount + phpToStroops(1000_00, rate) : toStroops('1')
  const before = await reads.getEscrowBalance(hash)

  const check = await chain.checkPayment({
    deviceHash: hash,
    agent: Keypair.fromSecret(agentSecret).publicKey(),
    asset: XLM,
    amount,
    requireEscrow: false,
  })

  // Send authorizePayment anyway, so the chain itself says no, not just our pre-check.
  // Only its error counts as the refusal, so everything else is resolved before the try.
  const merchant = deps.merchant ?? agencyPublicKey('sss')
  const agent = keypairSigner(agentSecret)
  let contractError: string | null = null
  let authorizeTxHash: string | null = null
  try {
    const auth = await chain.authorizePayment({
      agent,
      deviceHash: hash,
      merchant,
      asset: XLM,
      amount,
    })
    authorizeTxHash = auth.hash
  } catch (err) {
    const e = err as { errorName?: string; name?: string; message?: string }
    contractError = e.errorName ? `NoirContractError ${e.errorName}` : `${e.name ?? 'Error'}: ${e.message ?? String(err)}`
  }

  const after = await reads.getEscrowBalance(hash)
  const fundsMoved = after !== before
  const refused = !check.ok && authorizeTxHash === null

  const message = !refused
    ? `The contract did not refuse this ${label} remittance.`
    : kind === 'over-cap'
      ? `The contract refused: this is more than the ${formatPeso(stroopsToPhp(policy.maxAmount, rate))} cap you set for SSS.`
      : `The contract refused: last month's authorization ended on ${policy.expiresAt ? day(policy.expiresAt) : 'its expiry date'}.`

  const reason =
    `Forced demo: I tried to pay ${formatPeso(stroopsToPhp(amount, rate))} from the ${label} envelope, with the hard rules bypassed on purpose. ` +
    `${message} (checkPayment: ${check.ok ? 'ok' : check.reason}; authorizePayment: ${contractError ?? `accepted, tx ${authorizeTxHash}`}.) ` +
    (fundsMoved ? 'Escrow balance changed.' : 'No funds moved.')

  await db`
    insert into decisions (agency, period, action, amount_stroops, reason, facts_snapshot, model)
    values ('sss', ${periodOf(clock.now())}, 'refused', ${amount.toString()}, ${reason},
      ${db.json({ kind, deviceHash: hash, capStroops: policy.maxAmount.toString(), expiresAt: policy.expiresAt?.toISOString() ?? null })},
      'forced-demo')`

  return {
    kind,
    refused,
    message,
    checkReason: check.ok ? null : check.reason,
    contractError,
    authorizeTxHash,
    escrowBeforeXlm: fromStroops(before),
    escrowAfterXlm: fromStroops(after),
    fundsMoved,
  }
}

export function refusalRoutes(deps?: BreakDeps) {
  const routes = new Hono()
  routes.post('/agent/break/:kind', async (c) => {
    const kind = c.req.param('kind')
    if (kind !== 'over-cap' && kind !== 'expired') return c.json({ error: 'kind must be over-cap or expired' }, 400)
    return c.json(await tryToBreak(kind, deps))
  })
  return routes
}
