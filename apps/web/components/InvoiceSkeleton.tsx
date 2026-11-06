export function InvoiceSkeleton() {
  return (
    <main className="page" aria-busy="true" aria-label="Loading invoice form">
      {/* Left Column (7fr) */}
      <div className="stack">
        <section className="period" aria-labelledby="skel-inv-title">
          <h1 id="skel-inv-title" style={{ margin: 0 }}>
            <span className="skel" style={{ width: '190px', height: '34px' }} />
          </h1>
          <p className="sub" style={{ marginTop: '6px', marginBottom: '16px' }}>
            <span className="skel" style={{ width: '380px', height: '14px', maxWidth: '90%' }} />
          </p>
        </section>

        <div className="form-card skel-card">
          <div className="form-field">
            <label>
              <span className="skel" style={{ width: '50px', height: '14px' }} />
            </label>
            <div className="input-wrap">
              <span className="skel" style={{ width: '100%', height: '42px', borderRadius: '8px' }} />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: '16px' }}>
            <label>
              <span className="skel" style={{ width: '90px', height: '14px' }} />
            </label>
            <div className="input-wrap">
              <span className="skel" style={{ width: '100%', height: '42px', borderRadius: '8px' }} />
            </div>
          </div>

          <div className="form-field" style={{ marginTop: '16px' }}>
            <label>
              <span className="skel" style={{ width: '110px', height: '14px' }} />
            </label>
            <div className="input-wrap">
              <span className="skel" style={{ width: '100%', height: '42px', borderRadius: '8px' }} />
            </div>
            <div style={{ marginTop: '8px' }}>
              <span className="skel" style={{ width: '220px', height: '12px' }} />
            </div>
          </div>

          <div style={{ marginTop: '24px' }}>
            <span className="skel" style={{ width: '100%', height: '46px', borderRadius: '8px' }} />
          </div>
        </div>
      </div>

      {/* Right Column (5fr) */}
      <div className="stack">
        <section className="preview-card skel-card" style={{ minHeight: '260px' }}>
          <div style={{ textAlign: 'center', padding: '32px 16px' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <span className="skel" style={{ width: '48px', height: '48px', borderRadius: '50%' }} />
            </div>
            <h3>
              <span className="skel" style={{ width: '180px', height: '18px' }} />
            </h3>
            <p style={{ marginTop: '8px' }}>
              <span className="skel" style={{ width: '260px', height: '13px', display: 'block', margin: '0 auto 6px' }} />
              <span className="skel" style={{ width: '160px', height: '13px', display: 'block', margin: '0 auto' }} />
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
