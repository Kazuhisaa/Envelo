export function LoginSkeleton() {
  return (
    <main className="login-page" aria-busy="true" aria-label="Checking your session">
      <div className="login-card-container">
        <aside className="login-hero-panel" aria-hidden="true">
          <div className="login-hero-center">
            <div className="login-hero-brand-lockup">
              <span className="skel login-skel-logo" />
              <div className="login-hero-text-group">
                <span className="skel login-skel-brand" />
                <span className="skel login-skel-tagline" />
              </div>
            </div>
          </div>
        </aside>

        <section className="login-card skel-card">
          <div className="login-form-inner">
            <div className="login-intro">
              <span className="skel login-skel-title" />
              <span className="skel login-skel-subtitle" />
            </div>
            <div className="login-skeleton-fields">
              <span className="skel" style={{ width: 80, height: 13 }} />
              <span className="skel" style={{ width: '100%', height: 46, borderRadius: 10 }} />
              <span className="skel" style={{ width: 64, height: 13 }} />
              <span className="skel" style={{ width: '100%', height: 46, borderRadius: 10 }} />
              <span className="skel" style={{ width: '100%', height: 48, borderRadius: 12, marginTop: 6 }} />
              <span className="skel login-skel-mobile-disclaimer" />
            </div>
          </div>
        </section>
      </div>

      <footer className="login-page-footer">
        <span className="skel login-skel-footer" />
      </footer>
    </main>
  )
}
