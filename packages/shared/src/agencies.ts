// SAMPLE VALUES from third-party guides, not yet confirmed. See the "Verify contribution rates and
// deadlines against official sources" issue (#4). Every number lives here so a correction is one line.
// All PHP amounts are integer centavos (₱1 = 100).

export const AGENCIES = ['sss', 'philhealth', 'pagibig'] as const
export type Agency = (typeof AGENCIES)[number]

/** A period is a calendar month, written 'YYYY-MM'. */
export type Period = `${number}-${number}`

export const SSS = {
  rateBps: 1500, // 15% of the MSC
  mscMin: 5_000_00,
  mscMax: 35_000_00,
  mscStep: 500_00,
  mscRoundUp: 250_00, // MSC = floor((income + 250) / 500) * 500
  ecThreshold: 15_000_00,
  ecLow: 10_00, // EC when MSC < threshold
  ecHigh: 30_00,
}

export const PHILHEALTH = {
  rateBps: 500, // 5% of income
  incomeFloor: 10_000_00,
  incomeCeiling: 100_000_00,
}

export const PAGIBIG = {
  rateBps: 400, // 4% of income (self-employed pays both shares)
  incomeCeiling: 10_000_00,
}

// Deadline rules. `year`/`month` are the period's (month 1-12). Each returns the deadline's calendar date.
export const DEADLINE_RULES: Record<Agency, (year: number, month: number) => { y: number; m: number; d: number }> = {
  // Sources conflict (by SS number digit on the 10th/15th/20th, or last day of next month); we use the latter.
  sss: (y, m) => lastDayOf(y, m + 1),
  // Last business day of the period's own month.
  philhealth: (y, m) => lastWeekdayOf(y, m),
  // 10th of the next month.
  pagibig: (y, m) => ({ ...lastDayOf(y, m + 1), d: 10 }),
}

/** The agency names shown in the UI. */
export const AGENCY_LABEL: Record<Agency, string> = { sss: 'SSS', philhealth: 'PhilHealth', pagibig: 'Pag-IBIG' }

function lastDayOf(y: number, m: number) {
  const date = new Date(Date.UTC(y, m, 0)) // day 0 of the following month = last day of month m
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() }
}

// ponytail: weekends only, no PH holidays; add a holiday list if a deadline lands on one.
function lastWeekdayOf(y: number, m: number) {
  const last = lastDayOf(y, m)
  const dow = new Date(Date.UTC(last.y, last.m - 1, last.d)).getUTCDay()
  return { ...last, d: last.d - (dow === 0 ? 2 : dow === 6 ? 1 : 0) }
}
