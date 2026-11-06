'use client'

import { useEffect, useState } from 'react'
import type { Health } from '@envelo/shared'
import { api, getPasscode, SERVER_URL, setPasscode } from '../lib/api'

export default function Dashboard() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState('')
  const [passcode, setLocal] = useState('')

  useEffect(() => {
    setLocal(getPasscode())
    api('/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e) => setError(String(e)))
  }, [])

  return (
    <main style={{ maxWidth: 480, margin: '0 auto' }}>
      <h1>Envelo</h1>
      <p>Your contributions, sealed and delivered.</p>
      <h2>Server health</h2>
      <p>
        <code>{SERVER_URL}/health</code>
      </p>
      {error ? <p role="alert">Server unreachable: {error}</p> : <pre>{health ? JSON.stringify(health, null, 2) : 'Loading…'}</pre>}
      <label>
        Demo passcode{' '}
        <input
          type="password"
          value={passcode}
          onChange={(e) => {
            setLocal(e.target.value)
            setPasscode(e.target.value)
          }}
        />
      </label>
    </main>
  )
}
