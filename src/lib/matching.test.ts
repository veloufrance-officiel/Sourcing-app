import { describe, it, expect } from 'vitest'
import { computeMatchScore, type Criterion } from './matching'

describe('computeMatchScore — comportement d\'origine (non touché par la correction)', () => {
  it('matche un critère simple présent tel quel', () => {
    const criteria: Criterion[] = [{ label: 'Python', weight: 3 }]
    const result = computeMatchScore(criteria, { title: null, skills: ['Python', 'Django'], location: null }, null)
    expect(result.matchedCriteria).toContain('Python')
    expect(result.percent).toBe(100)
  })

  it('ne matche pas un critère absent', () => {
    const criteria: Criterion[] = [{ label: 'Kubernetes', weight: 3 }]
    const result = computeMatchScore(criteria, { title: null, skills: ['Python'], location: null }, null)
    expect(result.missingCriteria).toContain('Kubernetes')
    expect(result.percent).toBe(0)
  })

  it('bonus de localisation inchangé', () => {
    const criteria: Criterion[] = []
    const result = computeMatchScore(criteria, { title: null, skills: [], location: 'Paris' }, 'Paris')
    expect(result.matchedCriteria).toContain('Localisation (Paris)')
  })
})

describe('Bug 1 — critères "X ou Y" (validé : 9/9 occurrences du corpus benchmark ne matchaient jamais personne)', () => {
  it('matche via la première alternative', () => {
    const criteria: Criterion[] = [{ label: 'AWS ou GCP', weight: 2 }]
    const result = computeMatchScore(criteria, { title: null, skills: ['AWS', 'Terraform'], location: null }, null)
    expect(result.matchedCriteria).toContain('AWS ou GCP')
  })

  it('matche via la seconde alternative', () => {
    const criteria: Criterion[] = [{ label: 'Java ou Kotlin', weight: 3 }]
    const result = computeMatchScore(criteria, { title: 'Développeur Kotlin', skills: ['Kotlin', 'Spring Boot'], location: null }, null)
    expect(result.matchedCriteria).toContain('Java ou Kotlin')
  })

  it('ne matche toujours pas si aucune alternative n\'est présente', () => {
    const criteria: Criterion[] = [{ label: 'AWS ou GCP', weight: 2 }]
    const result = computeMatchScore(criteria, { title: null, skills: ['Azure'], location: null }, null)
    expect(result.missingCriteria).toContain('AWS ou GCP')
  })

  it('cas réel du corpus : Thomas Petit (Kotlin pur) contre "Java ou Kotlin"', () => {
    const criteria: Criterion[] = [{ label: 'Java ou Kotlin', weight: 3 }]
    const result = computeMatchScore(
      criteria,
      { title: 'Développeur Kotlin Backend 6 ans', skills: ['Kotlin', 'Spring Boot', 'Kafka'], location: null },
      null
    )
    expect(result.percent).toBe(100)
  })
})

describe('Bug 2 — critère en phrase vs compétence simple listée (validé : Camille Dubois, match quasi parfait, ne matchait que 1/4 critères)', () => {
  it('matche une compétence simple contenue dans un critère en phrase', () => {
    const criteria: Criterion[] = [{ label: 'Maîtrise de Spring Boot', weight: 3 }]
    const result = computeMatchScore(criteria, { title: null, skills: ['Spring Boot'], location: null }, null)
    expect(result.matchedCriteria).toContain('Maîtrise de Spring Boot')
  })

  it('cas réel du corpus : Camille Dubois (Java, Spring Boot, Kafka, Kubernetes) contre les 4 critères de "Développeur Java Senior — Banque"', () => {
    const criteria: Criterion[] = [
      { label: "5 ans d'expérience Java minimum", weight: 3 },
      { label: 'Maîtrise de Spring Boot', weight: 3 },
      { label: 'Architecture événementielle Kafka', weight: 2 },
      { label: 'Kubernetes', weight: 1 },
    ]
    const result = computeMatchScore(
      criteria,
      { title: 'Développeur Java Senior 6 ans', skills: ['Java', 'Spring Boot', 'Kafka', 'Kubernetes'], location: null },
      null
    )
    // Avant correction : seul "Kubernetes" matchait (1/4). Après : Spring Boot et
    // Kafka matchent aussi via la règle 3. Le critère de durée reste hors
    // périmètre (limite documentée, voir commentaire dans matching.ts).
    expect(result.matchedCriteria).toContain('Maîtrise de Spring Boot')
    expect(result.matchedCriteria).toContain('Architecture événementielle Kafka')
    expect(result.matchedCriteria).toContain('Kubernetes')
  })

  it('protection anti faux-positif : une compétence courte ne matche pas à l\'intérieur d\'un mot plus long', () => {
    const criteria: Criterion[] = [{ label: 'Gouvernance des données', weight: 3 }]
    const result = computeMatchScore(criteria, { title: null, skills: ['Go'], location: null }, null)
    // "Go" ne doit PAS matcher "Gouvernance" via la règle 3 (frontière de mot).
    expect(result.missingCriteria).toContain('Gouvernance des données')
  })

  it('limite connue et acceptée : un critère de durée matche partiellement via le nom de la techno seul', () => {
    // Documente explicitement le comportement plutôt que de le laisser
    // implicite — voir le commentaire dans matching.ts. Ce test ne doit
    // JAMAIS être supprimé silencieusement s'il "passe" de façon inattendue :
    // s'il échoue après un futur changement, c'est un signal à examiner,
    // pas un bug à re-corriger sans réflexion.
    const criteria: Criterion[] = [{ label: "5 ans d'expérience Java minimum", weight: 3 }]
    const result = computeMatchScore(
      criteria,
      { title: 'Développeur Java Junior 1 an', skills: ['Java', 'Spring Boot'], location: null },
      null
    )
    expect(result.matchedCriteria).toContain("5 ans d'expérience Java minimum")
  })
})
