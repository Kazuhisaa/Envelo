'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import type { Health } from '@envelo/shared'
import { api, getPasscode, setPasscode } from '../lib/api'

type Invoice = {
  id: string
  clientName: string
  description: string
  amountXlm: string
  amountPhpCentavos: number | null
  checkoutUrl: string
  status: string
  createdAt: string
}
type ClientPayment = {
  id: string
  clientName: string | null
  amountXlm: string
  amountPhpCentavos: number | null
  txHash: string | null
  receivedAt: string
  period: string
}

const OPEN = ['awaiting_route', 'created', 'pending']
const peso = (centavos: number | null) =>
  centavos === null ? '' : `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<ClientPayment[]>([])
  const [passcode, setLocal] = useState('')
  const [form, setForm] = useState({ clientName: '', amountXlm: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const [inv, cp] = await Promise.all([api('/invoices').then((r) => r.json()), api('/client-payments').then((r) => r.json())])
      setInvoices(inv)
      setPayments(cp)
    } catch (e) {
      setError(`Server unreachable: ${e}`)
    }
  }, [])

  useEffect(() => {
    setLocal(getPasscode())
    api('/health').then((r) => r.json()).then(setHealth).catch(() => {})
    api('/config').then((r) => r.json()).then((c) => setRate(c.xlmPhpRate)).catch(() => {})
    load()
  }, [load])

  // Poll while an invoice is still waiting for its client payment.
  const waiting = invoices.some((i) => OPEN.includes(i.status))
  useEffect(() => {
    if (!waiting) return
    const t = setInterval(load, 5000)
    return () => clearInterval(t)
  }, [waiting, load])

  async function createInvoice(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api('/invoices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const body = await res.json()
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong or missing demo passcode' : body.error)
      setForm({ clientName: '', amountXlm: '', description: '' })
      await load()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(url)
    } catch {}
  }

  const previewPhp = rate && Number(form.amountXlm) > 0 ? Math.round(Number(form.amountXlm) * Number(rate) * 100) : null
  const newest = payments[0]

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', display: 'grid', gap: 24 }}>
      <header>
        <h1 style={{ marginBottom: 4 }}>Envelo</h1>
        <p style={{ margin: 0 }}>Your contributions, sealed and delivered.</p>
        <small>
          Demo · not affiliated with SSS, PhilHealth or Pag-IBIG · Stellar Testnet · server {health?.ok ? 'online' : '…'}
        </small>
      </header>

      {newest && Date.now() - new Date(newest.receivedAt).getTime() < 10 * 60_000 && (
        <section role="status" style={{ border: '2px solid #1a7f37', padding: 12, borderRadius: 8 }}>
          <strong>Client payment received</strong>
          <div>
            {newest.amountXlm} XLM {peso(newest.amountPhpCentavos) && `(${peso(newest.amountPhpCentavos)})`}
            {newest.clientName && ` from ${newest.clientName}`}
          </div>
        </section>
      )}

      <section>
        <h2>New invoice</h2>
        <form onSubmit={createInvoice} style={{ display: 'grid', gap: 8 }}>
          <label>
            Client name
            <input required maxLength={100} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} style={{ width: '100%' }} />
          </label>
          <label>
            Amount (XLM) {previewPhp !== null && <span>≈ {peso(previewPhp)}</span>}
            <input required inputMode="decimal" pattern="\d+(\.\d{1,7})?" value={form.amountXlm} onChange={(e) => setForm({ ...form, amountXlm: e.target.value })} style={{ width: '100%' }} />
          </label>
          <label>
            Description
            <input maxLength={200} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ width: '100%' }} />
          </label>
          <label>
            Demo passcode
            <input
              type="password"
              value={passcode}
              onChange={(e) => {
                setLocal(e.target.value)
                setPasscode(e.target.value)
              }}
              style={{ width: '100%' }}
            />
          </label>
          <button disabled={busy}>{busy ? 'Creating…' : 'Create invoice'}</button>
          {error && <p role="alert" style={{ color: '#b42318', margin: 0 }}>{error}</p>}
        </form>
      </section>

      <section>
        <h2>Invoices</h2>
        {invoices.length === 0 && <p>No invoices yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {invoices.map((i) => (
            <li key={i.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div>
                <strong>{i.clientName}</strong> · {i.amountXlm} XLM {peso(i.amountPhpCentavos) && `(${peso(i.amountPhpCentavos)})`} · <em>{i.status}</em>
              </div>
              {i.description && <div>{i.description}</div>}
              {OPEN.includes(i.status) && (
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <a href={i.checkoutUrl} target="_blank" rel="noreferrer">
                    Open checkout
                  </a>
                  <button type="button" onClick={() => copy(i.checkoutUrl)}>
                    {copied === i.checkoutUrl ? 'Copied' : 'Copy link'}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Client payments</h2>
        {payments.length === 0 && <p>No client payments yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {payments.map((p) => (
            <li key={p.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div>
                <strong>{p.amountXlm} XLM</strong> {peso(p.amountPhpCentavos) && `(${peso(p.amountPhpCentavos)})`}
                {p.clientName && ` · ${p.clientName}`}
              </div>
              <small>
                {new Date(p.receivedAt).toLocaleString('en-PH')} · period {p.period}
                {p.txHash && (
                  <>
                    {' · '}
                    <a href={`https://stellar.expert/explorer/testnet/tx/${p.txHash}`} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  </>
                )}
              </small>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
