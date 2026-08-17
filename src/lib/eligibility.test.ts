import { describe, it, expect } from 'vitest'
import { computeEligibility, type ObligatoireCriterionEvidence } from './eligibility'

describe('FINAL DECISION MODEL GATE — cas obligatoires A-D', () => {
  it('A — tous obligatoires VERIFIED -> ELIGIBLE', () => {
    const criteria: ObligatoireCriterionEvidence[] = [
      { criterionId: 'react', status: 'VERIFIED' },
      { criterionId: 'experience', status: 'VERIFIED' },
    ]
    expect(computeEligibility(criteria)).toEqual({ status: 'ELIGIBLE', flags: [] })
  })

  it('B — un obligatoire CONTRADICTED -> INELIGIBLE', () => {
    const criteria: ObligatoireCriterionEvidence[] = [
      { criterionId: 'react', status: 'CONTRADICTED' },
      { criterionId: 'experience', status: 'VERIFIED' },
    ]
    expect(computeEligibility(criteria)).toEqual({ status: 'INELIGIBLE', flags: [] })
  })

  it('C — un obligatoire NOT_VERIFIED -> NOT_QUALIFIED', () => {
    const criteria: ObligatoireCriterionEvidence[] = [
      { criterionId: 'react', status: 'NOT_VERIFIED' },
      { criterionId: 'experience', status: 'VERIFIED' },
    ]
    expect(computeEligibility(criteria)).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })

  it('D — plusieurs obligatoires, mélange NOT_VERIFIED/CONTRADICTED -> INELIGIBLE (CONTRADICTED prime toujours)', () => {
    const criteria: ObligatoireCriterionEvidence[] = [
      { criterionId: 'react', status: 'NOT_VERIFIED' },
      { criterionId: 'experience', status: 'CONTRADICTED' },
      { criterionId: 'typescript', status: 'NOT_VERIFIED' },
      { criterionId: 'nodejs', status: 'NOT_VERIFIED' },
    ]
    // Un seul CONTRADICTED disqualifie même si 3 autres obligatoires sur 4
    // sont seulement NOT_VERIFIED — vérifié explicitement, pas supposé.
    expect(computeEligibility(criteria)).toEqual({ status: 'INELIGIBLE', flags: [] })
  })

  it("exemple du document — candidat A (React VERIFIED, Expérience VERIFIED) -> ELIGIBLE", () => {
    expect(
      computeEligibility([
        { criterionId: 'react', status: 'VERIFIED' },
        { criterionId: 'experience', status: 'VERIFIED' },
      ])
    ).toEqual({ status: 'ELIGIBLE', flags: [] })
  })

  it('exemple du document — candidat B (React CONTRADICTED, Expérience VERIFIED) -> INELIGIBLE', () => {
    expect(
      computeEligibility([
        { criterionId: 'react', status: 'CONTRADICTED' },
        { criterionId: 'experience', status: 'VERIFIED' },
      ])
    ).toEqual({ status: 'INELIGIBLE', flags: [] })
  })

  it('exemple du document — candidat C (React NOT_VERIFIED, Expérience VERIFIED) -> NOT_QUALIFIED', () => {
    expect(
      computeEligibility([
        { criterionId: 'react', status: 'NOT_VERIFIED' },
        { criterionId: 'experience', status: 'VERIFIED' },
      ])
    ).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })

  it('exemple du document — candidat D (React VERIFIED, Expérience NOT_VERIFIED) -> NOT_QUALIFIED', () => {
    expect(
      computeEligibility([
        { criterionId: 'react', status: 'VERIFIED' },
        { criterionId: 'experience', status: 'NOT_VERIFIED' },
      ])
    ).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })
})

describe('Cas limite E — aucun critère obligatoire', () => {
  it('mission sans critère obligatoire -> ELIGIBLE + NO_HARD_CONSTRAINTS (Décision 1)', () => {
    expect(computeEligibility([])).toEqual({ status: 'ELIGIBLE', flags: ['NO_HARD_CONSTRAINTS'] })
  })
})

describe('Contrainte non négociable — INFERRED_UNCONFIRMED ne compte jamais comme VERIFIED', () => {
  it('un obligatoire INFERRED_UNCONFIRMED seul -> NOT_QUALIFIED, jamais ELIGIBLE', () => {
    const criteria: ObligatoireCriterionEvidence[] = [{ criterionId: 'react', status: 'INFERRED_UNCONFIRMED' }]
    expect(computeEligibility(criteria)).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })

  it('tous VERIFIED sauf un INFERRED_UNCONFIRMED -> NOT_QUALIFIED, pas ELIGIBLE malgré la quasi-totalité vérifiée', () => {
    const criteria: ObligatoireCriterionEvidence[] = [
      { criterionId: 'react', status: 'VERIFIED' },
      { criterionId: 'experience', status: 'VERIFIED' },
      { criterionId: 'llm', status: 'INFERRED_UNCONFIRMED' },
    ]
    expect(computeEligibility(criteria)).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })
})

describe('Absence totale de preuve pour un critère (status=null)', () => {
  it('critère obligatoire sans aucune ligne evidence -> NOT_QUALIFIED, jamais INELIGIBLE', () => {
    // L'absence de preuve n'est PAS une incompatibilité démontrée — c'est
    // le principe central du FINAL DECISION MODEL GATE.
    const criteria: ObligatoireCriterionEvidence[] = [{ criterionId: 'react', status: null }]
    expect(computeEligibility(criteria)).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })
})

describe('Cas Vincent Cazenave — 13 critères obligatoires, 0 preuve', () => {
  it('13/13 NOT_VERIFIED -> NOT_QUALIFIED, jamais présenté comme "ne correspond pas"', () => {
    const criteria: ObligatoireCriterionEvidence[] = Array.from({ length: 13 }, (_, i) => ({
      criterionId: `critere-${i}`,
      status: 'NOT_VERIFIED' as const,
    }))
    expect(computeEligibility(criteria)).toEqual({ status: 'NOT_QUALIFIED', flags: [] })
  })
})
