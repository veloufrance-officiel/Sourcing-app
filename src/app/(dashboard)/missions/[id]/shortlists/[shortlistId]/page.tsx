import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { removeCandidateFromShortlist } from './actions'
import { AddToShortlistForm } from './add-to-shortlist-form'

type ShortlistCandidateEntry = {
  candidate_id: string
  candidates: { id: string; full_name: string; title: string | null } | null
}

type PipelineEntry = {
  candidates: { id: string; full_name: string } | null
}

export default async function ShortlistDetailPage({
  params,
}: {
  params: Promise<{ id: string; shortlistId: string }>
}) {
  const { id: missionId, shortlistId } = await params
  const supabase = await createClient()

  const { data: shortlist } = await supabase
    .from('shortlists')
    .select('id, name, shared_with_external, mission_id')
    .eq('id', shortlistId)
    .single()

  if (!shortlist) notFound()

  const { data: shortlistEntries } = await supabase
    .from('shortlist_candidates')
    .select('candidate_id, candidates(id, full_name, title)')
    .eq('shortlist_id', shortlistId)
    .returns<ShortlistCandidateEntry[]>()

  const { data: pipelineEntries } = await supabase
    .from('mission_candidates')
    .select('candidates(id, full_name)')
    .eq('mission_id', missionId)
    .returns<PipelineEntry[]>()

  const inShortlistIds = new Set((shortlistEntries ?? []).map((e) => e.candidate_id))
  const availableCandidates = (pipelineEntries ?? [])
    .map((e) => e.candidates)
    .filter((c): c is { id: string; full_name: string } => c !== null && !inShortlistIds.has(c.id))

  return (
    <div>
      <Link href={`/missions/${missionId}`} className="text-sm text-slate hover:text-ink">
        ← Retour à la mission
      </Link>

      <div className="mt-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">{shortlist.name}</h1>
        {shortlist.shared_with_external ? (
          <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal">
            Destinée au partage externe
          </span>
        ) : null}
      </div>

      <div className="mt-6 rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-medium text-ink">
          Profils ({shortlistEntries?.length ?? 0})
        </p>

        {!shortlistEntries || shortlistEntries.length === 0 ? (
          <p className="mt-2 text-sm text-slate">Aucun profil dans cette shortlist pour l&apos;instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {shortlistEntries.map((entry) => (
              <li key={entry.candidate_id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-ink">{entry.candidates?.full_name}</p>
                  {entry.candidates?.title ? (
                    <p className="text-xs text-slate">{entry.candidates.title}</p>
                  ) : null}
                </div>
                <form action={removeCandidateFromShortlist}>
                  <input type="hidden" name="mission_id" value={missionId} />
                  <input type="hidden" name="shortlist_id" value={shortlistId} />
                  <input type="hidden" name="candidate_id" value={entry.candidate_id} />
                  <button type="submit" className="text-xs text-amber hover:underline">
                    Retirer
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <AddToShortlistForm
          missionId={missionId}
          shortlistId={shortlistId}
          availableCandidates={availableCandidates}
        />
      </div>
    </div>
  )
}
