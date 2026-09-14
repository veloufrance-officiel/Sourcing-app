export const EVIDENCE_PROPOSAL_TOOL = {
  name: 'propose_candidate_evidence',
  input_schema: {
    type: 'object',
    properties: {
      proposals: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            criterion_id: { type: 'string' },
            evidence_text: { type: 'string' },
            source_excerpt: { type: 'string' },
          },
        },
      },
    },
  },
} as const

export function buildCandidateSnapshot(candidate: {
  full_name: string
  title: string | null
  location: string | null
  skills: string[] | null
}): string {
  return [
    `Nom: ${candidate.full_name}`,
    candidate.title ? `Titre: ${candidate.title}` : null,
    candidate.location ? `Localisation: ${candidate.location}` : null,
    candidate.skills?.length ? `Compétences: ${candidate.skills.join(', ')}` : null,
  ].filter(Boolean).join('\n')
}

export function candidateEvidenceSource(candidate: {
  source: string | null
  github_user_id: number | null
}) {
  return candidate.source === 'github' && candidate.github_user_id !== null
    ? { type: 'web_search' as const, url: `https://api.github.com/user/${candidate.github_user_id}` }
    : { type: 'recruiter_note' as const, url: null }
}
