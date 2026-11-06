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
import { sql } from './db.ts'
import type { Chain } from './noir.ts'

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
    let status: 'funded' | 'failed' = 'funded'
    let txHash: string | null = null
    let error: string | null = null
    try {
      txHash = await chain.fund(a, stroops)
    } catch (e) {
      status = 'failed'
      error = e instanceof Error ? e.message : String(e)
      console.error(`fundEscrow ${a} failed: ${error}`)
    }
    await sql`
      insert into set_asides (client_payment_id, agency, period, php_centavos, stroops, status, tx_hash, reason, error)
      values (${cp.id}, ${a}, ${cp.period}, ${php}, ${stroops.toString()}, ${status}, ${txHash}, ${reason}, ${error})
      on conflict (client_payment_id, agency) do update
        set php_centavos = excluded.php_centavos, stroops = excluded.stroops, status = excluded.status,
            tx_hash = excluded.tx_hash, reason = excluded.reason, error = excluded.error, created_at = now()
        where set_asides.status = 'failed'`
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
let queue: Promise<unknown> = Promise.resolve()
export function runSetAside(clientPaymentId: string, chain: Chain) {
  const run = queue.then(() => setAside(clientPaymentId, chain))
  queue = run.catch((e) => console.error(`set-aside for client payment ${clientPaymentId} failed:`, e))
  return run
}

type Reads = { balance(agency: Agency): Promise<bigint>; hash(agency: Agency): string }

export function setAsideRoutes(chain: Chain, reads: Reads) {
  const routes = new Hono()

  routes.get('/envelopes', async (c) => {
    const period = periodOf(new Date())
    const income = await periodIncome(period)
    const rows = await sql<{ agency: Agency; status: string; php_centavos: number; tx_hash: string | null; reason: string; error: string | null; client_payment_id: string; created_at: Date }[]>`
      select distinct on (agency) agency, status, php_centavos, tx_hash, reason, error, client_payment_id, created_at
      from set_asides where period = ${period} order by agency, created_at desc`
    const funded = await fundedThisPeriod(period)

    const envelopes = await Promise.all(
      AGENCIES.map(async (a) => {
        const balance = await reads.balance(a).catch(() => null)
        const latest = rows.find((r) => r.agency === a)
        return {
          agency: a,
          label: AGENCY_LABEL[a],
          deviceHash: reads.hash(a),
          deadline: deadlineFor(a, period),
          contributionCentavos: contributionFor(a, income),
          setAsideCentavos: funded.filter((f) => f.agency === a).reduce((s, f) => s + f.php, 0),
          balanceXlm: balance === null ? null : fromStroops(balance),
          balanceCentavos: balance === null ? null : stroopsToPhp(balance, rate()),
          latest: latest && {
            status: latest.status,
            amountCentavos: latest.php_centavos,
            txHash: latest.tx_hash,
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
      if (ok.length) notice = `I set aside ${ok.map((m) => `${formatPeso(m.php_centavos)} for ${AGENCY_LABEL[m.agency]}`).join(', ')}.`
      else if (!mine.length && Date.now() - newest.received_at.getTime() < 10 * 60_000) notice = 'Setting aside your contributions…'
    }

    return c.json({ period, incomeCentavos: income, envelopes, notice, failed: envelopes.some((e) => e.latest?.status === 'failed') })
  })

  // Retry a client payment's set-aside after a failure (demo passcode). Never double-funds.
  routes.post('/client-payments/:id/set-aside', async (c) => {
    const id = c.req.param('id')
    runSetAside(id, chain).catch(() => {})
    return c.json({ ok: true, started: true }, 202)
  })

  return routes
}
