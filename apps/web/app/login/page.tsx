'use client'

import { Suspense, useEffect, useState, type FormEvent } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getDemoUser, signIn } from '../../components/AuthProvider'
import { LoginSkeleton } from '../../components/LoginSkeleton'
import { BrandLogo } from '../../components/BrandLogo'

function safeNext(value: string | null) {
  return value && value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !value.startsWith('/login') ? value : '/'
}

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    if (getDemoUser()) router.replace(safeNext(searchParams.get('next')))
    else setChecking(false)
  }, [router, searchParams])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    signIn(email.trim(), password)
    router.replace(safeNext(searchParams.get('next')))
  }

  // For judges: signs in with the demo passcode from NEXT_PUBLIC_DEMO_PASSCODE (public in the bundle, testnet only).
  function signInDemo() {
    signIn('demo@envelo.ph', process.env.NEXT_PUBLIC_DEMO_PASSCODE ?? '')
    router.replace(safeNext(searchParams.get('next')))
  }

  if (checking) return <LoginSkeleton />

  return (
    <main className="login-page">
      <div className="login-card-container">
        {/* Left side: Brand hero panel */}
        <aside className="login-hero-panel" aria-label="Envelo brand">
          <div className="login-hero-decor" aria-hidden="true">
            <svg className="login-contour-svg" viewBox="0 0 600 600" fill="none">
              <circle cx="300" cy="300" r="260" stroke="rgba(255, 255, 255, 0.08)" strokeWidth="1.5" />
              <circle cx="300" cy="300" r="190" stroke="rgba(255, 255, 255, 0.07)" strokeWidth="1.5" />
              <circle cx="300" cy="300" r="120" stroke="rgba(255, 255, 255, 0.06)" strokeWidth="1.5" />
            </svg>
          </div>

          <div className="login-hero-center">
            <div className="login-hero-brand-lockup">
              <BrandLogo size="display" />
              <div className="login-hero-text-group">
                <span className="login-hero-brand-text">Envelo</span>
                <p className="login-hero-tagline">Your contributions, safely enveloped.</p>
              </div>
            </div>
          </div>
        </aside>

        {/* Right side: Login form */}
        <section className="login-card" aria-labelledby="login-title">
          <div className="login-form-inner">
            <div className="login-intro">
              <h2 id="login-title" className="login-welcome-title">Welcome Back!</h2>
              <p className="login-copy">Any email works. Use the demo passcode as the password to make changes.</p>
            </div>

            <form className="login-form" onSubmit={submit}>
              <div className="field">
                <label htmlFor="login-email">Email address</label>
                <input
                  className="input"
                  id="login-email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="name@company.com"
                  maxLength={254}
                  autoFocus
                  required
                />
              </div>

              <div className="field">
                <label htmlFor="login-password">Password</label>
                <div className="password-input-wrap">
                  <input
                    className="input"
                    id="login-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="••••••••"
                    maxLength={1024}
                    required
                  />
                  <button
                    className="password-toggle"
                    type="button"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((value) => !value)}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6Z" />
                      <circle cx="12" cy="12" r="2.5" />
                      {showPassword && <path d="m4 4 16 16" />}
                    </svg>
                  </button>
                </div>
              </div>

              <button
                className="btn btn-login-primary"
                type="submit"
                disabled={!email.trim() || !password}
              >
                Login Now
              </button>

              <button className="btn ghost full" type="button" onClick={signInDemo}>
                Use Demo Account
              </button>

              <small className="login-mobile-disclaimer">
                Demo · Stellar Testnet only · Not affiliated with SSS, PhilHealth or Pag-IBIG
              </small>
            </form>
          </div>
        </section>
      </div>

      <footer className="login-page-footer">
        <small>Demo · Stellar Testnet only · Not affiliated with SSS, PhilHealth or Pag-IBIG</small>
      </footer>
    </main>
  )
}

export default function LoginPage() {
  return <Suspense fallback={<LoginSkeleton />}><LoginForm /></Suspense>
}
