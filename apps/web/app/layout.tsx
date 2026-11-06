import type { ReactNode } from 'react'
import { Public_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { AppHeader, DemoFooter } from '../components/Shell'

const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--mono',
  display: 'swap',
})

export const metadata = { title: 'Envelo', description: 'Your contributions, sealed and delivered.' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body><AppHeader />{children}<DemoFooter /></body>
    </html>
  )
}
