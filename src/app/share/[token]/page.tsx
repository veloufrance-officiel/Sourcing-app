import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

type SharedShortlist = {
  name: string
  mission_title: string
  candidates: { full_name: string; title: string | null; skills: string[] | null }[]
}

export default async function SharedShortlistPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()
  const { data } = await supabase.rpc('get_shared_shortlist', { p_token: token })

  if (!data) notFound()
  const shortlist = data as SharedShortlist

  return (
    <main className="min-h-screen bg-paper px-4 py-10 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <p className="font-display text-xs uppercase tracking-[0.2em] text-slate">OrakL — Sourcing OS</p>
        <h1 className="mt-1 font-display text-2xl font-semibold text-ink">{shortlist.name}</h1>
        <p className="mt-1 text-sm text-slate">Mission : {shortlist.mission_title}</p>

        <div className="mt-8 grid gap-3">
          {shortlist.candidates.length === 0 ? (
            <p className="text-sm text-slate">Aucun profil dans cette shortlist pour l&apos;instant.</p>
          ) : (
            shortlist.candidates.map((c, i) => (
              <div key={i} className="rounded-xl border border-line bg-white p-4 shadow-sm">
                <p className="font-display text-base font-semibold text-ink">{c.full_name}</p>
                {c.title ? <p className="mt-0.5 text-sm text-slate">{c.title}</p> : null}
                {c.skills && c.skills.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {c.skills.map((skill) => (
                      <span
                        key={skill}
                        className="rounded-md bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal"
                      >
                        {skill}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <p className="mt-10 text-center text-xs text-slate">
          Vue de partage en lecture seule — les coordonnées des profils ne sont pas incluses.
        </p>
      </div>
    </main>
  )
}
