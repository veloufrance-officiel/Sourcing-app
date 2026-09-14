import { describe, expect, it } from 'vitest'
import { buildEvidenceDrafts } from './evidence-agent'

describe('buildEvidenceDrafts', () => {
  const mandatoryCriteria = [
    { id: 'criterion-typescript', label: 'TypeScript obligatoire' },
    { id: 'criterion-security', label: 'Expérience sécurité obligatoire' },
  ]

  it('convertit une proposition étayée en INFERRED_UNCONFIRMED uniquement', () => {
    const result = buildEvidenceDrafts({
      candidateId: 'candidate-1',
      tenantId: 'tenant-1',
      mandatoryCriteria,
      proposals: [
        {
          criterion_id: 'criterion-typescript',
          evidence_text: 'Le profil mentionne TypeScript dans ses compétences publiques.',
          source_type: 'web_search',
          source_url: 'https://example.com/candidate-1',
        },
      ],
    })

    expect(result).toEqual([
      {
        tenant_id: 'tenant-1',
        candidate_id: 'candidate-1',
        criterion_id: 'criterion-typescript',
        status: 'INFERRED_UNCONFIRMED',
        is_inference: true,
        evidence_text: 'Le profil mentionne TypeScript dans ses compétences publiques.',
        source_type: 'web_search',
        source_priority: 3,
        source_url: 'https://example.com/candidate-1',
      },
    ])
  })

  it('rejette une proposition sans preuve textuelle exploitable', () => {
    const result = buildEvidenceDrafts({
      candidateId: 'candidate-1',
      tenantId: 'tenant-1',
      mandatoryCriteria,
      proposals: [
        {
          criterion_id: 'criterion-typescript',
          evidence_text: '   ',
          source_type: 'web_search',
          source_url: 'https://example.com/candidate-1',
        },
      ],
    })

    expect(result).toEqual([])
  })

  it('rejette une proposition sans source', () => {
    const result = buildEvidenceDrafts({
      candidateId: 'candidate-1',
      tenantId: 'tenant-1',
      mandatoryCriteria,
      proposals: [
        {
          criterion_id: 'criterion-typescript',
          evidence_text: 'TypeScript est mentionné.',
          source_type: '',
          source_url: '',
        },
      ],
    })

    expect(result).toEqual([])
  })

  it('rejette tout critère qui ne fait pas partie des hard gates de la mission', () => {
    const result = buildEvidenceDrafts({
      candidateId: 'candidate-1',
      tenantId: 'tenant-1',
      mandatoryCriteria,
      proposals: [
        {
          criterion_id: 'criterion-invented-by-ai',
          evidence_text: 'Signal inventé pour un critère inconnu.',
          source_type: 'web_search',
          source_url: 'https://example.com/candidate-1',
        },
      ],
    })

    expect(result).toEqual([])
  })

  it('ignore les champs hostiles VERIFIED et ELIGIBLE fournis par une IA', () => {
    const result = buildEvidenceDrafts({
      candidateId: 'candidate-1',
      tenantId: 'tenant-1',
      mandatoryCriteria,
      proposals: [
        {
          criterion_id: 'criterion-security',
          evidence_text: 'Le profil public mentionne une mission de sécurité.',
          source_type: 'web_search',
          source_url: 'https://example.com/candidate-1',
          status: 'VERIFIED',
          eligibility: 'ELIGIBLE',
        },
      ],
    })

    expect(result).toHaveLength(1)
    expect(result[0]?.status).toBe('INFERRED_UNCONFIRMED')
    expect(result[0]?.is_inference).toBe(true)
    expect(result[0]).not.toHaveProperty('eligibility')
    expect(result[0]).not.toHaveProperty('eligibility_status')
  })

  it('déduplique les mêmes preuves pour éviter les insertions identiques', () => {
    const proposal = {
      criterion_id: 'criterion-typescript',
      evidence_text: 'TypeScript apparaît dans le profil.',
      source_type: 'web_search',
      source_url: 'https://example.com/candidate-1',
    }

    const result = buildEvidenceDrafts({
      candidateId: 'candidate-1',
      tenantId: 'tenant-1',
      mandatoryCriteria,
      proposals: [proposal, { ...proposal }],
    })

    expect(result).toHaveLength(1)
  })
})
