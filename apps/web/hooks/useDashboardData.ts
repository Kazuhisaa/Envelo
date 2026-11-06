'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { api, readApi } from '../lib/api'
import type { ClientPayment, Decision, Envelopes, Invoice, Loadable, Remittance } from '../lib/types'

const initial = <T,>(): Loadable<T> => ({ data: null, loading: true, error: null })

export function useDashboardData() {
  const [envelopes, setEnvelopes] = useState<Loadable<Envelopes>>(initial)
  const [invoices, setInvoices] = useState<Loadable<Invoice[]>>(initial)
  const [payments, setPayments] = useState<Loadable<ClientPayment[]>>(initial)
  const [decisions, setDecisions] = useState<Decision[]>([])
  const [remittances, setRemittances] = useState<Remittance[]>([])
  const [rate, setRate] = useState<Loadable<string | null>>(initial)
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [pendingUntil, setPendingUntil] = useState<number | null>(null)

  const active = useRef(false)
  const running = useRef(false)
  const queued = useRef(false)

  const refresh = useCallback(async () => {
    if (running.current) {
      queued.current = true
      return
    }
    running.current = true
    try {
      // Each section updates as soon as its own request lands; /envelopes reads the chain and is the slow one.
      const load = <T,>(path: string, set: (update: (prev: Loadable<T>) => Loadable<T>) => void) =>
        readApi<T>(path).then(
          (data) => active.current && set(() => ({ data, loading: false, error: null })),
          (e) => active.current && set((prev) => ({ ...prev, loading: false, error: e instanceof Error ? e.message : String(e) })),
        )
      await Promise.all([
        load<Envelopes>('/envelopes', setEnvelopes),
        load<Invoice[]>('/invoices', setInvoices),
        load<ClientPayment[]>('/client-payments', setPayments),
        readApi<Decision[]>('/agent/decisions').then((d) => active.current && setDecisions(d), () => {}),
        readApi<Remittance[]>('/agent/remittances').then((r) => active.current && setRemittances(r), () => {}),
      ])
    } finally {
      running.current = false
      if (queued.current) {
        queued.current = false
        void refresh()
      }
    }
  }, [])

  const fetchConfig = useCallback(async () => {
    try {
      const { xlmPhpRate } = await readApi<{ xlmPhpRate: string | null }>('/config')
      if (active.current) setRate({ data: xlmPhpRate, loading: false, error: null })
    } catch (error) {
      if (active.current) {
        setRate((prev) => ({ ...prev, loading: false, error: error instanceof Error ? error.message : String(error) }))
      }
    }
  }, [])

  const retrySetAside = useCallback(
    async (clientPaymentId: string) => {
      setRetryingId(clientPaymentId)
      try {
        const res = await api(`/client-payments/${encodeURIComponent(clientPaymentId)}/set-aside`, {
          method: 'POST',
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          throw new Error(body.error || `Retry failed with status ${res.status}`)
        }
        setPendingUntil(Date.now() + 60_000)
        void refresh()
      } finally {
        setRetryingId(null)
      }
    },
    [refresh],
  )

  useEffect(() => {
    active.current = true
    void refresh()
    void fetchConfig()
    return () => {
      active.current = false
    }
  }, [refresh, fetchConfig])

  // Bounded poll (every 5s for up to 2 minutes while pending)
  useEffect(() => {
    const hasPendingInvoices = invoices.data?.some((i) => ['awaiting_route', 'created', 'pending'].includes(i.status))
    const hasNotice = envelopes.data?.notice?.startsWith('Setting aside')
    const hasPendingTimer = pendingUntil !== null && Date.now() < pendingUntil

    if (!hasPendingInvoices && !hasNotice && !hasPendingTimer) return

    const timer = window.setInterval(() => {
      void refresh()
      if (pendingUntil !== null && Date.now() >= pendingUntil) {
        setPendingUntil(null)
      }
    }, 5000)

    return () => window.clearInterval(timer)
  }, [invoices.data, envelopes.data?.notice, pendingUntil, refresh])

  return {
    envelopes,
    invoices,
    payments,
    decisions,
    remittances,
    rate,
    refresh,
    fetchConfig,
    retrySetAside,
    retryingId,
    setPendingUntil,
  }
}
