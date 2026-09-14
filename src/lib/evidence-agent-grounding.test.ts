import { describe, expect, it } from 'vitest'
import { groundEvidenceProposals } from './evidence-agent'

describe('groundEvidenceProposals', () => {
  const sourceText = 'Titre: Senior developer\nLocalisation: Toulouse\nCompétences: TypeScript, React, sécurité applicative'

  it('garde uniquement les propositions dont la citation existe dans le snapshot', () => {
    const result = groundEvidenceProposals({
      sourceText,
      sourceType: 'web_search',
      sourceUrl: 'https://api.github.com/user/42',
      proposals: [
        {
          criterion_id: 'criterion-typescript',
          evidence_text: 'Le profil mentionne TypeScript.',
          source_excerpt: 'TypeScript',
        },
      ],
    })

    expect(result).toEqual([
      {
        criterion_id: 'criterion-typescript',
        evidence_text: 'Le profil mentionne TypeScript. [Source: TypeScript]',
        source_type: 'web_search',
        source_url: 'https://api.github.com/user/42',
      },
    ])
  })

  it("rejette une citation inventée qui n'existe pas dans le snapshot", () => {
    const result = groundEvidenceProposals({
      sourceText,
      sourceType: 'web_search',
      sourceUrl: 'https://api.github.com/user/42',
      proposals: [
        {
          criterion_id: 'criterion-security',
          evidence_text: 'Le candidat possède une certification.',
          source_excerpt: 'Certification professionnelle',
        },
      ],
    })

    expect(result).toEqual([])
  })

  it('ignore les statuts ou décisions que le modèle tenterait de fournir', () => {
    const result = groundEvidenceProposals({
      sourceText,
      sourceType: 'recruiter_note',
      sourceUrl: null,
      proposals: [
        {
          criterion_id: 'criterion-security',
          evidence_text: 'Le snapshot mentionne la sécurité applicative.',
          source_excerpt: 'sécurité applicative',
          status: 'VERIFIED',
          eligibility: 'ELIGIBLE',
        },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]).not.toHaveProperty('status')
    expect(result[0]).not.toHaveProperty('eligibility')
  })
})
