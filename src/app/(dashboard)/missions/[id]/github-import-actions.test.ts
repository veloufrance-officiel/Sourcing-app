import { describe, it, expect, vi, beforeEach } from 'vitest'
import { importGithubCandidates } from './github-import-actions'
import type { GithubSearchResult } from './github-search-actions'

const mockCandidateInsert = vi.fn()
const mockMissionCandidateInsert = vi.fn()
const mockEvidenceInsert = vi.fn()
const mockGetUser = vi.fn()
const mockSingle = vi.fn()
const mockStageSelect = vi.fn()
const mockCriteriaSelect = vi.fn()
const mockOppositionsEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'candidates') return { insert: mockCandidateInsert }
      if (table === 'mission_candidates') return { insert: mockMissionCandidateInsert }
      if (table === 'evidence') return { insert: mockEvidenceInsert }
      if (table === 'app_users') return { select: () => ({ eq: () => ({ single: mockSingle }) }) }
      if (table === 'pipeline_stages')
        return { select: () => ({ eq: () => ({ order: () => ({ limit: () => ({ single: mockStageSelect }) }) }) }) }
      if (table === 'brief_criteria') return { select: () => ({ eq: () => ({ eq: mockCriteriaSelect }) }) }
      if (table === 'contact_oppositions') return { select: () => ({ eq: mockOppositionsEq }) }
      throw new Error(`Table non mockée : ${table}`)
    },
  })),
}))

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/log', () => ({ logServerError: vi.fn() }))

const sampleProfile: GithubSearchResult = {
  id: 583231,
  login: 'testdev',
  name: 'Test Dev',
  bio: 'Fullstack',
  location: 'Paris',
  company: null,
  htmlUrl: 'https://github.com/testdev',
  publicRepos: 20,
  detectedSkills: ['TypeScript'],
}

function buildFormData(profiles: GithubSearchResult[]): FormData {
  const fd = new FormData()
  fd.set('mission_id', 'mission-1')
  fd.set('selected_profiles', JSON.stringify(profiles))
  return fd
}

