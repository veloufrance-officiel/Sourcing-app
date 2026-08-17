// Miroir TypeScript de internal.compute_eligibility_status (SQL) — même
// logique de décision, testée indépendamment ici. Fonction pure : aucun
// effet de bord, ne lit que ses paramètres, déterministe.
//
// Ordre de priorité non négociable (FINAL DECISION MODEL GATE) :
// un seul CONTRADICTED disqualifie même si d'autres obligatoires sont
// NOT_VERIFIED — un fait disqualifiant prouvé prime toujours sur
// l'incertitude, peu importe son volume.

export type EvidenceStatus = 'VERIFIED' | 'NOT_VERIFIED' | 'CONTRADICTED' | 'INFERRED_UNCONFIRMED'
export type EligibilityStatus = 'INELIGIBLE' | 'NOT_QUALIFIED' | 'ELIGIBLE'

export type ObligatoireCriterionEvidence = {
  criterionId: string
  // Statut effectif le plus récent pour ce critère obligatoire, ou null
  // si aucune preuve n'existe encore pour ce (candidat, critère).
  status: EvidenceStatus | null
}

export type EligibilityResult = {
  status: EligibilityStatus
  flags: string[]
}

// INFERRED_UNCONFIRMED ne compte jamais comme VERIFIED — contrainte
// structurelle du modèle, appliquée ici en plus du CHECK en base
// (evidence_inference_never_verified). Une inférence non confirmée est
// traitée comme une absence de preuve pour la décision d'éligibilité,
// jamais comme une preuve positive.
function effectiveStatus(status: EvidenceStatus | null): EvidenceStatus | null {
  return status === 'INFERRED_UNCONFIRMED' ? 'NOT_VERIFIED' : status
}

export function computeEligibility(obligatoireCriteria: ObligatoireCriterionEvidence[]): EligibilityResult {
  // Décision 1 : mission sans critère obligatoire -> ELIGIBLE, mais
  // signalé explicitement pour ne jamais confondre avec "réellement
  // qualifié" côté UI/consommateur de ce résultat.
  if (obligatoireCriteria.length === 0) {
    return { status: 'ELIGIBLE', flags: ['NO_HARD_CONSTRAINTS'] }
  }

  const hasContradicted = obligatoireCriteria.some((c) => effectiveStatus(c.status) === 'CONTRADICTED')
  if (hasContradicted) {
    return { status: 'INELIGIBLE', flags: [] }
  }

  const hasMissingProof = obligatoireCriteria.some((c) => effectiveStatus(c.status) !== 'VERIFIED')
  if (hasMissingProof) {
    return { status: 'NOT_QUALIFIED', flags: [] }
  }

  return { status: 'ELIGIBLE', flags: [] }
}
