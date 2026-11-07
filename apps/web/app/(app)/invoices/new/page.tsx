'use client'

import { useEffect, useState } from 'react'
import { readApi } from '../../../../lib/api'
import { InvoiceForm } from '../../../../components/InvoiceForm'
import { CheckoutLink } from '../../../../components/CheckoutLink'
import { SectionState } from '../../../../components/SectionState'
import { InvoiceSkeleton } from '../../../../components/InvoiceSkeleton'
import type { Invoice } from '../../../../lib/types'

export default function NewInvoicePage() {
  const [rate, setRate] = useState<string | null>(null)
  const [loadingRate, setLoadingRate] = useState(true)
  const [rateError, setRateError] = useState<string | null>(null)
  const [createdInvoice, setCreatedInvoice] = useState<Invoice | null>(null)

  const fetchRate = async () => {
    setLoadingRate(true)
    setRateError(null)
    try {
      const res = await readApi<{ xlmPhpRate: string | null }>('/config')
      setRate(res.xlmPhpRate)
    } catch (err) {
      setRateError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingRate(false)
    }
  }

  useEffect(() => {
    void fetchRate()
  }, [])

  // Poll invoice status if created and awaiting payment
  useEffect(() => {
    if (!createdInvoice) return
    if (['paid', 'expired', 'failed'].includes(createdInvoice.status.toLowerCase())) return

    const timer = setInterval(async () => {
      try {
        const list = await readApi<Invoice[]>('/invoices')
        const updated = list.find((i: Invoice) => i.id === createdInvoice.id)
        if (updated) {
          setCreatedInvoice(updated)
        }
      } catch {}
    }, 4000)

    return () => clearInterval(timer)
  }, [createdInvoice])

  if (loadingRate) {
    return <InvoiceSkeleton />
  }

  return (
    <main className="page">
      {/* Left Column (7fr) */}
      <div className="stack">
        <section className="period">
          <h1>New invoice</h1>
          <p className="sub">
            Your client pays through a Velo checkout link. When the payment lands, I set aside your contributions.
          </p>
        </section>

        {rateError ? (
          <SectionState
            kind="error"
            message={`Could not load exchange rate: ${rateError}`}
            retry={fetchRate}
          />
        ) : (
          <InvoiceForm
            rate={rate}
            onCreated={(inv: Invoice) => setCreatedInvoice(inv)}
          />
        )}
      </div>

      {/* Right Column (5fr) */}
      <div className="stack">
        {createdInvoice ? (
          <CheckoutLink invoice={createdInvoice} />
        ) : (
          <section>
            <h2 className="sec">Checkout link ready</h2>
            <div className="form" style={{ color: 'var(--muted)', textAlign: 'center', padding: '32px 20px' }}>
              <p>Fill out and submit the invoice form to generate a payment checkout link.</p>
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
