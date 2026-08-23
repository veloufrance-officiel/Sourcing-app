// Hard gate TJM (mission Architecte Cybersécurité, plafond 700€) —
// les 5 scénarios exacts demandés, valeurs numériques précises, pas
// approximées.
import { describe, it, expect } from 'vitest'
import { evaluateDailyRateGate } from './daily-rate-gate'
import { computeEligibility, type ObligatoireCriterionEvidence } from './eligibility'

const MAX_DAILY_RATE = 700

describe('evaluateDailyRateGate — mission Architecte Cybersécurité, plafond 700€', () => {
  it('650€ -> VERIFIED, ne doit jamais être rejeté pour le TJM', () => {
    expect(evaluateDailyRateGate(650, MAX_DAILY_RATE).status).toBe('VERIFIED')
  })

  it('700€ (exactement le plafond) -> VERIFIED, le seuil est inclusif (<=), pas exclusif (<)', () => {
    expect(evaluateDailyRateGate(700, MAX_DAILY_RATE).status).toBe('VERIFIED')
  })

  it('701€ (un seul euro au-dessus) -> CONTRADICTED', () => {
    expect(evaluateDailyRateGate(701, MAX_DAILY_RATE).status).toBe('CONTRADICTED')
  })

  it('750€ -> CONTRADICTED', () => {
    expect(evaluateDailyRateGate(750, MAX_DAILY_RATE).status).toBe('CONTRADICTED')
  })

  it('TJM inconnu (null) -> NOT_VERIFIED, jamais VERIFIED ni CONTRADICTED par défaut', () => {
    expect(evaluateDailyRateGate(null, MAX_DAILY_RATE).status).toBe('NOT_VERIFIED')
  })
})

describe('Hard gate TJM intégré à eligibility — un score de matching élevé ne peut jamais le contourner', () => {
  it('Match 95% + TJM 750€ -> INELIGIBLE (exemple exact du brief)', () => {
    const tjmGate = evaluateDailyRateGate(750, MAX_DAILY_RATE)
    const obligatoires: ObligatoireCriterionEvidence[] = [
      { criterionId: 'tjm', status: tjmGate.status },
      { criterionId: 'crit-1', status: 'VERIFIED' },
      { criterionId: 'crit-2', status: 'VERIFIED' },
    ]
    // Le score (95%) n'entre à aucun moment dans ce calcul — c'est
    // exactement ce que "hard gate, pas un élément du scoring" impose :
    // computeEligibility ne reçoit même pas de score en paramètre.
    expect(computeEligibility(obligatoires).status).toBe('INELIGIBLE')
  })

  it('Match 80% + TJM 650€ + autres critères à confirmer -> NOT_QUALIFIED (exemple exact du brief)', () => {
    const tjmGate = evaluateDailyRateGate(650, MAX_DAILY_RATE)
    const obligatoires: ObligatoireCriterionEvidence[] = [
      { criterionId: 'tjm', status: tjmGate.status },
      { criterionId: 'crit-1', status: 'NOT_VERIFIED' },
    ]
    expect(computeEligibility(obligatoires).status).toBe('NOT_QUALIFIED')
  })

  it('Match 88% + TJM 700€ + tous critères obligatoires VERIFIED -> ELIGIBLE (exemple exact du brief)', () => {
    const tjmGate = evaluateDailyRateGate(700, MAX_DAILY_RATE)
    const obligatoires: ObligatoireCriterionEvidence[] = [
      { criterionId: 'tjm', status: tjmGate.status },
      { criterionId: 'crit-1', status: 'VERIFIED' },
      { criterionId: 'crit-2', status: 'VERIFIED' },
    ]
    expect(computeEligibility(obligatoires).status).toBe('ELIGIBLE')
  })

  it('TJM obligatoire mais inconnu -> NOT_QUALIFIED, jamais INELIGIBLE ni ELIGIBLE par défaut', () => {
    const tjmGate = evaluateDailyRateGate(null, MAX_DAILY_RATE)
    const obligatoires: ObligatoireCriterionEvidence[] = [
      { criterionId: 'tjm', status: tjmGate.status },
      { criterionId: 'crit-1', status: 'VERIFIED' },
    ]
    expect(computeEligibility(obligatoires).status).toBe('NOT_QUALIFIED')
  })
})

describe('Non-contournement du hard gate par le score (points 10 et 11 du brief)', () => {
  it('score 95% + plusieurs obligatoires NOT_VERIFIED != ELIGIBLE — computeEligibility ne prend même pas de score en paramètre', () => {
    // Le score n'existe pas dans cette fonction — la preuve la plus
    // forte de non-contournement est que la signature elle-même ne
    // laisse aucune place à un score qui influencerait la décision.
    const obligatoires: ObligatoireCriterionEvidence[] = [
      { criterionId: 'crit-1', status: 'NOT_VERIFIED' },
      { criterionId: 'crit-2', status: 'NOT_VERIFIED' },
      { criterionId: 'crit-3', status: 'NOT_VERIFIED' },
    ]
    // Score élevé simulé à côté, jamais transmis à computeEligibility —
    // le test documente explicitement qu'il n'y a nulle part où le
    // passer, pas seulement qu'on choisit de ne pas le faire.
    const simulatedHighScore = 95
    expect(simulatedHighScore).toBe(95) // le score existe, mais...
    expect(computeEligibility(obligatoires).status).toBe('NOT_QUALIFIED')
    expect(computeEligibility(obligatoires).status).not.toBe('ELIGIBLE')
  })

  it("score faible + tous obligatoires VERIFIED -> ELIGIBLE quand même, le score ne crée jamais artificiellement une inéligibilité", () => {
    const obligatoires: ObligatoireCriterionEvidence[] = [
      { criterionId: 'crit-1', status: 'VERIFIED' },
      { criterionId: 'crit-2', status: 'VERIFIED' },
    ]
    // Même logique : aucun score transmis, un score bas simulé à côté
    // ne peut donc structurellement rien changer au résultat.
    const simulatedLowScore = 20
    expect(simulatedLowScore).toBe(20)
    expect(computeEligibility(obligatoires).status).toBe('ELIGIBLE')
  })
})
