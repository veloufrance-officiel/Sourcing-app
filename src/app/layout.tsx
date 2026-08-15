import type { Metadata } from 'next'
import type { ReactNode } from 'react'
// Polices auto-hébergées via npm (@fontsource) plutôt que next/font/google :
// zéro dépendance réseau vers Google au build ou au runtime.
import '@fontsource-variable/inter'
import '@fontsource-variable/space-grotesk'
import '@fontsource-variable/jetbrains-mono'
import './globals.css'

export const metadata: Metadata = {
  title: 'OrakL — Sourcing OS',
  description: 'Pipeline de sourcing freelance : missions, profils, shortlists.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-body antialiased">{children}</body>
    </html>
  )
}
