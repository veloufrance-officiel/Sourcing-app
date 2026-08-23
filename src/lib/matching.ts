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
// Limite connue, corrigée ici : un critère de durée d'expérience qui
// mentionne une techno ("5 ans d'expérience Java minimum") matchait
// partiellement via la règle 3 dès qu'un candidat listait cette techno,
// indépendamment de son ancienneté réelle. Vérifié contre la vraie base
// avant cette correction : 7 critères réels portent déjà ce pattern
// exact, pas un cas hypothétique.
//
// Détection ciblée par regex, pas une taxonomie de types de critères
// complète (technology/certification/location/availability/rate/
// language) — le document externe qui a signalé ce cas déconseille
// lui-même un moteur NLP complexe pour ce qui reste un problème de
// reconnaissance de motif, pas de compréhension sémantique générale.
const YEARS_EXPERIENCE_PATTERN = /(\d+)\s*(?:an|ans|année|années)\b/i

function extractRequiredYears(label: string): number | null {
  const match = label.match(YEARS_EXPERIENCE_PATTERN)
  if (!match) return null
  return parseInt(match[1] as string, 10)
}

// Cherche une durée dans le texte candidat, sans supposer qu'elle porte
// sur la même techno que le critère — le système ne sait déjà pas
// aujourd'hui associer une durée précise à une compétence précise dans
// un texte libre, ce serait un vrai moteur NLP, hors périmètre. Ce
// qu'on peut honnêtement garantir : si le candidat ne mentionne AUCUNE
// durée nulle part, un critère de durée ne doit jamais être considéré
// comme prouvé par la seule présence du nom de la techno.
function candidateHasAnyYearsMention(haystack: string): boolean {
  return YEARS_EXPERIENCE_PATTERN.test(haystack)
}

// Marqueurs de négation les plus courants juste avant un terme
// recherché — volontairement une liste courte et sûre plutôt qu'une
// détection sémantique complète (même esprit que le reste de ce
// fichier : préférer NOT_VERIFIED à un faux positif, sans construire
// un système gigantesque). Couvre le cas signalé : "pas d'expérience
// Kubernetes" ne doit jamais compter comme "Kubernetes" prouvé.
// Limite assumée, pas cachée : une négation plus éloignée du terme
// dans la phrase ("Kubernetes ? Je n'en ai jamais fait") n'est pas
// détectée par ce garde-fou simple.
const NEGATION_MARKERS = ['pas d', "pas d'", 'aucune expérience', 'aucun', 'jamais utilisé', 'jamais fait', 'sans expérience']

function isNegatedMention(haystack: string, term: string): boolean {
  const index = haystack.indexOf(term)
  if (index === -1) return false
  // Fenêtre de 30 caractères avant le terme trouvé : assez pour capter
  // "pas d'expérience Kubernetes" sans remonter jusqu'à une négation
  // sans rapport plus tôt dans un texte long.
  const before = haystack.slice(Math.max(0, index - 30), index)
  return NEGATION_MARKERS.some((marker) => before.includes(marker))
}

function criterionMatches(label: string, haystack: string, candidateSkills: string[]): boolean {
  const labelLower = label.toLowerCase()

  // Critère de durée d'expérience : la présence du nom de la techno
  // seule (règle 3 plus bas) ne suffit jamais. Le candidat doit au
  // moins mentionner une durée quelque part dans son profil — pas une
  // preuve que la durée correspond exactement au critère (ça resterait
  // une inférence, jamais un VERIFIED automatique dans le vrai système
  // d'Evidence), mais un vrai garde-fou contre le faux positif nommé
  // dans le document : "Java developer" ne doit jamais suffire à
  // matcher "5 ans d'expérience Java minimum".
  const requiredYears = extractRequiredYears(labelLower)
  if (requiredYears !== null && !candidateHasAnyYearsMention(haystack)) {
    return false
  }

  // Faux positif confirmé et reproduit avant correction (audit
  // sécurité) : un label mono-mot ("Java") matchait par simple
  // sous-chaîne à l'intérieur d'un mot plus long non lié
  // ("JavaScript"), et une mention niée ("pas d'expérience
  // Kubernetes") matchait comme si elle était positive. Les deux
  // corrigés ici. Frontière de mot réservée aux labels mono-mot : un
  // label multi-mots ("Chef de projet cybersécurité") doit rester une
  // vérification de sous-chaîne classique, une frontière de mot sur
  // la phrase entière casserait des cas légitimes déjà couverts.
  //
  // Limite assumée, pas résolue ici (hors périmètre de ce correctif,
  // demanderait une vraie décision de conception) : "formation Java"
  // matche toujours comme "Java" — distinguer une mention de
  // compétence d'une simple mention de formation suivie nécessiterait
  // soit une liste de marqueurs disqualifiants plus large que la
  // négation, soit un vrai NLP, que ce fichier évite délibérément.
  const isSingleWord = !labelLower.includes(' ')
  if (isSingleWord) {
    const pattern = new RegExp(`\\b${escapeRegExp(labelLower)}\\b`, 'i')
    if (pattern.test(haystack) && !isNegatedMention(haystack, labelLower)) return true
  } else if (haystack.includes(labelLower) && !isNegatedMention(haystack, labelLower)) {
    return true
  }

  // Deux séparateurs d'alternatives reconnus : " ou " (déjà en place)
  // et "/" — trouvé manquant précisément sur ce brief, où toutes les
  // alternatives ("AWS / Azure / GCP", "pentest / red teaming") sont
  // écrites avec une barre oblique, jamais "ou". Sans cette extension,
  // reproduit avant correction : un candidat réellement certifié AWS
  // ne matchait jamais le critère "certification AWS / Azure / GCP" —
  // un faux-négatif dangereux (un bon profil rejeté à tort), pas
  // seulement un faux positif comme les cas déjà corrigés.
  const alternativeSeparator = labelLower.includes(' ou ') ? ' ou ' : labelLower.includes('/') ? '/' : null
  if (alternativeSeparator) {
    const rawAlternatives = labelLower
      .split(alternativeSeparator)
      .map((s) => s.trim())
      .filter(Boolean)
    // Défaut structurel préexistant trouvé en testant ce brief (pas
    // introduit par l'ajout du séparateur "/", reproduit aussi avec
    // " ou "), jamais couvert avant faute d'un cas de test à 3+
    // alternatives avec préfixe commun : "certification AWS / Azure /
    // GCP" donnait ['certification aws', 'azure', 'gcp'] — seule la
    // première alternative gardait le mot "certification", les
    // suivantes le perdaient, alors que le sens métier est
    // "certification AWS" OU "certification Azure" OU
    // "certification GCP". Le préfixe commun (tous les mots du
    // premier fragment sauf le dernier, présumé être le nom de la
    // techno qui varie) est maintenant propagé sur chaque alternative
    // suivante qui n'a qu'un seul mot.
    const firstWords = rawAlternatives[0]?.split(' ') ?? []
    const commonPrefix = firstWords.length > 1 ? firstWords.slice(0, -1).join(' ') + ' ' : ''
    const alternatives = rawAlternatives.map((alt, i) => (i > 0 && !alt.includes(' ') ? commonPrefix + alt : alt))
    if (alternatives.some((alt) => haystack.includes(alt) && !isNegatedMention(haystack, alt))) return true
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
