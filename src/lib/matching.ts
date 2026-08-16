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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Un critère matche si, dans l'ordre :
// 1. La phrase entière est une sous-chaîne du profil (comportement d'origine,
//    inchangé — c'est le cas le plus fréquent et le plus sûr).
// 2. Le critère contient " ou " : au moins UNE des alternatives suffit. Sans
//    ça, "AWS ou GCP" ne matche jamais personne, y compris un candidat AWS
//    pur, parce que la phrase entière n'est jamais littéralement présente.
// 3. Une compétence du candidat, prise individuellement, est contenue dans
//    le critère — ex. compétence "Spring Boot" contenue dans le critère
//    "Maîtrise de Spring Boot". Sens de vérification inversé par rapport
//    aux deux premiers cas, donc risque différent : une compétence courte
//    (ex. "Go") pourrait matcher à l'intérieur d'un mot plus long (ex.
//    "Gouvernance") par pur hasard de sous-chaîne. D'où la limite de
//    longueur et la vérification par frontière de mot (\b), absentes des
//    cas 1 et 2 qui n'en ont pas besoin (la sous-chaîne y est déjà assez
//    spécifique en pratique).
//
// Limite connue, hors périmètre de cette correction : un critère de durée
// d'expérience qui mentionne une techno ("5 ans d'expérience Java minimum")
// matchera partiellement via la règle 3 dès qu'un candidat liste cette
// techno, indépendamment de son ancienneté réelle. Corriger ça demanderait
// de comprendre la sémantique de la durée, pas juste la présence d'un mot —
// un chantier différent, pas un des deux bugs validés par l'annotation externe.
function criterionMatches(label: string, haystack: string, candidateSkills: string[]): boolean {
  const labelLower = label.toLowerCase()

  if (haystack.includes(labelLower)) return true

  if (labelLower.includes(' ou ')) {
    const alternatives = labelLower
      .split(' ou ')
      .map((s) => s.trim())
      .filter(Boolean)
    if (alternatives.some((alt) => haystack.includes(alt))) return true
  }

  const MIN_SKILL_LENGTH_FOR_REVERSE_MATCH = 3
  for (const skill of candidateSkills) {
    if (skill.length < MIN_SKILL_LENGTH_FOR_REVERSE_MATCH) continue
    const pattern = new RegExp(`\\b${escapeRegExp(skill)}\\b`, 'i')
    if (pattern.test(labelLower)) return true
  }

  return false
}

export function computeMatchScore(
  criteria: Criterion[],
  candidate: CandidateForScoring,
  missionLocation: string | null
): MatchResult {
  const haystack = [candidate.title ?? '', ...(candidate.skills ?? [])].join(' ').toLowerCase()
  const candidateSkills = (candidate.skills ?? []).map((s) => s.toLowerCase())

  let score = 0
  let maxScore = 0
  const matchedCriteria: string[] = []
  const missingCriteria: string[] = []

  for (const criterion of criteria) {
    maxScore += criterion.weight
    if (criterionMatches(criterion.label, haystack, candidateSkills)) {
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
