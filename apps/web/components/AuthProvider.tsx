'use client'

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { api } from '../lib/api'
import { AuthSkeleton } from './AuthSkeleton'

type User = { email: string }
type AuthValue = { user: User; logout: () => Promise<void>; loggingOut: boolean }
const AuthContext = createContext<AuthValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [user, setUser] = useState<User | null>(null)
  const [checking, setChecking] = useState(true)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    let active = true
    void api('/auth/session').then(async (response) => {
      if (!active) return
      if (!response.ok) {
        const query = searchParams.toString()
        const next = `${pathname}${query ? `?${query}` : ''}`
        router.replace(`/login?next=${encodeURIComponent(next)}`)
        return
      }
      const body = await response.json() as { user: User }
      if (active) {
        setUser(body.user)
        setChecking(false)
      }
    }).catch(() => {
      if (active) router.replace(`/login?next=${encodeURIComponent(pathname)}`)
    })
    return () => { active = false }
  }, [pathname, router, searchParams])

  const value = useMemo<AuthValue | null>(() => user ? ({
    user,
    loggingOut,
    logout: async () => {
      setLoggingOut(true)
      try { await api('/auth/logout', { method: 'POST' }) }
      finally {
        setUser(null)
        router.replace('/login')
        router.refresh()
        setLoggingOut(false)
      }
    },
  }) : null, [loggingOut, router, user])

  if (checking || !value) return <AuthSkeleton />
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside AuthProvider')
  return value
}
