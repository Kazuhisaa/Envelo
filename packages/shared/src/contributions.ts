import { DEADLINE_RULES, PAGIBIG, PHILHEALTH, SSS, type Agency, type Period } from './agencies.ts'

// All PHP amounts are integer centavos. Chain amounts are stroops (bigint, 1 XLM = 10^7).

const pct = (centavos: number, bps: number) => Math.round((centavos * bps) / 10_000)
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

export function sssMsc(incomeCentavos: number) {
  const bracket = Math.floor((incomeCentavos + SSS.mscRoundUp) / SSS.mscStep) * SSS.mscStep
  return clamp(bracket, SSS.mscMin, SSS.mscMax)
}

export function contributionFor(agency: Agency, incomeCentavos: number): number {
  switch (agency) {
    case 'sss': {
      const msc = sssMsc(incomeCentavos)
      return pct(msc, SSS.rateBps) + (msc < SSS.ecThreshold ? SSS.ecLow : SSS.ecHigh)
    }
    case 'philhealth':
      return pct(clamp(incomeCentavos, PHILHEALTH.incomeFloor, PHILHEALTH.incomeCeiling), PHILHEALTH.rateBps)
    case 'pagibig':
      return pct(Math.min(incomeCentavos, PAGIBIG.incomeCeiling), PAGIBIG.rateBps)
  }
}

/** ₱3,780 or ₱61.25: whole pesos without decimals. */
export function formatPeso(centavos: number): string {
  const whole = centavos % 100 === 0
  return `₱${(centavos / 100).toLocaleString('en-PH', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`
}

/** The rule behind an agency's contribution, in words the freelancer can read. */
export function contributionRule(agency: Agency, incomeCentavos: number): string {
  switch (agency) {
    case 'sss': {
      const msc = sssMsc(incomeCentavos)
      const ec = msc < SSS.ecThreshold ? SSS.ecLow : SSS.ecHigh
      return `${SSS.rateBps / 100}% of your ${formatPeso(msc)} MSC plus ${formatPeso(ec)} EC`
    }
    case 'philhealth': {
      const base = clamp(incomeCentavos, PHILHEALTH.incomeFloor, PHILHEALTH.incomeCeiling)
      const note = base === incomeCentavos ? '' : ` (counted as ${formatPeso(base)}, within ${formatPeso(PHILHEALTH.incomeFloor)}–${formatPeso(PHILHEALTH.incomeCeiling)})`
      return `${PHILHEALTH.rateBps / 100}% of your ${formatPeso(incomeCentavos)} income${note}`
    }
    case 'pagibig':
      return `${PAGIBIG.rateBps / 100}% of your income, counted up to ${formatPeso(PAGIBIG.incomeCeiling)}`
  }
}

export function contributionsFor(incomeCentavos: number): Record<Agency, number> {
  return {
    sss: contributionFor('sss', incomeCentavos),
    philhealth: contributionFor('philhealth', incomeCentavos),
    pagibig: contributionFor('pagibig', incomeCentavos),
  }
}

/** What still has to go into the envelope this period. Never negative. */
export function setAsideFor(agency: Agency, incomeCentavos: number, alreadyInEnvelopeCentavos: number) {
  return Math.max(0, contributionFor(agency, incomeCentavos) - alreadyInEnvelopeCentavos)
}

/** The period (calendar month in Philippine time, UTC+8) a moment falls in. */
export function periodOf(at: Date): Period {
  const ph = new Date(at.getTime() + 8 * 3_600_000)
  return `${ph.getUTCFullYear()}-${String(ph.getUTCMonth() + 1).padStart(2, '0')}` as Period
}

/** The deadline: 23:59:59 Philippine time on the agency's deadline date for the period. */
export function deadlineFor(agency: Agency, period: Period): Date {
  const [year, month] = period.split('-').map(Number)
  const { y, m, d } = DEADLINE_RULES[agency](year, month)
  return new Date(Date.UTC(y, m - 1, d, 15, 59, 59)) // 23:59:59 at UTC+8
}

// --- PHP <-> XLM. `xlmPhpRate` is PHP per 1 XLM as a decimal string, e.g. XLM_PHP_RATE="12.50".

const STROOPS_PER_XLM = 10_000_000n

function rateCentavos(xlmPhpRate: string): bigint {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(xlmPhpRate.trim())
  if (!m) throw new Error(`XLM_PHP_RATE must look like "12.50", got "${xlmPhpRate}"`)
  const r = BigInt(m[1]) * 100n + BigInt((m[2] ?? '').padEnd(2, '0'))
  if (r === 0n) throw new Error('XLM_PHP_RATE must be greater than 0')
  return r
}

const divRound = (a: bigint, b: bigint) => (a * 2n + b) / (2n * b) // a, b >= 0

export function phpToStroops(centavos: number, xlmPhpRate: string): bigint {
  if (!Number.isSafeInteger(centavos) || centavos < 0) throw new Error(`bad centavos: ${centavos}`)
  return divRound(BigInt(centavos) * STROOPS_PER_XLM, rateCentavos(xlmPhpRate))
}

export function stroopsToPhp(stroops: bigint, xlmPhpRate: string): number {
  if (stroops < 0n) throw new Error(`bad stroops: ${stroops}`)
  return Number(divRound(stroops * rateCentavos(xlmPhpRate), STROOPS_PER_XLM))
}
