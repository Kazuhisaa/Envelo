'use client'

import { useState, type FormEvent } from 'react'
import { contributionsFor, formatPeso } from '@envelo/shared'
import { api } from '../lib/api'
import { parsePhp, phpToXlm } from '../lib/format'
import type { Invoice } from '../lib/types'

type Props = {
  rate: string | null
  onCreated: (invoice: Invoice) => void
}

export function InvoiceForm({ rate, onCreated }: Props) {
  const [clientName, setClientName] = useState('')
  const [description, setDescription] = useState('')
  const [amountPhp, setAmountPhp] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const centavos = parsePhp(amountPhp)
  let xlmString: string | null = null
  let conversionError: string | null = null

  if (centavos !== null) {
    if (!rate) {
      conversionError = 'Configured XLM/PHP exchange rate is unavailable.'
    } else {
      try {
        xlmString = phpToXlm(centavos, rate)
      } catch (err) {
        conversionError = err instanceof Error ? err.message : 'Amount is too small at this rate'
      }
    }
  }

  // Estimated set-asides
  const estimates = centavos !== null ? contributionsFor(centavos) : null

  const handleAmountChange = (val: string) => {
    // Strip any character that is not a digit or decimal point
    let clean = val.replace(/[^0-9.]/g, '')
    // Prevent multiple decimal points
    const parts = clean.split('.')
    if (parts.length > 2) {
      clean = parts[0] + '.' + parts.slice(1).join('')
    }
    // Limit to 2 decimal places
    if (parts.length === 2 && parts[1].length > 2) {
      clean = parts[0] + '.' + parts[1].slice(0, 2)
    }
    setAmountPhp(clean)
  }

  const handleAmountKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Allow control keys (Backspace, Tab, Enter, navigation, copy/paste)
    if (
      e.key === 'Backspace' ||
      e.key === 'Delete' ||
      e.key === 'Tab' ||
      e.key === 'ArrowLeft' ||
      e.key === 'ArrowRight' ||
      e.key === 'Enter' ||
      e.key === 'Home' ||
      e.key === 'End' ||
      e.ctrlKey ||
      e.metaKey
    ) {
      return
    }
    // Allow digits 0-9
    if (/^[0-9]$/.test(e.key)) {
      return
    }
    // Allow decimal point only if not already present
    if (e.key === '.' && !amountPhp.includes('.')) {
      return
    }
    // Disallow all letters and symbols
    e.preventDefault()
  }

  const canSubmit =
    clientName.trim().length >= 1 &&
    clientName.trim().length <= 100 &&
    description.trim().length <= 200 &&
    centavos !== null &&
    xlmString !== null &&
    !submitting

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit || !xlmString) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await api('/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientName: clientName.trim(),
          description: description.trim(),
          amountXlm: xlmString,
        }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = body.error || `Invoice creation failed (Status ${res.status})`
        throw new Error(msg)
      }

      const created: Invoice = await res.json()
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="form" onSubmit={onSubmit}>
      <div className="field">
        <label htmlFor="client-name">Client</label>
        <input
          id="client-name"
          className="input"
          placeholder="e.g. Northwind Co."
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="description">What it's for</label>
        <input
          id="description"
          className="input"
          placeholder="e.g. Landing page, November"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      <div className="field">
        <label htmlFor="amount-php">Amount</label>
        <div className="input-pre">
          <span>₱</span>
          <input
            id="amount-php"
            className="input"
            type="text"
            placeholder="0.00"
            value={amountPhp}
            onChange={(e) => handleAmountChange(e.target.value)}
            onKeyDown={handleAmountKeyDown}
            inputMode="decimal"
            autoComplete="off"
            spellCheck="false"
            required
          />
        </div>
        <span className="hint">
          {xlmString && rate ? (
            `Your client pays ≈ ${xlmString} XLM through the checkout link.`
          ) : conversionError ? (
            <span style={{ color: 'var(--red-ink)' }}>{conversionError}</span>
          ) : (
            'Enter the amount in Philippine Pesos.'
          )}
        </span>
      </div>

      {estimates && (
        <div className="field">
          <span className="hint">
            From this invoice I'd set aside about{' '}
            <b>{formatPeso(estimates.sss)} for SSS</b>,{' '}
            <b>{formatPeso(estimates.philhealth)} for PhilHealth</b> and{' '}
            <b>{formatPeso(estimates.pagibig)} for Pag-IBIG</b> if it's your only client payment this month.
          </span>
        </div>
      )}

      {error && (
        <div className="hint" style={{ color: 'var(--red-ink)', fontWeight: 600 }}>
          {error}
        </div>
      )}

      <button className="btn full" type="submit" disabled={!canSubmit}>
        {submitting ? 'Creating checkout link…' : 'Create checkout link'}
      </button>
    </form>
  )
}
