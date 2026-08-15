import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Globe, Lock } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { removeCandidateFromShortlist, toggleSharing } from './actions'
import { AddToShortlistForm } from './add-to-shortlist-form'
import { CopyLinkButton } from './copy-link-button'

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
    .select('id, name, shared_with_external, share_token, mission_id')
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

  const shareUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/share/${shortlist.share_token}`

  return (
    <div>
      <Link
        href={`/missions/${missionId}`}
        className="inline-flex items-center gap-1.5 text-sm text-slate hover:text-ink"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Retour à la mission
      </Link>

      <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight text-ink">{shortlist.name}</h1>

      <div className="mt-4 rounded-xl border border-line bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {shortlist.shared_with_external ? (
              <Globe className="h-4 w-4 text-signal" />
            ) : (
              <Lock className="h-4 w-4 text-slate" />
            )}
            <p className="text-sm font-medium text-ink">
              {shortlist.shared_with_external ? 'Partage externe activé' : 'Non partagée'}
            </p>
          </div>
          <form action={toggleSharing}>
            <input type="hidden" name="mission_id" value={missionId} />
            <input type="hidden" name="shortlist_id" value={shortlistId} />
            <input type="hidden" name="next_value" value={(!shortlist.shared_with_external).toString()} />
            <button type="submit" className="text-xs font-medium text-signal hover:underline">
              {shortlist.shared_with_external ? 'Désactiver' : 'Activer le partage'}
            </button>
          </form>
        </div>

        {shortlist.shared_with_external ? (
          <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
            <code className="flex-1 truncate rounded-lg bg-paper px-3 py-2 font-mono text-xs text-slate">
              {shareUrl}
            </code>
            <CopyLinkButton url={shareUrl} />
          </div>
        ) : (
          <p className="mt-3 border-t border-line pt-3 text-xs text-slate">
            Une fois activé, quiconque a le lien peut voir les profils de cette shortlist (nom, intitulé,
            compétences — jamais les coordonnées) sans avoir de compte.
          </p>
        )}
      </div>

      <div className="mt-6 rounded-xl border border-line bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate">
          Profils ({shortlistEntries?.length ?? 0})
        </p>

        {!shortlistEntries || shortlistEntries.length === 0 ? (
          <p className="mt-3 text-sm text-slate">Aucun profil dans cette shortlist pour l&apos;instant.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line">
            {shortlistEntries.map((entry) => (
              <li key={entry.candidate_id} className="flex items-center justify-between py-2.5">
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
