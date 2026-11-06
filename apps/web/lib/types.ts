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
  agencyAccount?: string | null
  remitted?: boolean
  remittance?: { amountXlm: string; amountPhpCentavos: number | null; authorizeTxHash: string; claimTxHash: string; createdAt: string } | null
  latest?: {
    status: 'pending' | 'funded' | 'failed'
    amountCentavos: number
    txHash: string | null
    outerTxHash?: string | null
    actualFeeStroops?: string | null
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
  clockNow?: string
  isSimulated?: boolean
}

export type Decision = {
  id: string
  agency: Agency
  period: string
  action: 'pay' | 'wait' | 'ask_user' | 'refused'
  amountXlm: string
  amountPhpCentavos: number | null
  reason: string
  model: string
  createdAt: string
}

export type Remittance = {
  id: string
  agency: Agency
  claimTxHash: string
  decisionId: string | null
  createdAt: string
}

export type Loadable<T> = { data: T | null; loading: boolean; error: string | null }
