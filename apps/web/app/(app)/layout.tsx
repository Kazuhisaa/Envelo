import { Suspense, type ReactNode } from 'react'
import { AuthProvider } from '../../components/AuthProvider'
import { AuthSkeleton } from '../../components/AuthSkeleton'
import { AppHeader, DemoFooter } from '../../components/Shell'

export default function AuthenticatedLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AuthSkeleton />}>
      <AuthProvider>
        <AppHeader />
        {children}
        <DemoFooter />
      </AuthProvider>
    </Suspense>
  )
}
