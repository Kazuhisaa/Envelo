import type { Agency } from '@envelo/shared'

export type Invoice = {
  id: string
  clientName: string
  description: string
  amountXlm: string
  amountPhpCentavos: number | null
  checkoutUrl: string
  status: string
  createdAt: string
}

export type ClientPayment = {
  id: string
  clientName: string | null
  amountXlm: string
  amountPhpCentavos: number | null
  txHash: string | null
  receivedAt: string
  period: string
}

export type Envelope = {
  agency: Agency
  label: string
  deviceHash: string
  deadline: string
  contributionCentavos: number
  setAsideCentavos: number
  balanceXlm: string | null
  balanceCentavos: number | null
  latest?: {
    status: 'funded' | 'failed' | 'refused'
    amountCentavos: number
    txHash: string | null
    reason: string
    error: string | null
    clientPaymentId: string
    at: string
  }
}

export type Envelopes = {
  period: string
  incomeCentavos: number
  envelopes: Envelope[]
  notice: string | null
  failed: boolean
}

export type Loadable<T> = { data: T | null; loading: boolean; error: string | null }
