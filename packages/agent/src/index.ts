import { AGENCIES, AGENCY_LABEL, type Agency } from '@envelo/shared'

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
export type PrioritizeResult = { amounts: Record<Agency, number>; reason: string }

/** Split `available` in proportion to `needed`, never above a need. Total ≤ available. */
export function proportionalSplit(availableCentavos: number, needed: Record<Agency, number>): Record<Agency, number> {
  const total = AGENCIES.reduce((s, a) => s + needed[a], 0)
  const amounts = { sss: 0, philhealth: 0, pagibig: 0 }
  if (total <= 0 || availableCentavos <= 0) return amounts
  for (const a of AGENCIES) amounts[a] = Math.min(needed[a], Math.floor((availableCentavos * needed[a]) / total))
  return amounts
}

/**
 * Called when a client payment can't cover every set-aside. #7 replaces the body with a Claude call
 * (with this proportional split as its fallback).
 */
export async function prioritizeSetAsides(input: PrioritizeInput): Promise<PrioritizeResult> {
  return {
    amounts: proportionalSplit(input.availableCentavos, input.needed),
    reason: `This client payment couldn't cover all three, so I split it in proportion to what each envelope still needs (${AGENCIES.map((a) => AGENCY_LABEL[a]).join(', ')}).`,
  }
}
