'use client'

import Link from 'next/link'
import { Suspense, useEffect, useRef, useState } from 'react'
import { getPasscode, setPasscode } from '../lib/api'
import { month } from '../lib/format'

function HeaderInner({ period: serverPeriod }: { period?: string | null }) {
  const activePeriod = serverPeriod ?? '2026-11'

  const [period, setPeriod] = useState<string>(activePeriod)
  const [periodOpen, setPeriodOpen] = useState(false)
  const [open, setOpen] = useState(false)
  const [passcode, setLocal] = useState('')
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const periodMenuRef = useRef<HTMLDivElement>(null)
  const periodBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    setPeriod(serverPeriod ?? '2026-11')
    setLocal(getPasscode())
  }, [serverPeriod])

  const handlePeriodChange = (val: string) => {
    setPeriod(val)
    setPeriodOpen(false)
  }

  // Passcode modal keyboard & click-outside handling
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setOpen(false)
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
          setOpen(false)
        }
      }
      document.addEventListener('keydown', onKeyDown)
      document.addEventListener('mousedown', onClickOutside)
      return () => {
        document.removeEventListener('keydown', onKeyDown)
        document.removeEventListener('mousedown', onClickOutside)
      }
    }
  }, [open])

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
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="5.5" width="18" height="13" rx="2" />
              <path d="M3.5 7l8.5 6 8.5-6" />
            </svg>{' '}
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
            onClick={() => setPeriodOpen((prev) => !prev)}
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

        <button
          ref={buttonRef}
          className={`lock ${open ? 'active' : ''} ${passcode ? 'unlocked' : ''}`}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen(!open)}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            {passcode ? (
              <>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V6a4 4 0 0 1 8 0v2" />
              </>
            ) : (
              <>
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </>
            )}
          </svg>{' '}
          <span className="lock-text-full">{passcode ? 'Demo unlocked' : 'Demo locked'}</span>
          <span className="lock-text-short">{passcode ? 'Unlocked' : 'Locked'}</span>
        </button>
      </div>

      {open && (
        <div ref={panelRef} className="passcode-panel" role="dialog" aria-label="Demo passcode settings">
          <label htmlFor="demo-passcode">Demo passcode</label>
          <input
            ref={inputRef}
            id="demo-passcode"
            className="input"
            type="password"
            autoComplete="off"
            value={passcode}
            onChange={(e) => {
              setLocal(e.target.value)
              setPasscode(e.target.value)
            }}
            placeholder="velo"
          />
          <p>Required when creating an invoice or retrying a set-aside.</p>
        </div>
      )}
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
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
                  <rect x="3" y="5.5" width="18" height="13" rx="2" />
                  <path d="M3.5 7l8.5 6 8.5-6" />
                </svg>{' '}
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
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V8a4 4 0 0 1 8 0v3" />
                </svg>{' '}
                <span>Demo locked</span>
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
      Demo · not affiliated with SSS, PhilHealth or Pag-IBIG · sample data, amounts in PHP at a sample rate of ₱18.50 per USDC on Stellar Testnet
    </p>
  )
}
