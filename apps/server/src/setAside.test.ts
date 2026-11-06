import { beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { phpToStroops, periodOf, type Agency } from '@envelo/shared'

// Needs a throwaway Postgres: TEST_DATABASE_URL=postgres://... pnpm test (tables are truncated).
const url = process.env.TEST_DATABASE_URL
const RATE = '15.00'
const php = (pesos: number) => Math.round(pesos * 100)

describe.skipIf(!url)('set-aside orchestration (Noir faked)', () => {
  let sql: typeof import('./db.ts').sql
  let runSetAside: typeof import('./setAside.ts').runSetAside
  const period = periodOf(new Date())

  type Call = { kind: 'fund' | 'cap'; agency: Agency; stroops: bigint }
  const fakeChain = (calls: Call[], failFor?: Agency) => ({
    async fund(agency: Agency, stroops: bigint) {
      if (agency === failFor) throw new Error('InsufficientBalance')
      calls.push({ kind: 'fund', agency, stroops })
      return `tx_${agency}_${calls.length}`
    },
    async ensureCap(agency: Agency, stroops: bigint) {
      calls.push({ kind: 'cap', agency, stroops })
    },
  })
  const funds = (calls: Call[]) => Object.fromEntries(calls.filter((c) => c.kind === 'fund').map((c) => [c.agency, c.stroops]))
  const xlm = (pesos: number) => phpToStroops(php(pesos), RATE)

  let n = 0
  const clientPayment = async (pesos: number) => {
    n++
    const [row] = await sql<{ id: string }[]>`
      insert into client_payments (event_id, payment_intent_id, amount_stroops, asset, period)
      values (${`evt_${n}`}, ${`pi_${n}`}, ${xlm(pesos).toString()}, 'native', ${period}) returning id`
    return row.id
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.XLM_PHP_RATE = RATE
    const db = await import('./db.ts')
    await db.migrate()
    sql = db.sql
    runSetAside = (await import('./setAside.ts')).runSetAside
  })

  beforeEach(async () => {
    await sql`truncate set_asides, client_payments, invoices restart identity cascade`
  })

  test('a ₱25,000 client payment funds 3,780 / 1,250 / 400 and caps each envelope at the legal maximum', async () => {
    const calls: Call[] = []
    await runSetAside(await clientPayment(25_000), fakeChain(calls))
    expect(funds(calls)).toEqual({ sss: xlm(3_780), philhealth: xlm(1_250), pagibig: xlm(400) })
    // Cap = legal maximum per period: SSS 15% of the ₱35,000 MSC + ₱30 EC, PhilHealth 5% of the ₱100,000 ceiling, Pag-IBIG ₱400.
    expect(calls.filter((c) => c.kind === 'cap').map((c) => c.stroops)).toEqual([xlm(5_280), xlm(5_000), xlm(400)])
    const [sss] = await sql`select reason from set_asides where agency = 'sss'`
    expect(sss.reason).toBe("Set aside ₱3,780 for SSS toward this period's ₱3,780: 15% of your ₱25,000 MSC plus ₱30 EC.")
  })

  test('a second client payment sets aside only the difference', async () => {
    await runSetAside(await clientPayment(25_000), fakeChain([]))
    const calls: Call[] = []
    await runSetAside(await clientPayment(10_000), fakeChain(calls))
    // ₱35,000 period income → SSS 5,280 (+1,500), PhilHealth 1,750 (+500), Pag-IBIG already at 400.
    expect(funds(calls)).toEqual({ sss: xlm(1_500), philhealth: xlm(500) })
  })

  test('a client payment that cannot cover every set-aside falls back to a proportional split', async () => {
    const calls: Call[] = []
    await runSetAside(await clientPayment(1_000), fakeChain(calls)) // needs 760 / 500 / 40 = 1,300 > 1,000
    // ₱1,000 × 760/1,300, × 500/1,300, × 40/1,300, in centavos, rounded down.
    expect(funds(calls)).toEqual({ sss: phpToStroops(58_461, RATE), philhealth: phpToStroops(38_461, RATE), pagibig: phpToStroops(3_076, RATE) })
    const rows = await sql`select reason from set_asides`
    expect(rows.every((r) => r.reason.includes('in proportion'))).toBe(true)
  })

  test('one failed fundEscrow is recorded, the others go through, and a retry funds only the missing one', async () => {
    const id = await clientPayment(25_000)
    const first: Call[] = []
    await runSetAside(id, fakeChain(first, 'philhealth'))
    expect(funds(first)).toEqual({ sss: xlm(3_780), pagibig: xlm(400) })
    const [failed] = await sql`select status, error from set_asides where agency = 'philhealth'`
    expect(failed).toMatchObject({ status: 'failed', error: 'InsufficientBalance' })

    const retry: Call[] = []
    await runSetAside(id, fakeChain(retry))
    expect(funds(retry)).toEqual({ philhealth: xlm(1_250) })
    const statuses = await sql`select agency, status from set_asides order by agency`
    expect(statuses.every((s) => s.status === 'funded')).toBe(true)

    const again: Call[] = []
    await runSetAside(id, fakeChain(again))
    expect(funds(again)).toEqual({})
  })
})
