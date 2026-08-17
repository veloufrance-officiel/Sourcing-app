import type { MatchResult } from '@/lib/matching'
import type { EvidenceCriterion } from './evidence-review-drawer'

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_QUALIFIED' | 'INELIGIBLE'

// Affichage exact du contrat PR4 :
// ELIGIBLE      → score/100 (jamais rien d'autre)
// NOT_QUALIFIED → "À vérifier" (jamais un score, même partiel)
// INELIGIBLE    → "Non éligible" (jamais un score exploitable)
//
// Un match non-null pour un statut différent de ELIGIBLE serait une
// contradiction du contrat — le badge ne fait pas confiance à match
// pour décider, il se fie exclusivement à status. Si les deux
// divergeaient (bug amont), le badge afficherait quand même "À
// vérifier"/"Non éligible" plutôt que de risquer d'exposer un score.
export function EligibilityBadge({ status, match }: { status: EligibilityStatus; match: MatchResult | null }) {
  if (status === 'ELIGIBLE') {
    return match ? (
      <span className="font-mono text-xs font-semibold text-signal">
        {match.score}/{match.maxScore}
      </span>
    ) : null
  }
  if (status === 'NOT_QUALIFIED') {
    return (
      <span className="rounded-md bg-amber-soft px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber">
        À vérifier
      </span>
    )
  }
  return (
    <span className="rounded-md bg-line px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate">
      Non éligible
    </span>
  )
}

type EvidenceRowForSummary = { status: 'VERIFIED' | 'NOT_VERIFIED' | 'CONTRADICTED' | 'INFERRED_UNCONFIRMED' }

// Comptage pur depuis les preuves déjà chargées par la page — ne
// recalcule rien côté Eligibility elle-même (ça reste la responsabilité
// exclusive du trigger DB). INFERRED_UNCONFIRMED compte comme
// "non vérifié" pour cet affichage, cohérent avec le fait qu'il ne
// compte jamais comme VERIFIED dans le moteur d'éligibilité réel.
// evidenceMap est déjà indexé par la clé exacte que l'appelant construit
// (cohérent avec evidenceByCandidateCriterion de page.tsx : `${candidateId}:${criterionId}`).
export function summarizeEvidence(criteriaKeys: string[], evidenceMap: Map<string, EvidenceRowForSummary>) {
  let verified = 0
  let notVerified = 0
  let contradicted = 0
  for (const key of criteriaKeys) {
    const status = evidenceMap.get(key)?.status
    if (status === 'VERIFIED') verified++
    else if (status === 'CONTRADICTED') contradicted++
    else notVerified++
  }
  return { verified, notVerified, contradicted }
}

export function EligibilitySummary({
  criteria,
  candidateId,
  evidenceMap,
}: {
  criteria: { id: string }[]
  candidateId: string
  evidenceMap: Map<string, EvidenceRowForSummary>
}) {
  const keys = criteria.map((c) => `${candidateId}:${c.id}`)
  const { verified, notVerified, contradicted } = summarizeEvidence(keys, evidenceMap)
  return (
    <p className="mt-0.5 text-[11px] text-slate">
      {verified} vérifié{verified > 1 ? 's' : ''} · {notVerified} non vérifié{notVerified > 1 ? 's' : ''} ·{' '}
      {contradicted} contradictoire{contradicted > 1 ? 's' : ''}
      {' — '}
      <span className="font-medium text-amber">obtenir des preuves pour statuer</span>
    </p>
  )
}

// Ré-export pour usage externe si nécessaire (cohérence avec le pattern
// du projet où les types de critères transitent déjà via evidence-review-drawer).
export type { EvidenceCriterion }
