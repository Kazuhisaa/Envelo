'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { month } from '../lib/format'
import { useAuth } from './AuthProvider'
import { BrandLogo } from './BrandLogo'

function HeaderInner({ period: serverPeriod }: { period?: string | null }) {
  const activePeriod = serverPeriod ?? '2026-11'
  const { user, logout, loggingOut } = useAuth()

  const [period, setPeriod] = useState<string>(activePeriod)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const periodMenuRef = useRef<HTMLDivElement>(null)
  const periodBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setPeriod(serverPeriod ?? '2026-11')
  }, [serverPeriod])

  const handlePeriodChange = (val: string) => {
    setPeriod(val)
    setPeriodOpen(false)
  }

  // Account menu keyboard & click-outside handling
  useEffect(() => {
    if (accountOpen) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setAccountOpen(false)
          buttonRef.current?.focus()
        }
      }
      const onClickOutside = (e: MouseEvent) => {
        if (
          panelRef.current &&
          !panelRef.current.contains(e.target as Node) &&
          buttonRef.current &&
          !buttonRef.current.contains(e.target as Node)
        ) {
          setAccountOpen(false)
        }
      }
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('mousedown', onClickOutside)
      return () => {
        document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('mousedown', onClickOutside)
      }
    }
  }, [accountOpen])

  // Period dropdown keyboard & click-outside handling
  useEffect(() => {
    if (periodOpen) {
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setPeriodOpen(false)
          periodBtnRef.current?.focus()
        }
      }
      const onClickOutside = (e: MouseEvent) => {
        if (
          periodMenuRef.current &&
          !periodMenuRef.current.contains(e.target as Node) &&
          periodBtnRef.current &&
          !periodBtnRef.current.contains(e.target as Node)
        ) {
          setPeriodOpen(false)
        }
      }
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('mousedown', onClickOutside)
      return () => {
        document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('mousedown', onClickOutside)
      }
    }
  }, [periodOpen])

  return (
    <header className="bar">
      <div className="bar-in">
        <div className="mark-group">
          <Link href="/" className="mark" aria-label="Envelo Home">
            <BrandLogo />
            <span>Envelo</span>
          </Link>
          <span className="tagline">Your contributions, sealed and delivered.</span>
        </div>
        <span className="grow"></span>

        {/* Custom Period Dropdown */}
        <div className="period-dropdown-wrap">
          <button
            ref={periodBtnRef}
            className={`period-btn ${periodOpen ? 'active' : ''}`}
            type="button"
            aria-label="Select period"
            aria-haspopup="listbox"
            aria-expanded={periodOpen}
            onClick={() => {
              setAccountOpen(false)
              setPeriodOpen((prev) => !prev)
            }}
          >
            <span>{period === '2026-12' ? 'December 2026' : 'November 2026'}</span>
            <svg
              className="chevron"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {periodOpen && (
            <div ref={periodMenuRef} className="period-menu" role="listbox" aria-label="Available periods">
              <button
                type="button"
                className={`period-item ${period === '2026-11' ? 'selected' : ''}`}
                role="option"
                aria-selected={period === '2026-11'}
                onClick={() => handlePeriodChange('2026-11')}
              >
                <span>November 2026</span>
                {period === '2026-11' && (
                  <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
              <button
                type="button"
                className={`period-item ${period === '2026-12' ? 'selected' : ''}`}
                role="option"
                aria-selected={period === '2026-12'}
                onClick={() => handlePeriodChange('2026-12')}
              >
                <span>December 2026</span>
                {period === '2026-12' && (
                  <svg className="check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            </div>
          )}
        </div>

        <div className="account-menu-wrap" style={{ position: 'relative', flexShrink: 0 }}>
          <button
            ref={buttonRef}
            className={`lock account-button ${accountOpen ? 'active' : ''}`}
            type="button"
            aria-expanded={accountOpen}
            aria-haspopup="menu"
            onClick={() => {
              setPeriodOpen(false)
              setAccountOpen((value) => !value)
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
            </svg>{' '}
            <span className="lock-text-full account-email">{user.email}</span>
            <span className="lock-text-short">Account</span>
          </button>

          {accountOpen && (
            <div
              ref={panelRef}
              className="passcode-panel account-panel"
              role="menu"
              aria-label="Account menu"
              style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0 }}
            >
              <p className="account-panel-email">Signed in as <b>{user.email}</b></p>
              <button className="btn ghost full" type="button" role="menuitem" disabled={loggingOut} onClick={() => void logout()}>
                {loggingOut ? 'Signing out…' : 'Sign out'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

export function AppHeader({ period }: { period?: string | null }) {
  return (
    <Suspense
      fallback={
        <header className="bar">
          <div className="bar-in">
            <div className="mark-group">
              <Link href="/" className="mark" aria-label="Envelo Home">
                <BrandLogo />
                <span>Envelo</span>
              </Link>
              <span className="tagline">Your contributions, sealed and delivered.</span>
            </div>
            <span className="grow"></span>
              <div className="period-dropdown-wrap">
                <button className="period-btn" type="button" disabled aria-label="Period selector">
                  <span>November 2026</span>
                  <svg className="chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
              </div>
              <button className="lock" type="button" disabled>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                  <circle cx="12" cy="8" r="3.5" />
                  <path d="M5 20c.7-4 3-6 7-6s6.3 2 7 6" />
                </svg>{' '}
                <span>Account</span>
              </button>
            </div>
          </header>
        }
      >
      <HeaderInner period={period} />
    </Suspense>
  )
}

export function DemoFooter() {
  return (
    <p className="foot">
      Demo · not affiliated with SSS, PhilHealth or Pag-IBIG · Stellar Testnet
    </p>
  )
}
