import type { Agency } from '@envelo/shared'

export type PrioritizeInput = {
  /** PHP centavos this client payment can still set aside. */
  availableCentavos: number
  /** What each envelope still needs this period, in centavos. */
  needed: Record<Agency, number>
  deadlines: Record<Agency, Date>
  /** What each envelope already holds for this period, in centavos. */
  balances: Record<Agency, number>
  today: Date
}

export type PrioritizeResult = {
  amounts: Record<Agency, number>
  /** One sentence for the freelancer. */
  reason: string
  /** 'model' when the model's split was applied, 'fallback' for the proportional split. */
  source: 'model' | 'fallback'
}
