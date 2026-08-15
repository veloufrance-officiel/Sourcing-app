import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen bg-paper">
      <aside className="hidden w-56 shrink-0 border-r border-line px-4 py-6 sm:block">
        <p className="font-display text-sm uppercase tracking-[0.2em] text-slate">OrakL</p>
        <p className="font-display text-lg font-semibold text-ink">Sourcing OS</p>
        <nav className="mt-8 space-y-1 text-sm">
          <Link
            href="/missions"
            className="block rounded-md px-3 py-2 font-medium text-ink hover:bg-signal-soft"
          >
            Missions
          </Link>
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-line px-6 py-4">
          <p className="text-sm text-slate">{user.email}</p>
        </header>
        <main className="px-6 py-8">{children}</main>
      </div>
    </div>
  )
}
