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

type Envelope = {
  agency: string
  label: string
  deadline: string
  contributionCentavos: number
  setAsideCentavos: number
  balanceXlm: string | null
  balanceCentavos: number | null
  latest?: {
    status: string
    amountCentavos: number
    txHash: string | null
    outerTxHash?: string | null
    innerTxHash?: string | null
    actualFeeStroops?: string | null
    reason: string
    error: string | null
    clientPaymentId: string
  }
}
type Envelopes = { period: string; incomeCentavos: number; envelopes: Envelope[]; notice: string | null; failed: boolean }

const OPEN = ['awaiting_route', 'created', 'pending']
const peso = (centavos: number | null) =>
  centavos === null ? '' : `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<ClientPayment[]>([])
  const [env, setEnv] = useState<Envelopes | null>(null)
  const [passcode, setLocal] = useState('')
  const [form, setForm] = useState({ clientName: '', amountXlm: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const [inv, cp, en] = await Promise.all([
        api('/invoices').then((r) => r.json()),
        api('/client-payments').then((r) => r.json()),
        api('/envelopes').then((r) => (r.ok ? r.json() : null)),
      ])
      setInvoices(inv)
      setPayments(cp)
      setEnv(en)
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

  // Poll while an invoice is still waiting for its client payment, or a set-aside is running.
  const waiting = invoices.some((i) => OPEN.includes(i.status)) || Boolean(env?.notice?.startsWith('Setting aside'))
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
      const body = await res.json().catch(() => null)
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong or missing demo passcode' : body?.error ?? `Server error (${res.status})`)
      setForm({ clientName: '', amountXlm: '', description: '' })
      await load()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  async function retrySetAside(clientPaymentId: string) {
    const res = await api(`/client-payments/${clientPaymentId}/set-aside`, { method: 'POST' })
    setError(res.ok ? '' : res.status === 401 ? 'Wrong or missing demo passcode' : 'Retry failed')
    if (res.ok) setTimeout(load, 5000)
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

      {env && (
        <section>
          <h2 style={{ marginBottom: 4 }}>Envelopes · {env.period}</h2>
          <small>Income this period: {peso(env.incomeCentavos)}</small>
          {env.notice && (
            <p role="status" style={{ background: '#f2f7ff', padding: 8, borderRadius: 8 }}>
              {env.notice}
            </p>
          )}
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
            {env.envelopes.map((e) => (
              <li key={e.agency} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                  <strong>{e.label}</strong>
                  <small>Deadline {new Date(e.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}</small>
                </div>
                <div>
                  Set aside {peso(e.setAsideCentavos)} of {peso(e.contributionCentavos)}
                </div>
                <small>
                  In envelope (on chain): {e.balanceXlm === null ? 'unavailable' : `${e.balanceXlm} XLM (${peso(e.balanceCentavos)})`}
                </small>
                {e.latest && (
                  <p style={{ margin: '8px 0 0', color: e.latest.status === 'failed' ? '#b42318' : undefined }}>
                    {e.latest.status === 'failed' ? `Set-aside failed: ${e.latest.error}` : e.latest.reason}{' '}
                    {e.latest.txHash && (
                      <a href={`https://stellar.expert/explorer/testnet/tx/${e.latest.txHash}`} target="_blank" rel="noreferrer">
                        tx
                      </a>
                    )}
                    {e.latest.outerTxHash && (
                      <span
                        title={`Fee sponsored by Velo Gas Station (actual fee: ${e.latest.actualFeeStroops ?? 0} stroops)`}
                        style={{
                          fontSize: '0.75rem',
                          background: '#e6f4ea',
                          color: '#137333',
                          border: '1px solid #ceead6',
                          padding: '2px 6px',
                          borderRadius: 4,
                          marginLeft: 6,
                          fontWeight: 500,
                        }}
                      >
                        ⚡ Sponsored by Velo Gas
                      </span>
                    )}
                    {e.latest.status === 'failed' && (
                      <button type="button" onClick={() => retrySetAside(e.latest!.clientPaymentId)} style={{ marginLeft: 8 }}>
                        Retry
                      </button>
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
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
