import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AddCandidateForm } from './add-candidate-form'
import { AnalyzeBriefForm } from './analyze-brief-form'

type MissionCandidateEntry = {
  id: string
  stage_id: string
  candidates: { id: string; full_name: string; title: string | null } | null
}

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mission } = await supabase.from('missions').select('*').eq('id', id).single()
  if (!mission) notFound()

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, label, sort_order')
    .eq('tenant_id', mission.tenant_id)
    .order('sort_order')

  const { data: entries } = await supabase
    .from('mission_candidates')
    .select('id, stage_id, candidates(id, full_name, title)')
    .eq('mission_id', id)
    .returns<MissionCandidateEntry[]>()

  const { data: criteria } = await supabase
    .from('brief_criteria')
    .select('id, label, weight, source')
    .eq('mission_id', id)
    .order('weight', { ascending: false })

  const weightLabel: Record<number, string> = { 1: 'souhaitable', 2: 'important', 3: 'obligatoire' }

  const byStage = new Map<string, MissionCandidateEntry[]>()
  ;(stages ?? []).forEach((s) => byStage.set(s.id, []))
  ;(entries ?? []).forEach((e) => {
    const list = byStage.get(e.stage_id) ?? []
    list.push(e)
    byStage.set(e.stage_id, list)
  })

  const firstStage = stages?.[0]

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold text-ink">{mission.title}</h1>
      <p className="mt-1 text-sm text-slate">
        {mission.client_name} · {mission.location} · {mission.contract_type}
        {mission.daily_rate ? ` · ${mission.daily_rate} €/jour` : ''}
      </p>

      <div className="mt-6 rounded-lg border border-line bg-white p-4">
        <p className="text-sm font-medium text-ink">Brief client</p>
        {mission.brief_raw ? (
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate">{mission.brief_raw}</p>
        ) : (
          <p className="mt-2 text-sm text-slate">Aucun brief renseigné pour cette mission.</p>
        )}
        {mission.brief_raw ? <AnalyzeBriefForm missionId={mission.id} /> : null}

        {criteria && criteria.length > 0 ? (
          <ul className="mt-4 space-y-1 border-t border-line pt-4">
            {criteria.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm text-ink">
                <span className="rounded-full bg-signal-soft px-2 py-0.5 text-xs font-medium text-signal">
                  {weightLabel[c.weight] ?? c.weight}
                </span>
                {c.label}
                {c.source === 'manual' ? <span className="text-xs text-slate">(manuel)</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {firstStage ? (
        <AddCandidateForm missionId={mission.id} stageId={firstStage.id} />
      ) : (
        <p className="mt-6 rounded-lg border border-line bg-amber-soft px-4 py-3 text-sm text-ink">
          Aucun statut de pipeline pour ce tenant. Vérifie que le trigger de seed (migration 0002)
          a bien tourné sur la table <code className="font-mono">tenants</code>.
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(stages ?? []).map((stage) => (
          <div key={stage.id} className="rounded-lg border border-line bg-white p-4">
            <p className="text-sm text-slate">{stage.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {byStage.get(stage.id)?.length ?? 0}
            </p>
            <ul className="mt-3 space-y-1">
              {byStage.get(stage.id)?.map((e) => (
                <li key={e.id} className="text-sm text-ink">
                  {e.candidates?.full_name}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
