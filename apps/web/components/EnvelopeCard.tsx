import { contributionRule } from '@envelo/shared'
import { date, deadlineLabel, explorer, peso } from '../lib/format'
import type { Envelope } from '../lib/types'

export function EnvelopeCard({
  envelope: e,
  income,
  retry,
  retrying,
}: {
  envelope: Envelope
  income: number
  retry: (id: string) => void
  retrying: boolean
}) {
  const empty = income <= 0 && e.setAsideCentavos <= 0
  const isFull = !empty && e.contributionCentavos > 0 && e.setAsideCentavos >= e.contributionCentavos
  const progress = e.contributionCentavos > 0
    ? Math.min(100, Math.max(0, (100 * e.setAsideCentavos) / e.contributionCentavos))
    : (empty ? 0 : 100)

  const isRemitted = e.remitted ?? false
  const isRefused = e.latest?.status === 'refused' || (e.latest?.reason?.toLowerCase().includes('refused') ?? false)
  const isStamped = isRemitted
  const isAttention = !empty && !isRemitted && (e.latest?.status === 'failed' || isRefused || isFull)

  const serial = e.deviceHash
    ? (e.deviceHash.startsWith('No.') ? e.deviceHash : `No. ${e.deviceHash.slice(0, 8)}`)
    : `No. ${e.agency.toUpperCase()}`

  const ruleText = empty
    ? (e.agency === 'sss'
        ? '15% of your Monthly Salary Credit, plus EC'
        : e.agency === 'philhealth'
        ? '5% of income, at least ₱500'
        : '4% of income, up to ₱400')
    : contributionRule(e.agency, income)

  const stateLabel = isRemitted
    ? 'Remitted'
    : isRefused
    ? 'Refused'
    : empty
    ? 'Waiting'
    : isFull
    ? 'Full · waiting'
    : 'Filling'

  const fillText = isRemitted
    ? (e.remittance ? `Remitted ${date(e.remittance.createdAt)}` : 'Remitted')
    : empty
    ? 'Nothing to seal yet'
    : `${peso(e.setAsideCentavos)} of ${peso(e.contributionCentavos)} sealed`

  return (
    <article
      className={`stub ${e.agency} ${empty ? 'waiting' : ''} ${isAttention ? 'attention' : ''} ${isStamped ? 'stamped' : ''}`}
    >
      <div className="top">
        <div>
          <div className="serial">{serial}</div>
          <h3>{e.label}</h3>
        </div>
        <div className="amt">
          {peso(e.setAsideCentavos)}
        </div>
      </div>

      <p className="why">{ruleText}</p>

      {!isStamped && (
        <div className="fill">
          <span className="track">
            <i style={{ width: `${progress}%`, ['--w' as any]: `${progress}%` }} />
          </span>
          <span>{fillText}</span>
        </div>
      )}

      <div className="meta">
        <span>
          {isRemitted && e.remittance ? (
            <>
              Receipt{' '}
              <a href={explorer(e.remittance.claimTxHash)} target="_blank" rel="noreferrer">
                {e.remittance.claimTxHash.slice(0, 4)}…{e.remittance.claimTxHash.slice(-3)}
              </a>
            </>
          ) : (
            <>
              Due <b>{date(e.deadline)}</b> · {deadlineLabel(e.deadline)}
            </>
          )}
        </span>
        <span className={`state ${isRefused ? 'refused' : ''}`}>{stateLabel}</span>
      </div>

      {isStamped && <div className="stamp">PAID</div>}

      {e.latest?.status === 'failed' && (
        <div className="error-text" role="alert" style={{ marginTop: '10px' }}>
          Set-aside failed: {e.latest.error || 'Unknown error'}{' '}
          <button
            type="button"
            className="text-button"
            disabled={retrying}
            onClick={() => retry(e.latest!.clientPaymentId)}
          >
            {retrying ? 'Retry started…' : 'Retry set-aside'}
          </button>
        </div>
      )}
    </article>
  )
}
