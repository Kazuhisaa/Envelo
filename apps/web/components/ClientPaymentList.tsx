import { explorer, peso, timestamp, xlm } from '../lib/format'
import type { ClientPayment } from '../lib/types'

export function ClientPaymentList({ payments }: { payments: ClientPayment[] }) {
  return (
    <section aria-labelledby="payments-heading">
      <div className="sec">
        <h2 id="payments-heading">Recent client payments</h2>
      </div>
      {payments.length === 0 ? (
        <div className="section-state">
          <p>No client payments recorded yet.</p>
        </div>
      ) : (
        <div className="inv">
          {payments.map((p) => (
            <article key={p.id} className="inv-row">
              <div className="who">
                {p.clientName || 'Direct payment'}
                <div className="sub">Received {timestamp(p.receivedAt)}</div>
              </div>
              <div className="amt">
                {p.amountPhpCentavos !== null ? peso(p.amountPhpCentavos) : `${p.amountXlm} XLM`}
                <div className="xlm">{xlm(p.amountXlm)}</div>
              </div>
              <span className="chip paid">Received</span>
              {p.txHash ? (
                <div className="row-actions">
                  <a
                    href={explorer(p.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="receipt-link"
                  >
                    View transaction ↗
                  </a>
                </div>
              ) : (
                <div className="row-actions">
                  <span className="receipt-link muted">No transaction hash</span>
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
