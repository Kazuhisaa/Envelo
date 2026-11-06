'use client'

import { useState } from 'react'
import { peso } from '../lib/format'
import type { Invoice } from '../lib/types'

export function CheckoutLink({ invoice }: { invoice: Invoice }) {
  const [copied, setCopied] = useState(false)

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(invoice.checkoutUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      window.prompt('Copy checkout link:', invoice.checkoutUrl)
    }
  }

  const isPaid = invoice.status === 'paid'

  return (
    <section>
      <h2 className="sec">Checkout link ready</h2>
      <div className="form">
        <p style={{ fontSize: '15px' }}>
          Send this to {invoice.clientName}. It stays open for 7 days.
        </p>

        <div className="link-out">
          <code>{invoice.checkoutUrl}</code>
          <button className="icon-btn" type="button" onClick={() => void onCopy()}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="11" height="11" rx="2" />
              <path d="M5 15V5a1 1 0 0 1 1-1h9" />
            </svg>{' '}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
          </button>
        </div>

        <div className="inv">
          <div className="inv-row">
            <span className="who">{invoice.clientName}</span>
            <span className="amt">{invoice.amountPhpCentavos !== null ? peso(invoice.amountPhpCentavos) : '₱12,500'}</span>
            <span className="sub">{invoice.description || 'Landing page, November'}</span>
            <span className="chip">{isPaid ? 'Paid' : 'Waiting for payment'}</span>
          </div>
        </div>
      </div>
    </section>
  )
}
