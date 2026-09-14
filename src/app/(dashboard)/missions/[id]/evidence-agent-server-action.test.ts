import { beforeEach, describe, expect, it, vi } from 'vitest'
import { runEvidenceAgent } from './evidence-agent-server-action'

const mockGetUser = vi.fn()
const mockAppUserSingle = vi.fn()
const mockLinkSingle = vi.fn()
const mockCandidateSingle = vi.fn()
const mockCriteriaSelect = vi.fn()
const mockEvidenceInsert = vi.fn()
const mockActivityInsert = vi.fn()
const mockRpc = vi.fn()
const mockMessagesCreate = vi.fn()
const mockGetAnthropic = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    rpc: mockRpc,
    from: (table: string) => {
      if (table === 'app_users') {
        return { select: () => ({ eq: () => ({ single: mockAppUserSingle }) }) }
      }
      if (table === 'mission_candidates') {
        return { select: () => ({ eq: () => ({ eq: () => ({ single: mockLinkSingle }) }) }) }
      }
      if (table === 'candidates') {
        return { select: () => ({ eq: () => ({ single: mockCandidateSingle }) }) }
      }
      if (table === 'brief_criteria') {
        return { select: () => ({ eq: () => ({ eq: mockCriteriaSelect }) }) }
      }
      if (table === 'evidence') return { insert: mockEvidenceInsert }
      if (table === 'activity_log') return { insert: mockActivityInsert }
      throw new Error(`Table non mockée : ${table}`)
    },
  })),
}))

vi.mock('@/lib/anthropic', () => ({
  getAnthropicClientForTenantSafe: mockGetAnthropic,
}))

vi.mock('@/lib/log', () => ({ logServerError: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function formData(): FormData {
  const fd = new FormData()
  fd.set('mission_id', 'mission-1')
  fd.set('candidate_id', 'candidate-1')
  return fd
}

describe('runEvidenceAgent', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockAppUserSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockLinkSingle.mockResolvedValue({ data: { candidate_id: 'candidate-1' } })
    mockCandidateSingle.mockResolvedValue({
      data: {
        id: 'candidate-1',
        full_name: 'Ada Martin',
        title: 'Senior TypeScript Engineer',
        location: 'Toulouse',
        skills: ['TypeScript', 'React'],
        source: 'github',
        github_user_id: 42,
      },
    })
    mockCriteriaSelect.mockResolvedValue({ data: [{ id: 'crit-1', label: 'TypeScript obligatoire' }] })
    mockRpc.mockResolvedValue({ data: true, error: null })
    mockEvidenceInsert.mockResolvedValue({ error: null })
    mockActivityInsert.mockResolvedValue({ error: null })
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'propose_candidate_evidence',
          input: {
            proposals: [
              {
                criterion_id: 'crit-1',
                evidence_text: 'Le snapshot mentionne TypeScript.',
                source_excerpt: 'TypeScript',
                status: 'VERIFIED',
                eligibility: 'ELIGIBLE',
              },
            ],
          },
        },
      ],
    })
    mockGetAnthropic.mockResolvedValue({
      status: 'AVAILABLE',
      client: { messages: { create: mockMessagesCreate } },
      usingPlatformKey: true,
    })
  })

  it('rejette sans session avant tout appel IA', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })

    const result = await runEvidenceAgent({}, formData())

    expect(result.error).toBeDefined()
    expect(mockGetAnthropic).not.toHaveBeenCalled()
    expect(mockEvidenceInsert).not.toHaveBeenCalled()
  })

  it('persiste uniquement des preuves inférées même si la sortie IA contient des champs de verdict', async () => {
    const result = await runEvidenceAgent({}, formData())

    expect(result.saved).toBe(1)
    expect(mockEvidenceInsert).toHaveBeenCalledTimes(1)
    const rows = mockEvidenceInsert.mock.calls[0]![0]
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('INFERRED_UNCONFIRMED')
    expect(rows[0].is_inference).toBe(true)
    expect(rows[0]).not.toHaveProperty('eligibility')
    expect(rows[0]).not.toHaveProperty('eligibility_status')
  })

  it("n'insère rien quand la citation proposée n'existe pas dans le snapshot", async () => {
    mockMessagesCreate.mockResolvedValue({
      content: [
        {
          type: 'tool_use',
          name: 'propose_candidate_evidence',
          input: {
            proposals: [
              {
                criterion_id: 'crit-1',
                evidence_text: 'Le candidat possède une certification.',
                source_excerpt: 'Certification professionnelle',
              },
            ],
          },
        },
      ],
    })

    const result = await runEvidenceAgent({}, formData())

    expect(result.saved).toBe(0)
    expect(mockEvidenceInsert).not.toHaveBeenCalled()
  })

  it("ne lance pas l'IA quand la mission n'a aucun critère obligatoire", async () => {
    mockCriteriaSelect.mockResolvedValue({ data: [] })

    const result = await runEvidenceAgent({}, formData())

    expect(result.error).toBeDefined()
    expect(mockGetAnthropic).not.toHaveBeenCalled()
  })
})
