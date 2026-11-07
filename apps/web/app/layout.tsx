import type { ReactNode } from 'react'
import { Public_Sans, JetBrains_Mono } from 'next/font/google'
import './globals.css'

const sans = Public_Sans({
  subsets: ['latin'],
  variable: '--font-public-sans',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata = {
  title: 'Envelo',
  description: 'Your contributions, sealed and delivered.',
  icons: {
    icon: [
      { url: '/favicon.ico?v=2' },
      { url: '/icon.png?v=2', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-icon.png?v=2' },
    ],
  },
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  )
}
