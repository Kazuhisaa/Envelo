import { date, peso } from '../lib/format'
import type { Envelopes } from '../lib/types'

export function PeriodSummary({
  data,
  paymentCount,
}: {
  data: Envelopes
  paymentCount?: number
}) {
  const setAside = data.envelopes.reduce((sum, envelope) => sum + envelope.setAsideCentavos, 0)
  const allBalancesAvailable = data.envelopes.every((e) => e.balanceCentavos !== null)
  const sealedTotal = allBalancesAvailable
    ? data.envelopes.reduce((sum, e) => sum + (e.balanceCentavos ?? 0), 0)
    : null


  // Format month name (e.g. "November 2026")
  const [year, mon] = data.period.split('-').map(Number)
  const monthName = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'Asia/Manila' }).format(
    new Date(Date.UTC(year, mon - 1, 1))
  )

  const upcomingDeadlines = data.envelopes
    .map((e) => e.deadline)
    .filter((d) => Date.parse(d) >= Date.now())
    .sort()

  const deadlineStr = upcomingDeadlines.length ? date(upcomingDeadlines[0]) : null


  let subtitle = 'New period'
  if (data.incomeCentavos > 0) {
    const countStr = typeof paymentCount === 'number' && paymentCount > 0
      ? `${paymentCount} client payment${paymentCount === 1 ? '' : 's'}`
      : 'Active period'
    subtitle = deadlineStr ? `${countStr} · next deadline ${deadlineStr}` : countStr
  }

  return (
    <section className="period" aria-labelledby="period-title">
      <h1 id="period-title">{monthName}</h1>
      <p className="sub">{subtitle}</p>
      <div className="totals">
        <div className="total">
          <span className="lbl">Received from clients</span>
          <span className="dots" aria-hidden="true"></span>
          <span>
            <span className="amt">{peso(data.incomeCentavos)}</span>
          </span>
        </div>
        <div className="total sealed">
          <span className="lbl">Sealed in envelopes</span>
          <span className="dots" aria-hidden="true"></span>
          <span>
            <span className="amt">
              {sealedTotal === null ? peso(setAside) : peso(sealedTotal)}
            </span>
          </span>
        </div>
      </div>
    </section>
  )
}
