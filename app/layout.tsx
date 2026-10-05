import './globals.css'
import type { Metadata, Viewport } from 'next'
import { LOGO_MARK } from '@/lib/logos'

export const metadata: Metadata = {
  title: { default: 'Terraviva HR System', template: '%s · Terraviva' },
  description: 'Terraviva Human Resources Management System',
  icons: { icon: LOGO_MARK, apple: LOGO_MARK },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#087f82' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
