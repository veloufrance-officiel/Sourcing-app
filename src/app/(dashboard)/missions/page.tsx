import Link from 'next/link'
import { ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'

type MissionListEntry = {
  id: string
  title: string
  location: string | null
  contract_type: string | null
  daily_rate: number | null
  status: string
  source: string
  clients: { name: string } | null
  mission_candidates: { count: number }[]
}

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: missions, error } = await supabase
    .from('missions')
    .select(
      'id, title, location, contract_type, daily_rate, status, source, clients(name), mission_candidates(count)'
    )
    .order('created_at', { ascending: false })
    .returns<MissionListEntry[]>()

  const sortedMissions = [...(missions ?? [])].sort((a, b) => {
    if (a.source === b.source) return 0
    return a.source === 'arnaud' ? -1 : 1
  })

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Missions</h1>
          <p className="mt-1 text-sm text-slate">Aperçu de tes missions et de ton pipeline.</p>
        </div>
        <Link
          href="/missions/new"
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90"
        >
          <Plus className="h-4 w-4" />
          Nouvelle mission
        </Link>
      </div>

      {error ? (
        <p className="mt-6 rounded-xl border border-line bg-amber-soft px-4 py-3 text-sm text-ink">
          Impossible de charger les missions ({error.message}). Vérifie que la migration Supabase
          a été appliquée et que ton compte est bien rattaché à un tenant dans{' '}
          <code className="font-mono">app_users</code>.
        </p>
      ) : null}

      {!error && missions?.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line px-6 py-12 text-center">
          <p className="text-sm text-slate">Aucune mission pour l&apos;instant.</p>
          <Link href="/missions/new" className="mt-3 inline-block text-sm font-medium text-signal hover:underline">
            Créer la première
          </Link>
        </div>
      ) : null}

      {sortedMissions.length > 0 ? (
        <ul className="mt-6 grid gap-3">
          {sortedMissions.map((mission) => (
            <li key={mission.id}>
              <Link
                href={`/missions/${mission.id}`}
                className="flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-5 py-4 shadow-sm hover:border-signal"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-display text-base font-semibold text-ink">{mission.title}</p>
                    {mission.source === 'arnaud' ? (
                      <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal">
                        Arnaud
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-slate">
                    {mission.clients?.name ?? 'Sans client'} · {mission.location} · {mission.contract_type}
                    {mission.daily_rate ? <span className="font-mono"> · {mission.daily_rate} €/jour</span> : ''}
                  </p>
                  <p className="mt-1.5 font-mono text-xs text-slate">
                    {mission.mission_candidates?.[0]?.count ?? 0} profil
                    {(mission.mission_candidates?.[0]?.count ?? 0) > 1 ? 's' : ''} en pipeline
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate" />
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
