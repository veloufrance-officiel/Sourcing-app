export type EvidenceSourceType =
  | 'self_declared'
  | 'cv_upload'
  | 'recruiter_note'
  | 'third_party_reference'
  | 'web_search'

export type EvidenceDraft = {
  tenant_id: string
  candidate_id: string
  criterion_id: string
  status: 'INFERRED_UNCONFIRMED'
  is_inference: true
  evidence_text: string
  source_type: EvidenceSourceType
  source_priority: 3
  source_url: string | null
}

type Input = {
  tenantId: string
  candidateId: string
  mandatoryCriteria: { id: string; label: string }[]
  proposals: unknown[]
}

const SOURCE_TYPES = new Set<string>([
  'self_declared',
  'cv_upload',
  'recruiter_note',
  'third_party_reference',
  'web_search',
])

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function groundEvidenceProposals(input: {
  sourceText: string
  sourceType: EvidenceSourceType
  sourceUrl: string | null
  proposals: unknown[]
}) {
  const result: Array<{
    criterion_id: string
    evidence_text: string
    source_type: EvidenceSourceType
    source_url: string | null
  }> = []

  for (const raw of input.proposals) {
    const proposal = record(raw)
    if (!proposal) continue
    const criterionId = text(proposal.criterion_id)
    const evidenceText = text(proposal.evidence_text)
    const excerpt = text(proposal.source_excerpt)
    if (!criterionId || !evidenceText || !excerpt) continue
    if (!input.sourceText.includes(excerpt)) continue
    result.push({
      criterion_id: criterionId,
      evidence_text: `${evidenceText} [Source: ${excerpt}]`,
      source_type: input.sourceType,
      source_url: input.sourceUrl,
    })
  }

  return result
}

export function buildEvidenceDrafts(input: Input): EvidenceDraft[] {
  const allowedCriteria = new Set(input.mandatoryCriteria.map((criterion) => criterion.id))
  const seen = new Set<string>()
  const result: EvidenceDraft[] = []

  for (const raw of input.proposals) {
    const proposal = record(raw)
    if (!proposal) continue

    const criterionId = text(proposal.criterion_id)
    const evidenceText = text(proposal.evidence_text)
    const sourceType = text(proposal.source_type)
    const sourceUrl = text(proposal.source_url) || null

    if (!allowedCriteria.has(criterionId) || !evidenceText || !SOURCE_TYPES.has(sourceType)) continue

    const key = `${criterionId}|${evidenceText}|${sourceType}|${sourceUrl ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)

    result.push({
      tenant_id: input.tenantId,
      candidate_id: input.candidateId,
      criterion_id: criterionId,
      status: 'INFERRED_UNCONFIRMED',
      is_inference: true,
      evidence_text: evidenceText,
      source_type: sourceType as EvidenceSourceType,
      source_priority: 3,
      source_url: sourceUrl,
    })
  }

  return result
}
