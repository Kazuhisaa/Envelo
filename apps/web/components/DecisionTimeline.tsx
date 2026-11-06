import { explorer, timestamp } from '../lib/format'
import type { Envelope } from '../lib/types'

export function DecisionTimeline({ envelopes }: { envelopes: Envelope[] }) {
  // Extract all available latest actions across envelopes
  const items = envelopes
    .map((e) => (e.latest ? { ...e.latest, label: e.label, agency: e.agency } : null))
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))

  return (
    <section aria-labelledby="timeline-heading">
      <div className="sec">
        <h2 id="timeline-heading">What I did</h2>
        <small>Showing latest action per envelope</small>
      </div>
      {items.length === 0 ? (
        <div className="section-state">
          <p>No agent actions recorded yet.</p>
        </div>
      ) : (
        <div className="notes">
          {items.map((item, idx) => {
            const isNow = idx === 0
            const isFailed = item.status === 'failed'
            return (
              <article key={`${item.agency}-${item.at}`} className={`note ${isNow ? 'now' : ''} ${isFailed ? 'refused' : ''}`}>
                <div className="when">
                  <span>{timestamp(item.at)}</span>
                  {item.txHash ? (
                    <a href={explorer(item.txHash)} target="_blank" rel="noreferrer">
                      View transaction ↗
                    </a>
                  ) : (
                    <span>No transaction submitted</span>
                  )}
                </div>
                <div className="tag">
                  {item.label} · {item.status.toUpperCase()}
                </div>
                <p>
                  <span>{item.reason || (isFailed ? item.error : 'Set-aside contribution.')}</span>
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
