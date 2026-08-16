import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Briefcase, Settings } from 'lucide-react'
import type { ReactNode } from 'react'
import { createClient } from '@/lib/supabase/server'
import { signOut } from './actions'

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  return (
    <div className="flex min-h-screen flex-col bg-paper sm:flex-row">
      <aside className="hidden w-56 shrink-0 border-r border-line px-4 py-6 sm:block">
        <p className="font-display text-sm uppercase tracking-[0.2em] text-slate">OrakL</p>
        <p className="font-display text-lg font-semibold text-ink">Sourcing OS</p>
        <nav className="mt-8 space-y-1 text-sm">
          <Link
            href="/missions"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-ink hover:bg-signal-soft"
          >
            <Briefcase className="h-4 w-4" />
            Missions
          </Link>
          <Link
            href="/settings"
            className="flex items-center gap-2 rounded-md px-3 py-2 font-medium text-ink hover:bg-signal-soft"
          >
            <Settings className="h-4 w-4" />
            Réglages
          </Link>
        </nav>
      </aside>
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-line px-4 py-4 sm:px-6">
          <Link href="/missions" className="font-display text-sm font-semibold text-ink sm:hidden">
            OrakL
          </Link>
          <p className="hidden text-sm text-slate sm:block">{user.email}</p>
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate sm:hidden">{user.email}</p>
            <form action={signOut}>
              <button type="submit" className="text-xs font-medium text-slate hover:text-ink hover:underline">
                Se déconnecter
              </button>
            </form>
          </div>
        </header>
        <main className="px-4 py-8 sm:px-6">{children}</main>
      </div>
    </div>
  )
}
