import { Velo } from '@carts1024/velo-sdk'
import { toStroops, fromStroops } from '@noirx402/agent-sdk'
import { Hono } from 'hono'
import { periodOf, stroopsToPhp } from '@envelo/shared'
import { sql } from './db.ts'

let client: Velo | undefined
const velo = () => (client ??= new Velo({ apiKey: process.env.VELO_API_KEY ?? '', environment: 'testnet' }))

const rate = () => process.env.XLM_PHP_RATE ?? ''
const php = (stroops: bigint | string) => (rate() ? stroopsToPhp(BigInt(stroops), rate()) : null)
const OPEN = ['awaiting_route', 'created', 'pending']

type InvoiceRow = {
  id: string
  payment_intent_id: string
  client_name: string
  description: string
  amount_stroops: string
  checkout_url: string
  status: string
  created_at: Date
}
type ClientPaymentRow = {
  id: string
  event_id: string
  payment_intent_id: string
  invoice_id: string | null
  amount_stroops: string
  asset: string
  tx_hash: string | null
  received_at: Date
  period: string
}

const invoiceJson = (r: InvoiceRow) => ({
  id: r.id,
  paymentIntentId: r.payment_intent_id,
  clientName: r.client_name,
  description: r.description,
  amountXlm: fromStroops(BigInt(r.amount_stroops)),
  amountPhpCentavos: php(r.amount_stroops),
  checkoutUrl: r.checkout_url,
  status: r.status,
  createdAt: r.created_at,
})

/** Hook point for the set-aside (#6). Runs once per newly recorded client payment. */
export async function onClientPaymentRecorded(payment: ClientPaymentRow) {
  console.log(`client payment recorded: ${fromStroops(BigInt(payment.amount_stroops))} XLM, period ${payment.period}`)
}

export const veloRoutes = new Hono()

veloRoutes.get('/config', (c) => c.json({ xlmPhpRate: rate() || null }))

veloRoutes.post('/invoices', async (c) => {
  const body = await c.req.json().catch(() => null)
  const clientName = typeof body?.clientName === 'string' ? body.clientName.trim() : ''
  const description = typeof body?.description === 'string' ? body.description.trim() : ''
  let stroops: bigint
  try {
    stroops = toStroops(String(body?.amountXlm ?? ''))
  } catch {
    stroops = 0n
  }
  if (stroops <= 0n || !clientName || clientName.length > 100 || description.length > 200) {
    return c.json({ error: 'amountXlm (> 0, up to 7 decimals), clientName (1-100 chars) and description (up to 200) are required' }, 400)
  }

  const web = process.env.WEB_URL ?? 'http://localhost:3000'
  const intent = await velo().checkout.sessions.create({
    amount: fromStroops(stroops),
    asset: 'native',
    description: `${clientName}: ${description || 'Invoice'}`,
    successUrl: `${web}/?paid=1`,
    cancelUrl: `${web}/`,
  })
  if (!intent.checkoutUrl) return c.json({ error: 'Velo returned no checkout URL' }, 502)

  const [row] = await sql<InvoiceRow[]>`
    insert into invoices (payment_intent_id, client_name, description, amount_stroops, checkout_url, status)
    values (${intent.paymentIntentId}, ${clientName}, ${description}, ${stroops.toString()}, ${intent.checkoutUrl}, ${intent.status})
    returning *`
  return c.json(invoiceJson(row), 201)
})

veloRoutes.get('/invoices', async (c) => {
  const rows = await sql<InvoiceRow[]>`select * from invoices order by created_at desc limit 50`
  // Refresh open invoices from Velo; a failed lookup keeps the stored status.
  await Promise.all(
    rows
      .filter((r) => OPEN.includes(r.status))
      .map(async (r) => {
        try {
          const { status } = await velo().paymentIntents.retrieve(r.payment_intent_id)
          if (status !== r.status) {
            r.status = status
            await sql`update invoices set status = ${status} where id = ${r.id}`
          }
        } catch (e) {
          console.warn(`velo retrieve ${r.payment_intent_id} failed:`, e)
        }
      }),
  )
  return c.json(rows.map(invoiceJson))
})

veloRoutes.get('/client-payments', async (c) => {
  const rows = await sql<(ClientPaymentRow & { client_name: string | null })[]>`
    select cp.*, i.client_name from client_payments cp left join invoices i on i.id = cp.invoice_id
    order by cp.received_at desc limit 50`
  return c.json(
    rows.map((r) => ({
      id: r.id,
      clientName: r.client_name,
      amountXlm: fromStroops(BigInt(r.amount_stroops)),
      amountPhpCentavos: php(r.amount_stroops),
      txHash: r.tx_hash,
      receivedAt: r.received_at,
      period: r.period,
    })),
  )
})

// Exempt from the demo passcode: Velo calls it, and the signature check is the guard.
veloRoutes.post('/webhooks/velo', async (c) => {
  const raw = await c.req.text() // raw, unparsed body: the signature covers these exact bytes
  let event
  try {
    event = await Velo.webhooks.verify({
      payload: raw,
      signature: c.req.header('x-velo-signature') ?? '',
      secret: process.env.VELO_WEBHOOK_SECRET ?? '',
    })
  } catch {
    return c.json({ error: 'invalid signature' }, 400)
  }

  if (event.test || (event.type !== 'payment.succeeded' && event.type !== 'payment.failed')) return c.json({ ok: true })
  const pi = event.paymentIntent

  if (event.type === 'payment.failed') {
    await sql`update invoices set status = 'failed' where payment_intent_id = ${pi.id}`
    return c.json({ ok: true })
  }

  const receivedAt = new Date()
  const [row] = await sql<ClientPaymentRow[]>`
    insert into client_payments (event_id, payment_intent_id, invoice_id, amount_stroops, asset, tx_hash, received_at, period)
    values (
      ${event.id}, ${pi.id}, (select id from invoices where payment_intent_id = ${pi.id}),
      ${toStroops(pi.amount).toString()}, ${pi.asset}, ${pi.txHash ?? null}, ${receivedAt}, ${periodOf(receivedAt)}
    )
    on conflict do nothing
    returning *`
  await sql`update invoices set status = 'paid' where payment_intent_id = ${pi.id}`
  if (row) await onClientPaymentRecorded(row)
  return c.json({ ok: true, recorded: Boolean(row) })
})
