'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { setPasscode } from '../lib/api'
import { AuthSkeleton } from './AuthSkeleton'

// Mock login: the demo has no accounts. The email is only shown in the header; the password is the
// DEMO_PASSCODE, which the server still checks on every write (x-demo-passcode).
const USER_KEY = 'envelo.demoUser'

export function getDemoUser(): string | null {
  try { return localStorage.getItem(USER_KEY) } catch { return null }
}

export function signIn(email: string, passcode: string) {
  try { localStorage.setItem(USER_KEY, email) } catch {}
  setPasscode(passcode)
}

type User = { email: string }
type AuthValue = { user: User; logout: () => void }
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const stored = getDemoUser()
    if (stored) return setEmail(stored)
    const query = searchParams.toString()
    router.replace(`/login?next=${encodeURIComponent(`${pathname}${query ? `?${query}` : ''}`)}`)
  }, [pathname, router, searchParams])

  const value = useMemo<AuthValue | null>(() => email ? ({
    user: { email },
    logout: () => {
      try { localStorage.removeItem(USER_KEY) } catch {}
      setPasscode('')
      router.replace('/login')
    },
  }) : null, [email, router])

  if (!value) return <AuthSkeleton />
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
