import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ListingLift.ai',
  description: 'Optimize your Amazon listings with AI',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
