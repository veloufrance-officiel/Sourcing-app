import { describe, it, expect, vi, beforeEach } from 'vitest'
import { addCandidateToShortlist } from './actions'

// Même discipline que evidence-actions.test.ts (PR3) : la vraie garantie
// vit dans le trigger DB (internal.enforce_shortlist_eligibility_gate,
// déjà testé exhaustivement contre la vraie base — ELIGIBLE accepté,
// NOT_QUALIFIED/INELIGIBLE/cross-tenant/SQL-direct tous rejetés). Ce test
// vérifie uniquement que la Server Action traduit correctement le message
// du trigger en erreur utilisateur lisible, pas qu'elle réimplémente la
// vérification elle-même.
const mockInsert = vi.fn()
const mockActivityLogInsert = vi.fn()
const mockGetUser = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'shortlist_candidates') return { insert: mockInsert }
      if (table === 'activity_log') return { insert: mockActivityLogInsert }
      if (table === 'app_users') return { select: () => ({ eq: () => ({ single: mockSingle }) }) }
      throw new Error(`Table non mockée : ${table}`)
    },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('shortlist_id', overrides.shortlist_id ?? 'shortlist-1')
  fd.set('mission_id', overrides.mission_id ?? 'mission-1')
  fd.set('candidate_id', overrides.candidate_id ?? 'candidate-1')
  return fd
}

describe('addCandidateToShortlist — traduction du message du trigger DB', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockInsert.mockResolvedValue({ error: null })
    mockActivityLogInsert.mockResolvedValue({ error: null })
  })

  it('rejette sans candidate_id, sans appeler insert', async () => {
    const result = await addCandidateToShortlist({}, buildFormData({ candidate_id: '' }))
    expect(result.error).toBeDefined()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('rejette si aucune session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await addCandidateToShortlist({}, buildFormData())
    expect(result.error).toBeDefined()
    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('succès : aucune erreur retournée, activity_log journalisé', async () => {
    const result = await addCandidateToShortlist({}, buildFormData())
    expect(result.error).toBeUndefined()
    expect(mockActivityLogInsert).toHaveBeenCalledTimes(1)
  })

  it('rejet du trigger (NOT_QUALIFIED) : message traduit explicitement, pas l\u2019erreur SQL brute', async () => {
    mockInsert.mockResolvedValue({
      error: { message: 'Candidat non éligible (statut: NOT_QUALIFIED) — seul un candidat ELIGIBLE peut être ajouté à une shortlist.' },
    })
    const result = await addCandidateToShortlist({}, buildFormData())
    expect(result.error).toContain('pas encore éligible')
    expect(result.error).not.toContain('NOT_QUALIFIED') // jamais le vocabulaire technique brut exposé
  })

  it('rejet du trigger (candidat jamais évalué) : message traduit aussi', async () => {
    mockInsert.mockResolvedValue({
      error: { message: 'Ce candidat n\u2019a pas encore été évalué pour cette mission — ajout à la shortlist refusé.' },
    })
    const result = await addCandidateToShortlist({}, buildFormData())
    expect(result.error).toContain('pas encore éligible')
  })

  it('autre erreur (ex: doublon) : message générique distinct, pas confondu avec un rejet d\u2019éligibilité', async () => {
    mockInsert.mockResolvedValue({ error: { message: 'duplicate key value violates unique constraint' } })
    const result = await addCandidateToShortlist({}, buildFormData())
    expect(result.error).toContain('déjà présent')
    expect(result.error).not.toContain('éligible')
  })
})
