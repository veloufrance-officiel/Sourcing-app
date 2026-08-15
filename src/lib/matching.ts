// Scoring de matching candidat <-> mission. Volontairement simple et lisible
// plutôt qu'un modèle opaque : la transparence EST la garantie d'équité
// posée dans l'architecture (section 6ter) — un recruteur ou un freelance
// doit pouvoir comprendre exactement pourquoi un score sort tel qu'il sort.
//
// Règle non négociable : qualified_by (pré-qualification, ex. par Arnaud)
// n'entre JAMAIS dans ce calcul. C'est un signal affiché à part, jamais un
// point ajouté au score — sinon la pré-qualification devient un passe-droit
// déguisé, exactement ce qui a été explicitement écarté.

export type Criterion = { label: string; weight: number }

export type CandidateForScoring = {
  title: string | null
  skills: string[] | null
  location: string | null
}

export type MatchResult = {
  score: number
  maxScore: number
  percent: number
  matchedCriteria: string[]
  missingCriteria: string[]
}

export function computeMatchScore(
  criteria: Criterion[],
  candidate: CandidateForScoring,
  missionLocation: string | null
): MatchResult {
  const haystack = [candidate.title ?? '', ...(candidate.skills ?? [])].join(' ').toLowerCase()

  let score = 0
  let maxScore = 0
  const matchedCriteria: string[] = []
  const missingCriteria: string[] = []

  for (const criterion of criteria) {
    maxScore += criterion.weight
    if (haystack.includes(criterion.label.toLowerCase())) {
      score += criterion.weight
      matchedCriteria.push(criterion.label)
    } else {
      missingCriteria.push(criterion.label)
    }
  }

  // Localisation : critère à poids fixe, uniquement si mission et candidat
  // en précisent une (sinon neutre — un candidat sans localisation n'est
  // pas pénalisé, on ne sait juste pas).
  if (missionLocation && candidate.location) {
    maxScore += 1
    if (candidate.location.trim().toLowerCase() === missionLocation.trim().toLowerCase()) {
      score += 1
      matchedCriteria.push(`Localisation (${missionLocation})`)
    } else {
      missingCriteria.push(`Localisation (${missionLocation})`)
    }
  }

  return {
    score,
    maxScore,
    percent: maxScore > 0 ? Math.round((score / maxScore) * 100) : 0,
    matchedCriteria,
    missingCriteria,
  }
}
