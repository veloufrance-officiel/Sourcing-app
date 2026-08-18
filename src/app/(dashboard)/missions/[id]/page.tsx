import { notFound } from 'next/navigation'
import Link from 'next/link'
import { FileText, ListChecks, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { AddCandidateForm } from './add-candidate-form'
import { AnalyzeBriefForm } from './analyze-brief-form'
import { AnonymizeCandidateButton } from './anonymize-candidate-button'
import { EvidenceReviewDrawer, type EvidenceCriterion } from './evidence-review-drawer'
import { EligibilityBadge, EligibilitySummary } from './eligibility-badge'
import { GithubSourcingPanel } from './github-sourcing-panel'
import { CandidateContactPanel, type ExistingContact } from './candidate-contact-panel'
import { computeMatchScore, type Criterion } from '@/lib/matching'

type MissionCandidateEntry = {
  id: string
  stage_id: string
  eligibility_status: 'ELIGIBLE' | 'NOT_QUALIFIED' | 'INELIGIBLE'
  candidates: {
    id: string
    full_name: string
    title: string | null
    skills: string[] | null
    location: string | null
    qualified_by: string | null
    source: string | null
    github_user_id: number | null
  } | null
}

type EvidenceRow = {
  candidate_id: string
  criterion_id: string
  status: 'VERIFIED' | 'NOT_VERIFIED' | 'CONTRADICTED' | 'INFERRED_UNCONFIRMED'
  source_type: string
  verification_method: string | null
  verified_at: string | null
  retrieved_at: string
}

type MissionDetail = {
  id: string
  tenant_id: string
  title: string
  location: string | null
  contract_type: string | null
  daily_rate: number | null
  brief_raw: string | null
  source: string
  clients: { name: string } | null
}

export default async function MissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: mission } = await supabase
    .from('missions')
    .select('id, tenant_id, title, location, contract_type, daily_rate, brief_raw, source, clients(name)')
    .eq('id', id)
    .returns<MissionDetail[]>()
    .single()
  if (!mission) notFound()

  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, label, sort_order')
    .eq('tenant_id', mission.tenant_id)
    .order('sort_order')

  const { data: entries } = await supabase
    .from('mission_candidates')
    .select('id, stage_id, eligibility_status, candidates(id, full_name, title, skills, location, qualified_by, source, github_user_id)')
    .eq('mission_id', id)
    .returns<MissionCandidateEntry[]>()

  const { data: criteria } = await supabase
    .from('brief_criteria')
    .select('id, label, weight, source')
    .eq('mission_id', id)
    .order('weight', { ascending: false })

  const obligatoireCriteria = (criteria ?? []).filter((c) => c.weight === 3)
  const candidateIds = (entries ?? []).map((e) => e.candidates?.id).filter((v): v is string => Boolean(v))

  // Evidence : une seule requête pour tous les candidats de la mission,
  // groupée ensuite en mémoire. superseded_by is null = ligne active
  // (jamais remplacée par une preuve plus récente) — même filtre que
  // celui qu'applique internal.recalculate_eligibility côté DB, pour
  // que ce que le drawer affiche corresponde exactement à ce qui a
  // déterminé eligibility_status.
  const { data: evidenceRows } =
    candidateIds.length > 0 && obligatoireCriteria.length > 0
      ? await supabase
          .from('evidence')
          .select('candidate_id, criterion_id, status, source_type, verification_method, verified_at, retrieved_at')
          .in('candidate_id', candidateIds)
          .in(
            'criterion_id',
            obligatoireCriteria.map((c) => c.id)
          )
          .is('superseded_by', null)
          .order('retrieved_at', { ascending: false })
          .returns<EvidenceRow[]>()
      : { data: [] as EvidenceRow[] }

  // Le plus récent par (candidat, critère) — evidenceRows est déjà trié
  // par retrieved_at décroissant, donc le premier rencontré pour chaque
  // paire est le bon.
  const evidenceByCandidateCriterion = new Map<string, EvidenceRow>()
  ;(evidenceRows ?? []).forEach((row) => {
    const key = `${row.candidate_id}:${row.criterion_id}`
    if (!evidenceByCandidateCriterion.has(key)) evidenceByCandidateCriterion.set(key, row)
  })

  // Contacts déjà envoyés — une seule requête groupée, pas une par
  // candidat, même principe que evidenceRows ci-dessus. app_users
  // jointe pour afficher le nom de qui a contacté, pas juste un uuid.
  const { data: contactRows } =
    candidateIds.length > 0
      ? await supabase
          .from('candidate_contacts')
          .select('id, candidate_id, mission_id, sent_at, response, missions(title), app_users(email)')
          .in('candidate_id', candidateIds)
          .order('sent_at', { ascending: false })
      : { data: [] }

  const contactsByCandidate = new Map<string, typeof contactRows>()
  ;(contactRows ?? []).forEach((row) => {
    const list = contactsByCandidate.get(row.candidate_id) ?? []
    list.push(row)
    contactsByCandidate.set(row.candidate_id, list)
  })

  const scoringCriteria: Criterion[] = (criteria ?? []).map((c) => ({ label: c.label, weight: c.weight }))

  const { data: shortlists } = await supabase
    .from('shortlists')
    .select('id, name, shared_with_external, shortlist_candidates(count)')
    .eq('mission_id', id)
    .order('created_at', { ascending: false })

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
      <div className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">{mission.title}</h1>
          {mission.source === 'arnaud' ? (
            <span className="shrink-0 rounded-full bg-signal-soft px-3 py-1 text-xs font-semibold text-signal">
              Arnaud
            </span>
          ) : (
            <span className="shrink-0 rounded-full bg-line px-3 py-1 text-xs font-semibold text-slate">
              Direct
            </span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {mission.clients?.name ? <MetaChip label={mission.clients.name} /> : null}
          {mission.location ? <MetaChip label={mission.location} /> : null}
          {mission.contract_type ? <MetaChip label={mission.contract_type} /> : null}
          {mission.daily_rate ? <MetaChip label={`${mission.daily_rate} €/jour`} mono /> : null}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-signal" />
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-ink">Brief client</p>
        </div>
        {mission.brief_raw ? (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate">{mission.brief_raw}</p>
        ) : (
          <p className="mt-3 text-sm text-slate">Aucun brief renseigné pour cette mission.</p>
        )}
        {mission.brief_raw ? <AnalyzeBriefForm missionId={mission.id} /> : null}

        {criteria && criteria.length > 0 ? (
          <ul className="mt-4 space-y-1.5 border-t border-line pt-4">
            {criteria.map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm text-ink">
                <span className="rounded-md bg-signal-soft px-2 py-0.5 text-[11px] font-semibold text-signal">
                  {weightLabel[c.weight] ?? c.weight}
                </span>
                {c.label}
                {c.source === 'manual' ? <span className="text-xs text-slate">(manuel)</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="mt-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ListChecks className="h-3.5 w-3.5 text-slate" />
          <p className="font-display text-xs font-semibold uppercase tracking-wider text-ink">Shortlists</p>
        </div>
        <Link
          href={`/missions/${mission.id}/shortlists/new`}
          className="flex items-center gap-1 rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-medium text-ink hover:border-signal hover:text-signal"
        >
          <Plus className="h-3.5 w-3.5" />
          Nouvelle shortlist
        </Link>
      </div>
      {shortlists && shortlists.length > 0 ? (
        <ul className="mt-3 grid gap-2">
          {shortlists.map((s) => (
            <li key={s.id}>
              <Link
                href={`/missions/${mission.id}/shortlists/${s.id}`}
                className="flex items-center justify-between rounded-xl border border-line bg-white px-4 py-3 text-sm shadow-sm hover:border-signal"
              >
                <span className="text-ink">{s.name}</span>
                <span className="font-mono text-xs text-slate">
                  {s.shortlist_candidates?.[0]?.count ?? 0} profil
                  {(s.shortlist_candidates?.[0]?.count ?? 0) > 1 ? 's' : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-slate">Aucune shortlist pour cette mission pour l&apos;instant.</p>
      )}

      {firstStage ? (
        <>
          <AddCandidateForm missionId={mission.id} stageId={firstStage.id} />
          <div className="mt-3">
            <GithubSourcingPanel
              missionId={mission.id}
              criteriaLabels={obligatoireCriteria.map((c) => c.label)}
              location={mission.location}
            />
          </div>
        </>
      ) : (
        <p className="mt-6 rounded-xl border border-line bg-amber-soft px-4 py-3 text-sm text-ink">
          Aucun statut de pipeline pour ce tenant. Vérifie que le trigger de seed (migration 0002)
          a bien tourné sur la table <code className="font-mono">tenants</code>.
        </p>
      )}

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(stages ?? []).map((stage) => (
          <div key={stage.id} className="rounded-xl border border-line bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-slate">{stage.label}</p>
            <p className="mt-1 font-display text-2xl font-semibold text-ink">
              {byStage.get(stage.id)?.length ?? 0}
            </p>
            <ul className="mt-3 space-y-2.5">
              {byStage.get(stage.id)?.map((e) => {
                const candidate = e.candidates
                if (!candidate) return null
                // Contrat PR4 : Match Score n'est calculé QUE pour ELIGIBLE — pas
                // seulement masqué à l'affichage. Un candidat NOT_QUALIFIED ou
                // INELIGIBLE ne déclenche jamais computeMatchScore, cohérent avec
                // le schéma Evidence → Eligibility → Score (le score est une
                // conséquence de l'éligibilité, jamais un calcul indépendant
                // qu'on filtrerait après coup).
                const match =
                  e.eligibility_status === 'ELIGIBLE' && scoringCriteria.length > 0
                    ? computeMatchScore(
                        scoringCriteria,
                        { title: candidate.title, skills: candidate.skills, location: candidate.location },
                        mission.location
                      )
                    : null
                return (
                  <li key={e.id} className="text-sm text-ink">
                    <div className="flex items-center gap-1.5">
                      <span>{candidate.full_name}</span>
                      {candidate.qualified_by === 'arnaud' ? (
                        <span
                          className="rounded-md bg-signal-soft px-1.5 py-0.5 text-[10px] font-semibold text-signal"
                          title="Pré-qualifié par Arnaud — signal informatif, n'entre pas dans le score"
                        >
                          Arnaud
                        </span>
                      ) : null}
                      <EligibilityBadge status={e.eligibility_status} match={match} />
                      <span className="ml-auto flex items-center gap-2">
                        <EvidenceReviewDrawer
                          candidateId={candidate.id}
                          candidateName={candidate.full_name}
                          missionId={mission.id}
                          eligibilityStatus={e.eligibility_status}
                          criteria={obligatoireCriteria.map((c): EvidenceCriterion => {
                            const ev = evidenceByCandidateCriterion.get(`${candidate.id}:${c.id}`)
                            return {
                              criterionId: c.id,
                              label: c.label,
                              weight: c.weight,
                              status: ev?.status ?? null,
                              sourceType: ev?.source_type ?? null,
                              verificationMethod: ev?.verification_method ?? null,
                              verifiedAt: ev?.verified_at ?? null,
                            }
                          })}
                        />
                        <CandidateContactPanel
                          candidateId={candidate.id}
                          candidateName={candidate.full_name}
                          missionId={mission.id}
                          missionTitle={mission.title}
                          isGithubSourced={candidate.source === 'github'}
                          existingContacts={(contactsByCandidate.get(candidate.id) ?? []).map((c): ExistingContact => {
                            const missionTitleFromJoin = Array.isArray(c.missions) ? c.missions[0]?.title : (c.missions as { title: string } | null)?.title
                            const emailFromJoin = Array.isArray(c.app_users) ? c.app_users[0]?.email : (c.app_users as { email: string } | null)?.email
                            return {
                              id: c.id,
                              missionTitle: missionTitleFromJoin ?? mission.title,
                              sentAt: c.sent_at,
                              sentByName: emailFromJoin ?? null,
                              response: c.response as ExistingContact['response'],
                            }
                          })}
                        />
                        <AnonymizeCandidateButton
                          candidateId={candidate.id}
                          missionId={mission.id}
                          candidateName={candidate.full_name}
                        />
                      </span>
                    </div>
                    {match && (match.matchedCriteria.length > 0 || match.missingCriteria.length > 0) ? (
                      <details className="mt-0.5">
                        <summary className="cursor-pointer font-mono text-xs text-slate hover:text-signal">
                          {match.score}/{match.maxScore} points
                        </summary>
                        <div className="mt-1.5 space-y-1">
                          {match.matchedCriteria.length > 0 ? (
                            <p className="text-xs text-ink">
                              <span className="text-signal">✓</span> {match.matchedCriteria.join(', ')}
                            </p>
                          ) : null}
                          {match.missingCriteria.length > 0 ? (
                            <p className="text-xs text-slate">
                              <span className="text-amber">✗</span> {match.missingCriteria.join(', ')}
                            </p>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                    {e.eligibility_status === 'NOT_QUALIFIED' ? (
                      <EligibilitySummary criteria={obligatoireCriteria} candidateId={candidate.id} evidenceMap={evidenceByCandidateCriterion} />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

function MetaChip({ label, mono }: { label: string; mono?: boolean }) {
  return (
    <span
      className={`rounded-md border border-line bg-white px-2.5 py-1 text-xs text-ink ${mono ? 'font-mono' : ''}`}
    >
      {label}
    </span>
  )
}
