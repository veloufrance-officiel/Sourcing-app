// Hard gate TJM — vrai gap trouvé en audit, pas déjà couvert : aucune
// logique de comparaison numérique de seuil n'existait dans le moteur
// avant ce fichier (matching.ts ne fait que du texte, eligibility.ts
// n'agrège que des statuts déjà calculés). Le TJM candidat n'existe
// nulle part en base non plus (vérifié avant d'écrire ce fichier),
// donc ce hard gate produit un EvidenceStatus à partir d'un montant et
// d'un plafond, exactement comme un humain poserait une evidence
// après avoir lu le TJM sur un profil — pas un nouveau champ dédié en
// base, pas une migration.
//
// Séparé délibérément de matching.ts (texte, scoring indicatif) et
// eligibility.ts (agrégation de statuts déjà obligatoires) : "ce
// critère est un hard gate, pas un élément du scoring" — un concept
// distinct des deux autres, mérite son propre fichier plutôt que
// d'être mélangé dans l'un ou l'autre.
import type { EvidenceStatus } from './eligibility'

export type DailyRateGateResult = {
  status: EvidenceStatus | null
  // null seulement quand le TJM est réellement inconnu — distinct de
  // NOT_VERIFIED, qui suppose qu'on sait qu'une preuve doit exister
  // mais n'a pas encore été apportée. Ici, on ne sait même pas si la
  // donnée existe.
}

// dailyRate: null si inconnu — jamais deviné, jamais supposé à 0 ou à
// une valeur par défaut. maxDailyRate: le plafond défini sur la
// mission (missions.daily_rate, déjà existant, réutilisé tel quel —
// aucune nouvelle colonne).
export function evaluateDailyRateGate(dailyRate: number | null, maxDailyRate: number): DailyRateGateResult {
  if (dailyRate === null) {
    // TJM inconnu : ni VERIFIED ni CONTRADICTED, ce n'est ni prouvé ni
    // contredit — NOT_VERIFIED, cohérent avec le reste du modèle
    // Evidence. L'appelant (eligibility) décide ensuite NOT_QUALIFIED
    // si ce critère est marqué obligatoire, jamais ce fichier.
    return { status: 'NOT_VERIFIED' }
  }
  if (dailyRate <= maxDailyRate) {
    return { status: 'VERIFIED' }
  }
  return { status: 'CONTRADICTED' }
}
