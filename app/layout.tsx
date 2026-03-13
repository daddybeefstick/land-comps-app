import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Land Comps Analyzer',
  description: 'Automated land comparable sales analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
