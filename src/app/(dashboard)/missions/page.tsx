import { createClient } from '@/lib/supabase/server'

export default async function MissionsPage() {
  const supabase = await createClient()
  const { data: missions, error } = await supabase
    .from('missions')
    .select('id, title, client_name, location, contract_type, daily_rate, status')
    .order('created_at', { ascending: false })

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">Missions</h1>
      <p className="mt-1 text-sm text-slate">Aperçu de tes missions et de ton pipeline.</p>

      {error ? (
        <p className="mt-6 rounded-lg border border-line bg-amber-soft px-4 py-3 text-sm text-ink">
          Impossible de charger les missions ({error.message}). Vérifie que la migration Supabase
          a été appliquée et que ton compte est bien rattaché à un tenant dans{' '}
          <code className="font-mono">app_users</code>.
        </p>
      ) : null}

      {!error && missions?.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line px-6 py-10 text-center">
          <p className="text-sm text-slate">Aucune mission pour l&apos;instant.</p>
        </div>
      ) : null}

      {missions && missions.length > 0 ? (
        <ul className="mt-6 grid gap-3">
          {missions.map((mission) => (
            <li key={mission.id} className="rounded-lg border border-line bg-white px-5 py-4">
              <p className="font-display text-base font-semibold text-ink">{mission.title}</p>
              <p className="mt-1 text-sm text-slate">
                {mission.client_name} · {mission.location} · {mission.contract_type}
                {mission.daily_rate ? ` · ${mission.daily_rate} €/jour` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