describe('importGithubCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockStageSelect.mockResolvedValue({ data: { id: 'stage-1' } })
    mockCriteriaSelect.mockResolvedValue({ data: [{ id: 'crit-1', label: 'TypeScript' }] })
    mockOppositionsEq.mockResolvedValue({ data: [] }) // aucune opposition par défaut
    mockCandidateInsert.mockReturnValue({
      select: () => ({ single: () => Promise.resolve({ data: { id: 'candidate-1' }, error: null }) }),
    })
    mockMissionCandidateInsert.mockResolvedValue({ error: null })
    mockEvidenceInsert.mockResolvedValue({ error: null })
  })

  it('rejette sans sélection', async () => {
    const result = await importGithubCandidates({}, buildFormData([]))
    expect(result.error).toBeDefined()
    expect(mockCandidateInsert).not.toHaveBeenCalled()
  })

  it('rejette si aucune session', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const result = await importGithubCandidates({}, buildFormData([sampleProfile]))
    expect(result.error).toBeDefined()
    expect(mockCandidateInsert).not.toHaveBeenCalled()
  })

  it("crée le candidat avec source='github', jamais autre chose", async () => {
    await importGithubCandidates({}, buildFormData([sampleProfile]))
    expect(mockCandidateInsert).toHaveBeenCalledTimes(1)
    const inserted = mockCandidateInsert.mock.calls[0]![0]
    expect(inserted.source).toBe('github')
  })

  it("persiste github_user_id = profile.id, jamais dérivé du login ni omis — test dédié à la correction github_user_id", async () => {
    await importGithubCandidates({}, buildFormData([sampleProfile]))
    const inserted = mockCandidateInsert.mock.calls[0]![0]
    expect(inserted.github_user_id).toBe(sampleProfile.id)
    expect(inserted.github_user_id).toBe(583231)
    expect(typeof inserted.github_user_id).toBe('number')
  })

  it('refuse de créer un candidat pour un profil déjà opposé — garde-fou défensif avant tout insert', async () => {
    mockOppositionsEq.mockResolvedValue({ data: [{ github_user_id: sampleProfile.id }] })
    const result = await importGithubCandidates({}, buildFormData([sampleProfile]))
    expect(mockCandidateInsert).not.toHaveBeenCalled()
    expect(result.error).toBeDefined()
  })

  it('un profil opposé dans un lot de plusieurs est ignoré, les autres continuent normalement', async () => {
    const secondProfile: GithubSearchResult = { ...sampleProfile, id: 999999999, login: 'seconddev' }
    mockOppositionsEq.mockResolvedValue({ data: [{ github_user_id: sampleProfile.id }] }) // seul le premier est opposé
    const result = await importGithubCandidates({}, buildFormData([sampleProfile, secondProfile]))
    expect(mockCandidateInsert).toHaveBeenCalledTimes(1)
    const inserted = mockCandidateInsert.mock.calls[0]![0]
    expect(inserted.github_user_id).toBe(999999999) // le second, jamais le premier (opposé)
    expect(result.imported).toBe(1)
  })

  it("ne fournit JAMAIS consent_status='granted' à l'insertion — reste le défaut de la colonne (pending)", async () => {
    await importGithubCandidates({}, buildFormData([sampleProfile]))
    const inserted = mockCandidateInsert.mock.calls[0]![0]
    // Le point de sécurité central de ce test : cette action ne doit
    // JAMAIS envoyer consent_status elle-même, encore moins 'granted'.
    // Si un futur changement ajoutait ce champ ici, ce test échouerait
    // et devrait être traité comme un signal d'alarme, pas corrigé pour
    // le faire passer.
    expect(inserted).not.toHaveProperty('consent_status')
  })

  it("crée l'evidence avec status='INFERRED_UNCONFIRMED' et is_inference=true, jamais VERIFIED", async () => {
    await importGithubCandidates({}, buildFormData([sampleProfile]))
    expect(mockEvidenceInsert).toHaveBeenCalledTimes(1)
    const inserted = mockEvidenceInsert.mock.calls[0]![0]
    expect(inserted.status).toBe('INFERRED_UNCONFIRMED')
    expect(inserted.is_inference).toBe(true)
  })

  it("n'écrit jamais VERIFIED ni CONTRADICTED, quel que soit le profil (pas de chemin dans le code qui permettrait ça)", async () => {
    await importGithubCandidates({}, buildFormData([sampleProfile]))
    const inserted = mockEvidenceInsert.mock.calls[0]![0]
    expect(inserted.status).not.toBe('VERIFIED')
    expect(inserted.status).not.toBe('CONTRADICTED')
  })

  it("n'insère une evidence que pour les critères où un signal détecté correspond", async () => {
    mockCriteriaSelect.mockResolvedValue({
      data: [
        { id: 'crit-1', label: 'TypeScript' },
        { id: 'crit-2', label: 'Freelance' }, // aucun signal ne correspond à ce critère
      ],
    })
    await importGithubCandidates({}, buildFormData([sampleProfile]))
    // Un seul insert evidence (TypeScript), pas deux
    expect(mockEvidenceInsert).toHaveBeenCalledTimes(1)
  })

  it('un profil qui échoue à la création ne bloque pas les suivants', async () => {
    mockCandidateInsert
      .mockReturnValueOnce({
        select: () => ({ single: () => Promise.resolve({ data: null, error: { message: 'fail' } }) }),
      })
      .mockReturnValueOnce({
        select: () => ({ single: () => Promise.resolve({ data: { id: 'candidate-2' }, error: null }) }),
      })
    const secondProfile: GithubSearchResult = { ...sampleProfile, login: 'seconddev' }
    const result = await importGithubCandidates({}, buildFormData([sampleProfile, secondProfile]))
    expect(result.imported).toBe(1)
  })

  it('retourne le nombre réel de profils importés', async () => {
    const result = await importGithubCandidates({}, buildFormData([sampleProfile]))
    expect(result.imported).toBe(1)
  })
})
