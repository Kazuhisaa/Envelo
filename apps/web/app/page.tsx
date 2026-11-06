'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { EnvelopeCard } from '../components/EnvelopeCard'
import { PeriodSummary } from '../components/PeriodSummary'
import { SectionState } from '../components/SectionState'
import { DashboardSkeleton } from '../components/DashboardSkeleton'
import { useDashboardData } from '../hooks/useDashboardData'
import { api } from '../lib/api'
import { explorer } from '../lib/format'

function DashboardContent() {
  const searchParams = useSearchParams()
  const isSkeletonPreview = searchParams.get('sample') === 'loading' || searchParams.get('sample') === 'skeleton'

  const {
    envelopes,
    invoices,
    payments,
    decisions,
    remittances,
    rate,
    refresh,
    retrySetAside,
    retryingId,
  } = useDashboardData()
  const [clockBusy, setClockBusy] = useState(false)
  const [clockError, setClockError] = useState('')

  async function moveClock(path: '/agent/fast-forward' | '/agent/reset-clock') {
    setClockBusy(true)
    setClockError('')
    try {
      const res = await api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(res.status === 401 ? 'Wrong or missing demo passcode' : body.error || `Server returned ${res.status}`)
      }
      await refresh()
    } catch (e) {
      setClockError(e instanceof Error ? e.message : String(e))
    } finally {
      setClockBusy(false)
    }
  }

  // 1. Explicit skeleton preview
  if (isSkeletonPreview) {
    return <DashboardSkeleton isPreview={true} />
  }

  // 2. Initial live data fetch: display accurate skeleton while system is loading
  if (envelopes.loading && !envelopes.data) {
    return <DashboardSkeleton />
  }

  const periodData = envelopes.data
  const invoiceList = invoices.data ?? []

  const noteTime = (iso: string) =>
    new Intl.DateTimeFormat('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'Asia/Manila',
    }).format(new Date(iso))
  const shortHash = (h: string) => `${h.slice(0, 4)}…${h.slice(-3)}`

  const decisionNotes = decisions.map((d) => {
    const claim = remittances.find((r) => r.decisionId === d.id)?.claimTxHash
    return {
      id: d.id,
      sortAt: d.createdAt,
      at: noteTime(d.createdAt),
      tag: `${d.agency.toUpperCase()} · ${d.action === 'pay' ? 'REMITTED' : d.action.replace('_', ' ').toUpperCase()}`,
      reason: d.reason,
      txHash: claim ? shortHash(claim) : undefined,
      rawTxHash: claim ?? null,
      isNow: false,
    }
  })

  const liveNotes = (envelopes.data?.envelopes ?? [])
    .filter((e) => e.latest)
    .map((e) => ({
      id: `${e.agency}-${e.latest!.at}`,
      sortAt: e.latest!.at,
      at: new Intl.DateTimeFormat('en-PH', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Manila',
      }).format(new Date(e.latest!.at)),
      tag: e.latest!.status.toUpperCase(),
      reason:
        e.latest!.reason ||
        (e.latest!.status === 'failed'
          ? e.latest!.error || 'Failed'
          : 'Set aside contribution.'),
      txHash: e.latest!.txHash
        ? `${e.latest!.txHash.slice(0, 4)}…${e.latest!.txHash.slice(-3)}`
        : undefined,
      rawTxHash: e.latest!.txHash,
      isNow: true,
    }))

  const notesList = [...decisionNotes, ...liveNotes]
    .sort((a, b) => b.sortAt.localeCompare(a.sortAt))
    .map((n, i) => ({ ...n, isNow: i === 0 }))
  const isEmptyPeriod = Boolean(periodData && periodData.incomeCentavos <= 0)

  return (
    <main className="page">
      {/* Live Server Notice */}
      {envelopes.data?.notice && (
        <aside className="notice wide" role="status">
          {envelopes.data.notice}
        </aside>
      )}

      {/* Left Column (7fr) */}
      <div className="stack">
        {envelopes.loading && !periodData ? (
          <SectionState kind="loading" message="Loading contribution summary…" />
        ) : envelopes.error && !periodData ? (
          <SectionState kind="error" message={`Failed to load period: ${envelopes.error}`} retry={refresh} />
        ) : periodData ? (
          <>
            <PeriodSummary
              data={periodData}
              paymentCount={payments.data?.length}
              rate={rate.data}
            />

            {/* Empty State Callout when income is 0 */}
            {isEmptyPeriod && (
              <div className="empty">
                <h2 className="empty-h">No client payments yet this month</h2>
                <p>
                  Send an invoice. When your client pays, I'll work out what you owe SSS, PhilHealth and Pag-IBIG and seal it
                  away before you can spend it.
                </p>
                <Link href="/invoices/new" className="btn" style={{ justifySelf: 'start' }}>
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>{' '}
                  Create your first invoice
                </Link>
              </div>
            )}

            {/* Envelopes Section */}
            <section aria-labelledby="envelopes-heading">
              <h2 id="envelopes-heading" className="sec">
                Envelopes <small>This period</small>
              </h2>
              <div className="stubs">
                {periodData.envelopes.map((env) => (
                  <EnvelopeCard
                    key={env.agency}
                    envelope={env}
                    income={periodData.incomeCentavos}
                    retry={retrySetAside}
                    retrying={retryingId === env.latest?.clientPaymentId}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>

      {/* Right Column (5fr) */}
      <div className="stack">
        {/* What I did (Agent notes) */}
        <section aria-labelledby="notes-heading">
          <h2 id="notes-heading" className="sec">
            What I did <small>Agent notes</small>
          </h2>
          {envelopes.error && notesList.length === 0 ? (
            <SectionState kind="error" message={`Failed to load agent decisions: ${envelopes.error}`} retry={refresh} />
          ) : envelopes.loading && notesList.length === 0 ? (
            <SectionState kind="loading" message="Loading agent decisions…" />
          ) : (
            <div className="notes">
              {notesList.length === 0 ? (
                <div className="note">
                  <p className="muted" style={{ fontSize: '14px' }}>
                    No agent actions recorded yet this period.
                  </p>
                </div>
              ) : (
                notesList.map((note) => (
                  <div key={note.id} className={`note ${note.isNow ? 'now' : ''}`}>
                    <div className="when">
                      <span>{note.at}</span>
                      {note.txHash && (
                        <a
                          href={note.rawTxHash ? explorer(note.rawTxHash) : explorer(note.txHash)}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {note.txHash}{' '}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                            <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
                          </svg>
                        </a>
                      )}
                    </div>
                    <span className="tag">{note.tag}</span>
                    <p>{note.reason}</p>
                  </div>
                ))
              )}
            </div>
          )}
        </section>

        {/* Invoices */}
        <section aria-labelledby="invoices-heading">
          <h2 id="invoices-heading" className="sec">
            Invoices{' '}
            <Link
              className="btn ghost"
              href="/invoices/new"
              style={{ minHeight: 0, padding: '7px 12px', fontSize: '14px' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>{' '}
              New invoice
            </Link>
          </h2>
          {invoices.error && invoiceList.length === 0 ? (
            <SectionState kind="error" message={`Failed to load invoices: ${invoices.error}`} retry={refresh} />
          ) : invoices.loading && invoiceList.length === 0 ? (
            <SectionState kind="loading" message="Loading invoices…" />
          ) : (
            <div className="inv">
              {invoiceList.length === 0 ? (
                <div className="inv-row">
                  <span className="sub" style={{ gridColumn: '1/-1' }}>
                    No invoices this month.
                  </span>
                </div>
              ) : (
                invoiceList.map((inv) => (
                  <div key={inv.id} className="inv-row">
                    <span className="who">{inv.clientName}</span>
                    <span className="amt">
                      {inv.amountPhpCentavos ? `₱${(inv.amountPhpCentavos / 100).toLocaleString('en-PH')}` : `${inv.amountXlm} USDC`}
                    </span>
                    <span className="sub">{inv.description || 'Invoice'}</span>
                    <span className={`chip ${inv.status.toLowerCase() === 'paid' ? 'paid' : ''}`}>
                      {inv.status}
                    </span>
                  </div>
                ))
              )}
            </div>
          )}
        </section>
      </div>

      {/* Demo Controls Section */}
      <section className="tray wide" aria-labelledby="tray-h">
        <h2 id="tray-h">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
          </svg>{' '}
          Demo controls
        </h2>
        <p>
          Controls for the live demo. They need the demo passcode and don't exist for real users. Clock:{' '}
          {periodData?.isSimulated && periodData.clockNow
            ? `simulated, ${noteTime(periodData.clockNow)}`
            : 'real time'}
        </p>
        {clockError && (
          <p className="error-text" role="alert">
            {clockError}
          </p>
        )}
        <div className="acts">
          <button className="btn ghost" type="button" disabled={clockBusy} onClick={() => moveClock('/agent/fast-forward')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 6l8 6-8 6zM12 6l8 6-8 6z" />
            </svg>{' '}
            {clockBusy ? 'Running the agent…' : 'Fast-forward to deadline'}
          </button>
          {periodData?.isSimulated && (
            <button className="btn ghost" type="button" disabled={clockBusy} onClick={() => moveClock('/agent/reset-clock')}>
              Reset clock
            </button>
          )}
          <button className="btn ghost" type="button">
            Try to break it: pay over cap
          </button>
          <Link className="btn ghost" href="/?sample=loading">
            Try: skeleton loading
          </Link>
        </div>
      </section>
    </main>
  )
}

export default function Dashboard() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardContent />
    </Suspense>
  )
}
