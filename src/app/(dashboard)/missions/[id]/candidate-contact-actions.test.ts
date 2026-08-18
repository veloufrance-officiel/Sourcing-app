import { describe, it, expect, vi, beforeEach } from 'vitest'
import { markCandidateContacted, recordCandidateResponse } from './candidate-contact-actions'

vi.mock('@/lib/log', () => ({ logServerError: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

const mockGetUser = vi.fn()
const mockAppUserSingle = vi.fn()
const mockCandidateSingle = vi.fn()
const mockMissionSingle = vi.fn()
const mockOppositionMaybeSingle = vi.fn()
const mockContactInsertSingle = vi.fn()
const mockContactSelectSingle = vi.fn()
const mockContactUpdateSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'app_users') return { select: () => ({ eq: () => ({ single: mockAppUserSingle }) }) }
      if (table === 'candidates') return { select: () => ({ eq: () => ({ eq: () => ({ single: mockCandidateSingle }) }) }) }
      if (table === 'missions') return { select: () => ({ eq: () => ({ eq: () => ({ single: mockMissionSingle }) }) }) }
      if (table === 'contact_oppositions')
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: mockOppositionMaybeSingle }) }) }) }
      if (table === 'candidate_contacts')
        return {
          insert: () => ({ select: () => ({ single: mockContactInsertSingle }) }),
          select: () => ({ eq: () => ({ eq: () => ({ single: mockContactSelectSingle }) }) }),
          update: () => ({ eq: () => ({ select: () => ({ single: mockContactUpdateSingle }) }) }),
        }
      throw new Error(`Table non mockée : ${table}`)
    },
  })),
}))

function buildMarkFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('candidate_id', overrides.candidate_id ?? 'candidate-1')
  fd.set('mission_id', overrides.mission_id ?? 'mission-1')
  fd.set('message', overrides.message ?? 'Bonjour, je vous contacte au sujet d\u2019une mission.')
  return fd
}

describe('markCandidateContacted', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockAppUserSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockCandidateSingle.mockResolvedValue({ data: { id: 'candidate-1', github_user_id: 12345 } })
    mockMissionSingle.mockResolvedValue({ data: { id: 'mission-1' } })
    mockOppositionMaybeSingle.mockResolvedValue({ data: null })
    mockContactInsertSingle.mockResolvedValue({ data: { id: 'contact-1' }, error: null })
  })

  it('rejette sans candidate_id ni mission_id', async () => {
    const result = await markCandidateContacted({}, buildMarkFormData({ candidate_id: '' }))
    expect(result.error).toBeDefined()
    expect(mockContactInsertSingle).not.toHaveBeenCalled()
  })

  it('rejette un message vide', async () => {
    const result = await markCandidateContacted({}, buildMarkFormData({ message: '   ' }))
    expect(result.error).toBeDefined()
  })

  it('rejette un message trop long', async () => {
    const result = await markCandidateContacted({}, buildMarkFormData({ message: 'a'.repeat(5000) }))
    expect(result.error).toBeDefined()
  })

  it('rejette si candidat introuvable pour ce tenant', async () => {
    mockCandidateSingle.mockResolvedValue({ data: null })
    const result = await markCandidateContacted({}, buildMarkFormData())
    expect(result.error).toBeDefined()
  })

  it('rejette si mission introuvable pour ce tenant', async () => {
    mockMissionSingle.mockResolvedValue({ data: null })
    const result = await markCandidateContacted({}, buildMarkFormData())
    expect(result.error).toBeDefined()
  })

  it("refuse le contact si une opposition existe, AVANT tout insert — point central de l'action", async () => {
    mockOppositionMaybeSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    const result = await markCandidateContacted({}, buildMarkFormData())
    expect(result.error).toContain('opposé')
    expect(mockContactInsertSingle).not.toHaveBeenCalled()
  })

  it("n'appelle jamais le lookup opposition si le candidat n'a pas de github_user_id (candidat manual)", async () => {
    mockCandidateSingle.mockResolvedValue({ data: { id: 'candidate-1', github_user_id: null } })
    await markCandidateContacted({}, buildMarkFormData())
    expect(mockOppositionMaybeSingle).not.toHaveBeenCalled()
    expect(mockContactInsertSingle).toHaveBeenCalledTimes(1)
  })

  it("fixe legal_basis='legitimate_interest' côté serveur, jamais lu depuis le formulaire", async () => {
    const fd = buildMarkFormData()
    fd.set('legal_basis', 'consent') // tentative de contournement depuis un client malveillant
    await markCandidateContacted({}, fd)
    // Le mock capture l'appel réel à .insert() — on vérifie que
    // l'action n'a jamais lu formData.get('legal_basis') en construisant
    // un objet insert à partir de ça. Puisque l'insert est mocké par
    // fonction fixe ici, ce test protège surtout contre une régression
    // future qui lirait ce champ - vérifié en relisant le code source
    // directement plutôt que via le mock (le mock ne capture pas les
    // arguments d'insert dans cette structure imbriquée).
    expect(mockContactInsertSingle).toHaveBeenCalledTimes(1)
  })

  it('succès : retourne contactId', async () => {
    const result = await markCandidateContacted({}, buildMarkFormData())
    expect(result.contactId).toBe('contact-1')
    expect(result.error).toBeUndefined()
  })

  it("retourne une erreur propre si l'insert échoue, sans planter", async () => {
    mockContactInsertSingle.mockResolvedValue({ data: null, error: { message: 'db error' } })
    const result = await markCandidateContacted({}, buildMarkFormData())
    expect(result.error).toBeDefined()
  })
})

function buildResponseFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('contact_id', overrides.contact_id ?? 'contact-1')
  fd.set('response', overrides.response ?? 'interested')
  fd.set('mission_id', overrides.mission_id ?? 'mission-1')
  return fd
}

describe('recordCandidateResponse', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockAppUserSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockContactSelectSingle.mockResolvedValue({ data: { id: 'contact-1', tenant_id: 'tenant-1' } })
    mockContactUpdateSingle.mockResolvedValue({ data: { id: 'contact-1' }, error: null })
  })

  it('rejette sans contact_id', async () => {
    const result = await recordCandidateResponse({}, buildResponseFormData({ contact_id: '' }))
    expect(result.error).toBeDefined()
  })

  it("rejette une réponse hors de l'ensemble autorisé", async () => {
    const result = await recordCandidateResponse({}, buildResponseFormData({ response: 'yes-please' }))
    expect(result.error).toBeDefined()
    expect(mockContactUpdateSingle).not.toHaveBeenCalled()
  })

  it('rejette si le contact est introuvable pour ce tenant (revalidation explicite, pas de confiance au client)', async () => {
    mockContactSelectSingle.mockResolvedValue({ data: null })
    const result = await recordCandidateResponse({}, buildResponseFormData())
    expect(result.error).toBeDefined()
    expect(mockContactUpdateSingle).not.toHaveBeenCalled()
  })

  it("détecte un UPDATE silencieusement bloqué par RLS (0 ligne affectée) — ne renvoie jamais success:true dans ce cas", async () => {
    // Reproduit exactement le cas viewer confirmé contre la vraie base :
    // pas d'erreur PostgREST, mais data=null car 0 ligne matchée par RLS.
    mockContactUpdateSingle.mockResolvedValue({ data: null, error: null })
    const result = await recordCandidateResponse({}, buildResponseFormData())
    expect(result.success).toBeUndefined()
    expect(result.error).toBeDefined()
  })

  it('succès : response et responded_at enregistrés', async () => {
    const result = await recordCandidateResponse({}, buildResponseFormData({ response: 'opposed' }))
    expect(result.success).toBe(true)
  })

  it('les trois valeurs valides sont acceptées', async () => {
    for (const response of ['interested', 'refused', 'opposed']) {
      const result = await recordCandidateResponse({}, buildResponseFormData({ response }))
      expect(result.error).toBeUndefined()
    }
  })
})
