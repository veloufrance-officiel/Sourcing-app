import { describe, expect, it } from 'vitest'
import {
  EVIDENCE_PROPOSAL_TOOL,
  buildCandidateSnapshot,
  candidateEvidenceSource,
} from './evidence-agent-actions'

describe('Evidence-First agent action contract', () => {
  it("n'expose aucun champ de verdict dans le tool Anthropic", () => {
    const schema = EVIDENCE_PROPOSAL_TOOL.input_schema as {
      properties?: {
        proposals?: {
          items?: { properties?: Record<string, unknown> }
        }
      }
    }
    const fields = Object.keys(schema.properties?.proposals?.items?.properties ?? {})

    expect(fields).toEqual(['criterion_id', 'evidence_text', 'source_excerpt'])
  })

  it('construit un snapshot uniquement à partir des champs candidat persistés', () => {
    expect(
      buildCandidateSnapshot({
        full_name: 'Ada Martin',
        title: 'Senior TypeScript Engineer',
        location: 'Toulouse',
        skills: ['TypeScript', 'React'],
      })
    ).toBe(
      'Nom: Ada Martin\nTitre: Senior TypeScript Engineer\nLocalisation: Toulouse\nCompétences: TypeScript, React'
    )
  })

  it('attribue une provenance web stable aux profils GitHub', () => {
    expect(candidateEvidenceSource({ source: 'github', github_user_id: 42 })).toEqual({
      type: 'web_search',
      url: 'https://api.github.com/user/42',
    })
  })

  it('attribue une provenance interne non vérifiée aux profils saisis dans le produit', () => {
    expect(candidateEvidenceSource({ source: 'manual', github_user_id: null })).toEqual({
      type: 'recruiter_note',
      url: null,
    })
  })
})
