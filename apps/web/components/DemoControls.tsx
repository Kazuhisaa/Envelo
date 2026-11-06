'use client'

import { useState } from 'react'

export function DemoControls({ refresh }: { refresh: () => void }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="docked-demo-drawer">
      {open && (
        <div className="demo-popover-panel">
          <div className="demo-popover-header">
            <div>
              <h3>Testnet Demo Controls</h3>
              <p>Simulate deadline & contract constraints</p>
            </div>
            <button
              type="button"
              className="link-btn"
              onClick={() => setOpen(false)}
              aria-label="Close demo controls"
            >
              ✕
            </button>
          </div>
          <div className="demo-actions-col">
            <button
              type="button"
              className="demo-action-btn"
              disabled
              title="Waiting on backend (#9)"
            >
              Fast-forward to deadline (Waiting on #9)
            </button>
            <button
              type="button"
              className="demo-action-btn"
              disabled
              title="Waiting on backend (#9)"
            >
              Try to break it: over limit (Waiting on #9)
            </button>
            <button
              type="button"
              className="demo-action-btn"
              disabled
              title="Waiting on backend (#9)"
            >
              Try to break it: expired (Waiting on #9)
            </button>
          </div>
        </div>
      )}

      <button
        type="button"
        className="demo-trigger-pill"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span style={{ fontSize: '14px' }}>⚡</span>
        <span>Demo Controls</span>
      </button>
    </div>
  )
}
