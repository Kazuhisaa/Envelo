'use client'

import { useState } from 'react'
import Link from 'next/link'
import { explorer, peso, timestamp, xlm } from '../lib/format'
import type { ClientPayment, Envelope, Invoice } from '../lib/types'

type Props = {
  invoices: Invoice[]
  payments: ClientPayment[]
  envelopes: Envelope[]
}

type TabKey = 'all' | 'invoices' | 'payments'

export function RecentActivityCard({ invoices, payments, envelopes }: Props) {
  const [tab, setTab] = useState<TabKey>('all')
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyCheckout = async (inv: Invoice) => {
    try {
      await navigator.clipboard.writeText(inv.checkoutUrl)
      setCopiedId(inv.id)
      setTimeout(() => setCopiedId(null), 2500)
    } catch {
      window.prompt('Copy checkout link:', inv.checkoutUrl)
    }
  }

  // Combined activity feed sorted by date descending
  const agentActions = envelopes
    .map((e) => (e.latest ? { ...e.latest, agency: e.agency, agencyLabel: e.label, type: 'decision' as const } : null))
    .filter((x): x is NonNullable<typeof x> => x !== null)

  const allItems = [
    ...invoices.map((inv) => ({
      id: inv.id,
      type: 'invoice' as const,
      title: inv.clientName,
      sub: `${inv.description || 'Invoice'} · ${timestamp(inv.createdAt)}`,
      amountPhp: inv.amountPhpCentavos,
      amountXlm: inv.amountXlm,
      status: inv.status,
      date: inv.createdAt,
      checkoutUrl: inv.checkoutUrl,
    })),
    ...payments.map((p) => ({
      id: p.id,
      type: 'payment' as const,
      title: p.clientName || 'Direct Client Payment',
      sub: `Received ${timestamp(p.receivedAt)}`,
      amountPhp: p.amountPhpCentavos,
      amountXlm: p.amountXlm,
      status: 'received',
      date: p.receivedAt,
      txHash: p.txHash,
    })),
    ...agentActions.map((act) => ({
      id: `${act.agency}-${act.at}`,
      type: 'decision' as const,
      title: `${act.agencyLabel} Set-Aside`,
      sub: `${act.reason || (act.status === 'failed' ? act.error : 'Mandatory contribution sealed')} · ${timestamp(act.at)}`,
      amountPhp: act.amountCentavos,
      amountXlm: null,
      status: act.status,
      date: act.at,
      txHash: act.txHash,
    })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date))

  return (
    <div className="activity-card">
      {/* Header with Title, Tabs, and Primary Action */}
      <div className="activity-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <h3 className="section-title">Recent Activity</h3>
          <div className="tabs-group" role="tablist">
            <button
              type="button"
              className={`tab-btn ${tab === 'all' ? 'active' : ''}`}
              onClick={() => setTab('all')}
              role="tab"
              aria-selected={tab === 'all'}
            >
              All
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === 'invoices' ? 'active' : ''}`}
              onClick={() => setTab('invoices')}
              role="tab"
              aria-selected={tab === 'invoices'}
            >
              Invoices ({invoices.length})
            </button>
            <button
              type="button"
              className={`tab-btn ${tab === 'payments' ? 'active' : ''}`}
              onClick={() => setTab('payments')}
              role="tab"
              aria-selected={tab === 'payments'}
            >
              Payments ({payments.length})
            </button>
          </div>
        </div>

        <Link href="/invoices/new" className="btn-primary" style={{ padding: '6px 14px', fontSize: '13px' }}>
          + New Invoice
        </Link>
      </div>

      {/* Tab: All Activity */}
      {tab === 'all' && (
        <div className="activity-list">
          {allItems.length === 0 ? (
            <div className="empty-activity-box">
              <div className="empty-icon-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p>No recent invoices, payments, or agent set-aside actions yet.</p>
            </div>
          ) : (
            allItems.map((item) => (
              <div key={item.id} className="activity-row">
                <div className="activity-left">
                  <span className="activity-title">{item.title}</span>
                  <span className="activity-sub">{item.sub}</span>
                </div>
                <div className="activity-right">
                  {item.amountPhp !== null && (
                    <span className="activity-amt">{peso(item.amountPhp)}</span>
                  )}
                  {item.amountXlm && (
                    <span className="activity-amt-sub">{xlm(item.amountXlm)}</span>
                  )}
                  {item.type === 'invoice' && item.checkoutUrl && ['awaiting_route', 'created', 'pending'].includes(item.status) && (
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => void copyCheckout(item as any)}
                    >
                      {copiedId === item.id ? 'Copied link!' : 'Copy checkout link'}
                    </button>
                  )}
                  {item.type === 'payment' && item.txHash && (
                    <a href={explorer(item.txHash)} target="_blank" rel="noreferrer" className="link-btn">
                      Explorer ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Tab: Invoices Only */}
      {tab === 'invoices' && (
        <div className="activity-list">
          {invoices.length === 0 ? (
            <div className="empty-activity-box">
              <div className="empty-icon-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="2" y="4" width="20" height="16" rx="2" />
                  <line x1="6" y1="8" x2="18" y2="8" />
                  <line x1="6" y1="12" x2="14" y2="12" />
                </svg>
              </div>
              <p>No invoices created yet. Generate a Velo checkout link to invoice your clients.</p>
            </div>
          ) : (
            invoices.map((inv) => {
              const isOpen = ['awaiting_route', 'created', 'pending'].includes(inv.status)
              const isPaid = inv.status === 'paid'
              return (
                <div key={inv.id} className="activity-row">
                  <div className="activity-left">
                    <span className="activity-title">{inv.clientName}</span>
                    <span className="activity-sub">{inv.description || 'No description'} · {timestamp(inv.createdAt)}</span>
                  </div>
                  <div className="activity-right">
                    <span className="activity-amt">
                      {inv.amountPhpCentavos !== null ? peso(inv.amountPhpCentavos) : `${inv.amountXlm} XLM`}
                    </span>
                    <span className="activity-amt-sub">{xlm(inv.amountXlm)}</span>
                    <span className={`chip-status ${isPaid ? 'paid' : isOpen ? 'open' : ''}`}>
                      {isPaid ? 'Paid' : isOpen ? 'Awaiting Payment' : inv.status}
                    </span>
                    {isOpen && (
                      <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                        <button type="button" className="link-btn" onClick={() => void copyCheckout(inv)}>
                          {copiedId === inv.id ? 'Copied!' : 'Copy'}
                        </button>
                        <span>·</span>
                        <a href={inv.checkoutUrl} target="_blank" rel="noreferrer" className="link-btn">
                          Open ↗
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>
      )}

      {/* Tab: Payments Only */}
      {tab === 'payments' && (
        <div className="activity-list">
          {payments.length === 0 ? (
            <div className="empty-activity-box">
              <div className="empty-icon-circle">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                </svg>
              </div>
              <p>No client payments recorded yet for this period.</p>
            </div>
          ) : (
            payments.map((p) => (
              <div key={p.id} className="activity-row">
                <div className="activity-left">
                  <span className="activity-title">{p.clientName || 'Direct Client Payment'}</span>
                  <span className="activity-sub">Received {timestamp(p.receivedAt)}</span>
                </div>
                <div className="activity-right">
                  <span className="activity-amt">
                    {p.amountPhpCentavos !== null ? peso(p.amountPhpCentavos) : `${p.amountXlm} XLM`}
                  </span>
                  <span className="activity-amt-sub">{xlm(p.amountXlm)}</span>
                  {p.txHash ? (
                    <a href={explorer(p.txHash)} target="_blank" rel="noreferrer" className="link-btn">
                      View on Stellar Expert ↗
                    </a>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
