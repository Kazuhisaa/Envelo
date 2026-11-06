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
  remitted?: boolean
  remittance?: {
    amountStroops: string
    amountXlm: string
    amountPhpCentavos: number | null
    authorizeTxHash: string
    claimTxHash: string
    createdAt: string
  } | null
  latest?: {
    status: string
    amountCentavos: number
    txHash: string | null
    reason: string
    error: string | null
    clientPaymentId: string
  }
}

type Envelopes = {
  period: string
  incomeCentavos: number
  envelopes: Envelope[]
  notice: string | null
  failed: boolean
  clockNow?: string
  isSimulated?: boolean
}

type Decision = {
  id: string
  agency: string
  period: string
  action: 'pay' | 'wait' | 'ask_user'
  amountStroops: string
  amountXlm: string
  amountPhpCentavos: number | null
  reason: string
  model: string
  createdAt: string
}

type Remittance = {
  id: string
  agency: string
  period: string
  amountStroops: string
  amountXlm: string
  amountPhpCentavos: number | null
  authorizeTxHash: string
  claimTxHash: string
  nonce: string
  decisionId: string | null
  reason: string | null
  createdAt: string
}

const OPEN = ['awaiting_route', 'created', 'pending']
const peso = (centavos: number | null) =>
  centavos === null ? '' : `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [rate, setRate] = useState<string | null>(null)
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [payments, setPayments] = useState<ClientPayment[]>([])
  const [env, setEnv] = useState<Envelopes | null>(null)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [remittances, setRemittances] = useState<Remittance[]>([])
  const [passcode, setLocal] = useState('')
  const [form, setForm] = useState({ clientName: '', amountXlm: '', description: '' })
  const [busy, setBusy] = useState(false)
  const [busyFastForward, setBusyFastForward] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState('')

  const load = useCallback(async () => {
    try {
      const [inv, cp, en, dec, rem] = await Promise.all([
        api('/invoices').then((r) => r.json()).catch(() => []),
        api('/client-payments').then((r) => r.json()).catch(() => []),
        api('/envelopes').then((r) => (r.ok ? r.json() : null)).catch(() => null),
        api('/agent/decisions').then((r) => (r.ok ? r.json() : [])).catch(() => []),
        api('/agent/remittances').then((r) => (r.ok ? r.json() : [])).catch(() => []),
      ])
      setInvoices(inv)
      setPayments(cp)
      setEnv(en)
      setDecisions(dec)
      setRemittances(rem)
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

  async function safeJson(res: Response) {
    try {
      return await res.json()
    } catch {
      const text = await res.text().catch(() => '')
      return { error: text || `HTTP ${res.status}` }
    }
  }

  async function createInvoice(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api('/invoices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form) })
      const body = await safeJson(res)
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong or missing demo passcode' : (body?.error ?? 'Request failed'))
      setForm({ clientName: '', amountXlm: '', description: '' })
      await load()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusy(false)
    }
  }

  async function handleFastForward() {
    setBusyFastForward(true)
    setError('')
    try {
      const res = await api('/agent/fast-forward', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      })
      const body = await safeJson(res)
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong or missing demo passcode' : (body?.error ?? 'Fast-forward failed'))
      await load()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusyFastForward(false)
    }
  }

  async function handleResetClock() {
    setBusyFastForward(true)
    setError('')
    try {
      const res = await api('/agent/reset-clock', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      })
      const body = await safeJson(res)
      if (!res.ok) throw new Error(res.status === 401 ? 'Wrong or missing demo passcode' : (body?.error ?? 'Reset failed'))
      await load()
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e))
    } finally {
      setBusyFastForward(false)
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
    <main style={{ maxWidth: 580, margin: '0 auto', display: 'grid', gap: 24, padding: '16px' }}>
      <header>
        <h1 style={{ marginBottom: 4 }}>Envelo</h1>
        <p style={{ margin: 0 }}>Your contributions, sealed and delivered.</p>
        <small style={{ color: '#57606a' }}>
          Demo · not affiliated with SSS, PhilHealth or Pag-IBIG · Stellar Testnet · server {health?.ok ? 'online' : '…'}
        </small>
      </header>

      {/* Agent fast-forward and clock controls */}
      <section style={{ border: '1px solid #c8e1ff', background: '#f6f8fa', borderRadius: 8, padding: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <h2 style={{ margin: '0 0 4px', fontSize: 18 }}>Agent controls</h2>
            <small style={{ color: '#57606a' }}>
              {env?.isSimulated
                ? `Clock: Simulated (${new Date(env.clockNow ?? '').toLocaleString('en-PH')})`
                : `Clock: Real time (${new Date().toLocaleDateString('en-PH')})`}
            </small>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              disabled={busyFastForward}
              onClick={handleFastForward}
              style={{
                background: '#0969da',
                color: '#fff',
                border: 'none',
                padding: '8px 14px',
                borderRadius: 6,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {busyFastForward ? 'Running…' : 'Fast-forward to deadline'}
            </button>
            {env?.isSimulated && (
              <button
                type="button"
                disabled={busyFastForward}
                onClick={handleResetClock}
                style={{
                  background: '#fff',
                  border: '1px solid #d0d7de',
                  padding: '8px 12px',
                  borderRadius: 6,
                  cursor: 'pointer',
                }}
              >
                Reset clock
              </button>
            )}
          </div>
        </div>
      </section>

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
          <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12, marginTop: 12 }}>
            {env.envelopes.map((e) => (
              <li key={e.agency} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <strong>{e.label}</strong>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {e.remitted ? (
                      <span
                        style={{
                          background: '#dafbe1',
                          color: '#1a7f37',
                          padding: '2px 8px',
                          borderRadius: 12,
                          fontWeight: 600,
                          fontSize: 12,
                        }}
                      >
                        Remitted ✓
                      </span>
                    ) : null}
                    <small style={{ color: '#57606a' }}>
                      Deadline {new Date(e.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </small>
                  </div>
                </div>

                <div style={{ marginTop: 6 }}>
                  Set aside {peso(e.setAsideCentavos)} of {peso(e.contributionCentavos)}
                </div>

                <small style={{ display: 'block', color: '#57606a' }}>
                  In envelope (on chain): {e.balanceXlm === null ? 'unavailable' : `${e.balanceXlm} XLM (${peso(e.balanceCentavos)})`}
                </small>

                {e.remittance && (
                  <div style={{ marginTop: 6, fontSize: 13, background: '#f6fdf8', padding: '6px 8px', borderRadius: 6 }}>
                    Remitted: {e.remittance.amountXlm} XLM {peso(e.remittance.amountPhpCentavos) && `(${peso(e.remittance.amountPhpCentavos)})`} ·{' '}
                    <a href={`https://stellar.expert/explorer/testnet/tx/${e.remittance.authorizeTxHash}`} target="_blank" rel="noreferrer">
                      Authorize tx ↗
                    </a>
                    {' · '}
                    <a href={`https://stellar.expert/explorer/testnet/tx/${e.remittance.claimTxHash}`} target="_blank" rel="noreferrer">
                      Claim tx ↗
                    </a>
                  </div>
                )}

                {e.latest && (
                  <p style={{ margin: '8px 0 0', color: e.latest.status === 'failed' ? '#b42318' : undefined, fontSize: 13 }}>
                    {e.latest.status === 'failed' ? `Set-aside failed: ${e.latest.error}` : e.latest.reason}{' '}
                    {e.latest.txHash && (
                      <a href={`https://stellar.expert/explorer/testnet/tx/${e.latest.txHash}`} target="_blank" rel="noreferrer">
                        tx
                      </a>
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

      {/* Decision log section */}
      <section>
        <h2>Decision log</h2>
        {decisions.length === 0 && <p style={{ color: '#57606a' }}>No decisions yet. Press &quot;Fast-forward to deadline&quot; to run the agent.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 10 }}>
          {decisions.map((d) => (
            <li
              key={d.id}
              style={{
                border: '1px solid #ddd',
                borderRadius: 8,
                padding: 12,
                background: d.action === 'pay' ? '#f6fdf8' : '#fff',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>
                  {d.agency.toUpperCase()} · Period {d.period}
                </strong>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: 12,
                      fontWeight: 600,
                      background: d.action === 'pay' ? '#dafbe1' : d.action === 'wait' ? '#fff8c5' : '#ddf4ff',
                      color: d.action === 'pay' ? '#1a7f37' : d.action === 'wait' ? '#9a6700' : '#0969da',
                    }}
                  >
                    {d.action.toUpperCase()}
                  </span>
                  <span style={{ fontSize: 11, background: '#f6f8fa', padding: '2px 6px', borderRadius: 4, color: '#57606a' }}>
                    {d.model}
                  </span>
                </div>
              </div>
              <p style={{ margin: '8px 0 4px', fontSize: 14 }}>{d.reason}</p>
              <small style={{ color: '#6e7781' }}>
                {new Date(d.createdAt).toLocaleString('en-PH')}
                {d.action === 'pay' && ` · Amount: ${d.amountXlm} XLM ${peso(d.amountPhpCentavos) ? `(${peso(d.amountPhpCentavos)})` : ''}`}
              </small>
            </li>
          ))}
        </ul>
      </section>

      {/* Remittance receipts section */}
      <section>
        <h2>Remittance receipts</h2>
        {remittances.length === 0 && <p style={{ color: '#57606a' }}>No remittances completed yet.</p>}
        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: 12 }}>
          {remittances.map((r) => (
            <li key={r.id} style={{ border: '1px solid #1a7f37', borderRadius: 8, padding: 12, background: '#f6fdf8' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <strong>
                  {r.agency.toUpperCase()} · {r.amountXlm} XLM {peso(r.amountPhpCentavos) && `(${peso(r.amountPhpCentavos)})`}
                </strong>
                <span style={{ color: '#1a7f37', fontWeight: 600, fontSize: 12 }}>Completed ✓</span>
              </div>
              <div style={{ fontSize: 13, marginTop: 4 }}>Period {r.period}</div>
              {r.reason && <p style={{ margin: '6px 0', fontSize: 13, color: '#24292f' }}>{r.reason}</p>}
              <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 13, flexWrap: 'wrap' }}>
                <a href={`https://stellar.expert/explorer/testnet/tx/${r.authorizeTxHash}`} target="_blank" rel="noreferrer">
                  Authorize tx ↗
                </a>
                <a href={`https://stellar.expert/explorer/testnet/tx/${r.claimTxHash}`} target="_blank" rel="noreferrer">
                  Claim tx ↗
                </a>
              </div>
              <small style={{ display: 'block', marginTop: 6, color: '#6e7781' }}>
                {new Date(r.createdAt).toLocaleString('en-PH')} · Nonce: {r.nonce}
              </small>
            </li>
          ))}
        </ul>
      </section>

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
