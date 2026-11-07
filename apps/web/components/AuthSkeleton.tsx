export function AuthSkeleton() {
  return (
    <div aria-busy="true" aria-label="Checking your session">
      <header className="bar">
        <div className="bar-in auth-bar-skeleton">
          <span className="skel" style={{ width: 112, height: 24 }} />
          <span className="grow" />
          <span className="skel" style={{ width: 148, height: 34, borderRadius: 8 }} />
          <span className="skel" style={{ width: 92, height: 34, borderRadius: 8 }} />
        </div>
      </header>
      <main className="page auth-page-skeleton">
        <div className="stack">
          <span className="skel" style={{ width: '45%', height: 34 }} />
          <span className="skel" style={{ width: '72%', height: 14 }} />
          <span className="skel" style={{ width: '100%', height: 170, borderRadius: 12 }} />
          <span className="skel" style={{ width: '100%', height: 170, borderRadius: 12 }} />
        </div>
        <div className="stack">
          <span className="skel" style={{ width: '38%', height: 24 }} />
          <span className="skel" style={{ width: '100%', height: 240, borderRadius: 12 }} />
        </div>
      </main>
    </div>
  )
}
