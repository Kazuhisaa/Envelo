import Link from 'next/link'

export function DashboardSkeleton({ isPreview = false }: { isPreview?: boolean }) {
  return (
    <main className="page" aria-busy="true" aria-label="Loading dashboard data">
      {isPreview && (
        <aside
          className="notice wide"
          role="status"
          style={{
            borderLeftColor: 'var(--highlight)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>
            <b>Skeleton preview active</b> · Accurate placeholder matching what the system loads.
          </span>
          <Link href="/" className="text-button" style={{ fontWeight: 600 }}>
            Exit preview
          </Link>
        </aside>
      )}

      {/* Left Column (7fr) */}
      <div className="stack">
        {/* Period Totals Section */}
        <section className="period" aria-labelledby="skel-period-title">
          <h1 id="skel-period-title" style={{ margin: 0 }}>
            <span className="skel" style={{ width: '220px', height: '34px', maxWidth: '70%' }} />
          </h1>
          <p className="sub" style={{ marginTop: '6px', marginBottom: '16px' }}>
            <span className="skel" style={{ width: '280px', height: '14px', maxWidth: '85%' }} />
          </p>

          <div className="totals">
            <div className="total">
              <span className="lbl">
                <span className="skel" style={{ width: '145px', height: '14px' }} />
              </span>
              <span className="dots" aria-hidden="true" />
              <span>
                <span className="amt">
                  <span className="skel" style={{ width: '92px', height: '22px' }} />
                </span>
                <span className="xlm">
                  <span className="skel" style={{ width: '78px', height: '12px', marginTop: '4px' }} />
                </span>
              </span>
            </div>

            <div className="total sealed">
              <span className="lbl">
                <span className="skel" style={{ width: '135px', height: '14px' }} />
              </span>
              <span className="dots" aria-hidden="true" />
              <span>
                <span className="amt">
                  <span className="skel" style={{ width: '84px', height: '22px' }} />
                </span>
                <span className="xlm">
                  <span className="skel" style={{ width: '82px', height: '12px', marginTop: '4px' }} />
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* Envelopes Section */}
        <section>
          <h2 className="sec">
            Envelopes <small>This period</small>
          </h2>

          <div className="stubs">
            {/* SSS Envelope Skeleton */}
            <article className="stub skel-card">
              <div className="top">
                <div>
                  <div className="serial">
                    <span className="skel" style={{ width: '96px', height: '12px' }} />
                  </div>
                  <h3>
                    <span className="skel" style={{ width: '48px', height: '18px', marginTop: '4px' }} />
                  </h3>
                </div>
                <div className="amt">
                  <span className="skel" style={{ width: '88px', height: '24px' }} />
                  <small>
                    <span className="skel" style={{ width: '78px', height: '12px', marginTop: '4px' }} />
                  </small>
                </div>
              </div>

              <p className="why" style={{ margin: '10px 0 0' }}>
                <span className="skel" style={{ width: '86%', height: '13px', display: 'block', marginBottom: '6px' }} />
                <span className="skel" style={{ width: '52%', height: '13px', display: 'block' }} />
              </p>

              <div className="fill">
                <span className="track">
                  <i style={{ width: '35%', opacity: 0.18 }} />
                </span>
                <span>
                  <span className="skel" style={{ width: '130px', height: '12px' }} />
                </span>
              </div>

              <div className="meta">
                <span>
                  <span className="skel" style={{ width: '140px', height: '13px' }} />
                </span>
                <span className="state" style={{ borderColor: 'transparent', padding: 0 }}>
                  <span className="skel" style={{ width: '74px', height: '18px', borderRadius: '4px' }} />
                </span>
              </div>
            </article>

            {/* PhilHealth Envelope Skeleton */}
            <article className="stub skel-card">
              <div className="top">
                <div>
                  <div className="serial">
                    <span className="skel" style={{ width: '92px', height: '12px' }} />
                  </div>
                  <h3>
                    <span className="skel" style={{ width: '76px', height: '18px', marginTop: '4px' }} />
                  </h3>
                </div>
                <div className="amt">
                  <span className="skel" style={{ width: '80px', height: '24px' }} />
                  <small>
                    <span className="skel" style={{ width: '72px', height: '12px', marginTop: '4px' }} />
                  </small>
                </div>
              </div>

              <p className="why" style={{ margin: '10px 0 0' }}>
                <span className="skel" style={{ width: '56%', height: '13px', display: 'block' }} />
              </p>

              <div className="fill">
                <span className="track">
                  <i style={{ width: '65%', opacity: 0.18 }} />
                </span>
                <span>
                  <span className="skel" style={{ width: '120px', height: '12px' }} />
                </span>
              </div>

              <div className="meta">
                <span>
                  <span className="skel" style={{ width: '115px', height: '13px' }} />
                </span>
                <span className="state" style={{ borderColor: 'transparent', padding: 0 }}>
                  <span className="skel" style={{ width: '66px', height: '18px', borderRadius: '4px' }} />
                </span>
              </div>
            </article>

            {/* Pag-IBIG Envelope Skeleton */}
            <article className="stub skel-card">
              <div className="top">
                <div>
                  <div className="serial">
                    <span className="skel" style={{ width: '94px', height: '12px' }} />
                  </div>
                  <h3>
                    <span className="skel" style={{ width: '68px', height: '18px', marginTop: '4px' }} />
                  </h3>
                </div>
                <div className="amt">
                  <span className="skel" style={{ width: '64px', height: '24px' }} />
                  <small>
                    <span className="skel" style={{ width: '68px', height: '12px', marginTop: '4px' }} />
                  </small>
                </div>
              </div>

              <p className="why" style={{ margin: '10px 0 0' }}>
                <span className="skel" style={{ width: '68%', height: '13px', display: 'block' }} />
              </p>

              <div className="fill">
                <span className="track">
                  <i style={{ width: '25%', opacity: 0.18 }} />
                </span>
                <span>
                  <span className="skel" style={{ width: '128px', height: '12px' }} />
                </span>
              </div>

              <div className="meta">
                <span>
                  <span className="skel" style={{ width: '134px', height: '13px' }} />
                </span>
                <span className="state" style={{ borderColor: 'transparent', padding: 0 }}>
                  <span className="skel" style={{ width: '74px', height: '18px', borderRadius: '4px' }} />
                </span>
              </div>
            </article>
          </div>
        </section>
      </div>

      {/* Right Column (5fr) */}
      <div className="stack">
        {/* Agent Notes Section */}
        <section>
          <h2 className="sec">
            What I did <small>Agent notes</small>
          </h2>

          <div className="notes">
            <div className="note">
              <div className="when">
                <span>
                  <span className="skel" style={{ width: '92px', height: '12px' }} />
                </span>
                <span className="skel" style={{ width: '56px', height: '12px' }} />
              </div>
              <span className="tag" style={{ borderColor: 'transparent', padding: 0 }}>
                <span className="skel" style={{ width: '64px', height: '18px', borderRadius: '4px' }} />
              </span>
              <p style={{ marginTop: '8px' }}>
                <span className="skel" style={{ width: '92%', height: '13px', display: 'block', marginBottom: '6px' }} />
                <span className="skel" style={{ width: '60%', height: '13px', display: 'block' }} />
              </p>
            </div>

            <div className="note">
              <div className="when">
                <span>
                  <span className="skel" style={{ width: '84px', height: '12px' }} />
                </span>
              </div>
              <span className="tag" style={{ borderColor: 'transparent', padding: 0 }}>
                <span className="skel" style={{ width: '58px', height: '18px', borderRadius: '4px' }} />
              </span>
              <p style={{ marginTop: '8px' }}>
                <span className="skel" style={{ width: '96%', height: '13px', display: 'block', marginBottom: '6px' }} />
                <span className="skel" style={{ width: '78%', height: '13px', display: 'block' }} />
              </p>
            </div>

            <div className="note">
              <div className="when">
                <span>
                  <span className="skel" style={{ width: '88px', height: '12px' }} />
                </span>
                <span className="skel" style={{ width: '56px', height: '12px' }} />
              </div>
              <span className="tag" style={{ borderColor: 'transparent', padding: 0 }}>
                <span className="skel" style={{ width: '68px', height: '18px', borderRadius: '4px' }} />
              </span>
              <p style={{ marginTop: '8px' }}>
                <span className="skel" style={{ width: '94%', height: '13px', display: 'block', marginBottom: '6px' }} />
                <span className="skel" style={{ width: '82%', height: '13px', display: 'block', marginBottom: '6px' }} />
                <span className="skel" style={{ width: '45%', height: '13px', display: 'block' }} />
              </p>
            </div>
          </div>
        </section>

        {/* Invoices Section */}
        <section>
          <h2 className="sec">
            Invoices{' '}
            <span
              className="skel"
              style={{ width: '106px', height: '28px', borderRadius: '6px', marginLeft: 'auto' }}
            />
          </h2>

          <div className="inv">
            {[
              { whoW: '115px', subW: '150px', amtW: '68px' },
              { whoW: '100px', subW: '165px', amtW: '76px' },
              { whoW: '125px', subW: '140px', amtW: '72px' },
            ].map((row, idx) => (
              <div key={idx} className="inv-row">
                <span className="who">
                  <span className="skel" style={{ width: row.whoW, height: '15px' }} />
                </span>
                <span className="amt">
                  <span className="skel" style={{ width: row.amtW, height: '15px' }} />
                </span>
                <span className="sub">
                  <span className="skel" style={{ width: row.subW, height: '13px' }} />
                </span>
                <span className="chip" style={{ borderColor: 'transparent', padding: 0 }}>
                  <span className="skel" style={{ width: '42px', height: '18px', borderRadius: '4px' }} />
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Demo Controls Tray Section */}
      <section className="tray wide" aria-labelledby="skel-tray-h">
        <h2 id="skel-tray-h">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4a2 2 0 0 0 1.8-3l-5-9V3" />
          </svg>{' '}
          Demo controls
        </h2>
        <p>Controls for the live demo; they don't exist for real users.</p>
        <div className="acts">
          <button className="btn ghost" type="button" disabled>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 6l8 6-8 6zM12 6l8 6-8 6z" />
            </svg>{' '}
            Fast-forward to deadline
          </button>
          <button className="btn ghost" type="button" disabled>
            Try: pay over the cap
          </button>
          <button className="btn ghost" type="button" disabled>
            Try: pay last month's envelope
          </button>
        </div>
      </section>
    </main>
  )
}
