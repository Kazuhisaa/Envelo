import { createHmac } from 'node:crypto'
import { beforeAll, beforeEach, describe, expect, test } from 'vitest'

// Needs a throwaway Postgres: TEST_DATABASE_URL=postgres://... pnpm test (tables are truncated).
const url = process.env.TEST_DATABASE_URL
const SECRET = 'whsec_test'

const sign = (body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`

// The summary payload Velo's dashboard sends today (SDK 1.0.0's shape check rejects it after the HMAC passes).
const summary = (id: string, intentId = 'pi_1', test = false) =>
  JSON.stringify({ id, paymentIntentId: intentId, projectId: 'kh7', test, type: 'payment.succeeded' })

const event = (id: string, intentId = 'pi_1') =>
  JSON.stringify({
    version: '1',
    id,
    type: 'payment.succeeded',
    test: false,
    sentAt: new Date().toISOString(),
    project: { id: 'p', registryProjectId: '1', name: 'Envelo', slug: 'envelo' },
    paymentIntent: {
      id: intentId,
      amount: '1500.0000000',
      asset: 'native',
      merchantName: 'Envelo',
      status: 'paid',
      txHash: 'abc',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  })

describe.skipIf(!url)('POST /webhooks/velo', () => {
  let app: { request: (path: string, init?: RequestInit) => Response | Promise<Response> }
  let sql: typeof import('./db.ts').sql

  beforeAll(async () => {
    process.env.DATABASE_URL = url
    process.env.VELO_WEBHOOK_SECRET = SECRET
    const db = await import('./db.ts')
    const { createApp } = await import('./app.ts')
    const { veloRoutes, setVeloForTests } = await import('./velo.ts')
    // Fake Velo API: every intent is paid, 1500 XLM; 'pi_unpaid' is still pending.
    setVeloForTests({
      paymentIntents: {
        retrieve: async (id: string) => ({ id, status: id === 'pi_unpaid' ? 'pending' : 'paid', amount: '1500.0000000', asset: 'native' }),
      },
    } as never)
    await db.migrate()
    sql = db.sql
    app = createApp(db.dbOk).route('/', veloRoutes)
  })

  beforeEach(async () => {
    await sql`truncate set_asides, client_payments, invoices restart identity cascade`
  })

  const post = (body: string, signature: string) =>
    app.request('/webhooks/velo', { method: 'POST', body, headers: { 'x-velo-signature': signature } })
  const count = async () => (await sql`select count(*)::int as n from client_payments`)[0].n

  test('records a verified payment.succeeded without a browser session', async () => {
    const body = event('evt_1')
    const res = await post(body, sign(body))
    expect(res.status).toBe(200)
    expect(await count()).toBe(1)
    const [row] = await sql`select amount_stroops, period from client_payments`
    expect(row.amount_stroops).toBe('15000000000')
    expect(row.period).toMatch(/^\d{4}-\d{2}$/)
  })

  test('tampered body, wrong secret or missing signature → 400 and nothing recorded', async () => {
    const body = event('evt_2')
    expect((await post(body.replace('1500.0000000', '9999.0000000'), sign(body))).status).toBe(400)
    expect((await post(body, sign(body, 'wrong'))).status).toBe(400)
    expect((await post(body, '')).status).toBe(400)
    expect(await count()).toBe(0)
  })

  test('replaying the same event records the client payment once', async () => {
    const body = event('evt_3')
    for (let i = 0; i < 3; i++) expect((await post(body, sign(body))).status).toBe(200)
    expect(await count()).toBe(1)
  })

  test('a new delivery id for the same payment intent is still one client payment', async () => {
    const a = event('evt_4', 'pi_same')
    const b = event('evt_5', 'pi_same')
    await post(a, sign(a))
    await post(b, sign(b))
    expect(await count()).toBe(1)
  })

  test("Velo's summary payload is recorded, with the amount taken from the Velo API", async () => {
    const body = summary('evt_6', 'pi_summary')
    expect((await post(body, sign(body))).status).toBe(200)
    const [row] = await sql`select amount_stroops, payment_intent_id from client_payments`
    expect(row).toMatchObject({ amount_stroops: '15000000000', payment_intent_id: 'pi_summary' })
  })

  test('summary payload with a bad signature is still 400', async () => {
    const body = summary('evt_7')
    expect((await post(body, sign(body, 'wrong'))).status).toBe(400)
    expect(await count()).toBe(0)
  })

  test('not recorded when Velo says the intent is not paid, or the event is a test', async () => {
    const unpaid = summary('evt_8', 'pi_unpaid')
    const test = summary('evt_9', 'pi_t', true)
    expect((await post(unpaid, sign(unpaid))).status).toBe(200)
    expect((await post(test, sign(test))).status).toBe(200)
    expect(await count()).toBe(0)
  })
})
