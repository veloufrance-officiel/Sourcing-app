import { describe, it, expect, vi, beforeEach } from 'vitest'
import { confirmEvidence } from './evidence-actions'

// Mock minimal : seules les méthodes réellement appelées par
// confirmEvidence. La vraie garantie de sécurité (session humaine
// obligatoire, verified_by/verified_at imposés) vit dans le trigger DB
// — déjà testée exhaustivement contre la vraie base
// (supabase/tests/evidence_human_verification.test.sql, 11 cas). Ce
// test-ci vérifie uniquement le comportement de la Server Action
// elle-même : validation des entrées, appel correct à Supabase,
// gestion d'erreur — pas la sécurité, qui n'est pas de son ressort.
const mockInsertEvidence = vi.fn()
const mockInsertActivityLog = vi.fn()
const mockGetUser = vi.fn()
const mockSingle = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'evidence') return { insert: mockInsertEvidence }
      if (table === 'activity_log') return { insert: mockInsertActivityLog }
      if (table === 'app_users') return { select: () => ({ eq: () => ({ single: mockSingle }) }) }
      throw new Error(`Table non mockée : ${table}`)
    },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('candidate_id', overrides.candidate_id ?? 'candidate-1')
  fd.set('criterion_id', overrides.criterion_id ?? 'criterion-1')
  fd.set('mission_id', overrides.mission_id ?? 'mission-1')
  fd.set('status', overrides.status ?? 'VERIFIED')
  if (overrides.evidence_text !== undefined) fd.set('evidence_text', overrides.evidence_text)
  if (overrides.verification_method !== undefined) fd.set('verification_method', overrides.verification_method)
  return fd
}

describe('confirmEvidence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockInsertEvidence.mockResolvedValue({ error: null })
    mockInsertActivityLog.mockResolvedValue({ error: null })
  })

  it('rejette un statut autre que VERIFIED/CONTRADICTED', async () => {
    const result = await confirmEvidence({}, buildFormData({ status: 'NOT_VERIFIED' }))
    expect(result.error).toBeDefined()
    expect(mockInsertEvidence).not.toHaveBeenCalled()
  })

  it('rejette une soumission sans candidate_id', async () => {
    const result = await confirmEvidence({}, buildFormData({ candidate_id: '' }))
    expect(result.error).toBeDefined()
    expect(mockInsertEvidence).not.toHaveBeenCalled()
  })

  it('rejette si aucune session (session expirée)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await confirmEvidence({}, buildFormData())
    expect(result.error).toBeDefined()
    expect(mockInsertEvidence).not.toHaveBeenCalled()
  })

  it("insère avec is_inference=false et source_type='recruiter_note', jamais verified_by/verified_at fournis par l'appelant", async () => {
    await confirmEvidence({}, buildFormData({ status: 'VERIFIED' }))
    expect(mockInsertEvidence).toHaveBeenCalledTimes(1)
    const inserted = mockInsertEvidence.mock.calls[0]![0]
    expect(inserted.is_inference).toBe(false)
    expect(inserted.source_type).toBe('recruiter_note')
    expect(inserted.status).toBe('VERIFIED')
    // Point de sécurité central : cette Server Action ne doit JAMAIS
    // envoyer verified_by/verified_at elle-même — le trigger DB les
    // impose. Si un futur changement ajoutait ces champs ici, ce test
    // échouerait et devrait être traité comme un signal d'alarme, pas
    // corrigé pour le faire passer.
    expect(inserted).not.toHaveProperty('verified_by')
    expect(inserted).not.toHaveProperty('verified_at')
  })

  it('transmet CONTRADICTED correctement', async () => {
    await confirmEvidence({}, buildFormData({ status: 'CONTRADICTED' }))
    const inserted = mockInsertEvidence.mock.calls[0]![0]
    expect(inserted.status).toBe('CONTRADICTED')
  })

  it("retourne une erreur propre si l'insert échoue (ex: trigger DB refuse), sans faire planter l'action", async () => {
    mockInsertEvidence.mockResolvedValue({ error: { message: 'Une session humaine authentifiée est requise' } })
    const result = await confirmEvidence({}, buildFormData())
    expect(result.error).toBeDefined()
    expect(result.success).toBeUndefined()
  })

  it('retourne success:true et journalise dans activity_log en cas de succès', async () => {
    const result = await confirmEvidence({}, buildFormData())
    expect(result.success).toBe(true)
    expect(mockInsertActivityLog).toHaveBeenCalledTimes(1)
  })

  it('champs optionnels (evidence_text, verification_method) transmis quand fournis', async () => {
    await confirmEvidence({}, buildFormData({ evidence_text: 'Confirmé par téléphone', verification_method: 'appel' }))
    const inserted = mockInsertEvidence.mock.calls[0]![0]
    expect(inserted.evidence_text).toBe('Confirmé par téléphone')
    expect(inserted.verification_method).toBe('appel')
  })
})
