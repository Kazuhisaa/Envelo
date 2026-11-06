import { useState } from 'react'
import Link from 'next/link'
import { peso, timestamp, xlm } from '../lib/format'
import type { Invoice } from '../lib/types'

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
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

  return (
    <section aria-labelledby="invoices-heading">
      <div className="sec">
        <h2 id="invoices-heading">Recent invoices</h2>
        <Link href="/invoices/new" className="btn compact">
          + New invoice
        </Link>
      </div>
      {invoices.length === 0 ? (
        <div className="section-state">
          <p>No invoices created yet.</p>
        </div>
      ) : (
        <div className="inv">
          {invoices.map((inv) => {
            const isOpen = ['awaiting_route', 'created', 'pending'].includes(inv.status)
            const isPaid = inv.status === 'paid'
            return (
              <article key={inv.id} className="inv-row">
                <div className="who">
                  {inv.clientName}
                  <div className="sub">{inv.description || 'No description'} · {timestamp(inv.createdAt)}</div>
                </div>
                <div className="amt">
                  {inv.amountPhpCentavos !== null ? peso(inv.amountPhpCentavos) : `${inv.amountXlm} XLM`}
                  <div className="xlm">{xlm(inv.amountXlm)}</div>
                </div>
                <span className={`chip ${isPaid ? 'paid' : ''}`}>
                  {isPaid ? 'Paid' : isOpen ? 'Awaiting payment' : inv.status}
                </span>
                {isOpen && (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void copyCheckout(inv)}
                    >
                      {copiedId === inv.id ? 'Copied checkout link!' : 'Copy link'}
                    </button>
                    <span>·</span>
                    <a
                      href={inv.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-button"
                    >
                      Open checkout ↗
                    </a>
                  </div>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
