import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchGithubCandidates } from './github-search-actions'

vi.mock('@/lib/log', () => ({ logServerError: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

function buildFormData(overrides: Record<string, string> = {}): FormData {
  const fd = new FormData()
  fd.set('mission_id', overrides.mission_id ?? 'mission-1')
  fd.set('criteria_labels', overrides.criteria_labels ?? 'TypeScript|React')
  fd.set('location', overrides.location ?? 'France')
  return fd
}

describe('searchGithubCandidates', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.GITHUB_SEARCH_TOKEN = 'test-token'
  })

  it('rejette sans mission_id', async () => {
    const result = await searchGithubCandidates({}, buildFormData({ mission_id: '' }))
    expect(result.error).toBeDefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it("rejette si aucun critère ne correspond à un langage reconnu, sans appeler l'API", async () => {
    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'Freelance|Expérience startup' }))
    expect(result.error).toContain('Aucun critère')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('retourne une erreur explicite si GITHUB_SEARCH_TOKEN est absent, sans planter', async () => {
    delete process.env.GITHUB_SEARCH_TOKEN
    const result = await searchGithubCandidates({}, buildFormData())
    expect(result.error).toBeDefined()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('appelle bien Authorization: Bearer avec le token, jamais autre chose', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
    })
    await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    expect(mockFetch).toHaveBeenCalled()
    const [, options] = mockFetch.mock.calls[0]!
    expect(options.headers.Authorization).toBe('Bearer test-token')
  })

  it('une requête search qui échoue ne fait pas planter toute la recherche', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })
    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    // Aucun résultat, mais pas de crash — erreur "aucun profil trouvé", pas une exception non gérée
    expect(result.error).toBeDefined()
  })

  it("récupère les détails d'un utilisateur trouvé via un second appel, transforme correctement en GithubSearchResult", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ login: 'testuser' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          login: 'testuser',
          name: 'Test User',
          bio: 'Fullstack dev',
          location: 'Paris',
          company: null,
          html_url: 'https://github.com/testuser',
          public_repos: 42,
        }),
      })

    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    expect(result.results).toHaveLength(1)
    expect(result.results![0]).toMatchObject({
      login: 'testuser',
      name: 'Test User',
      publicRepos: 42,
    })
  })

  it('un profil dont le lookup /users échoue est ignoré, pas de crash', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ login: 'testuser' }] }),
      })
      .mockResolvedValueOnce({ ok: false, status: 404 })

    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    expect(result.error).toBeDefined()
    expect(result.results).toBeUndefined()
  })

  it('ne déduplique jamais un login déjà vu entre deux requêtes (React et TypeScript mappent tous deux sur JavaScript ou proches)', async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ login: 'dup' }] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'dup', name: 'Dup User', bio: null, location: null, company: null, html_url: 'https://github.com/dup', public_repos: 1 }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ login: 'dup' }] }) })

    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript|Python' }))
    expect(result.results).toHaveLength(1) // un seul, pas deux malgré les deux requêtes
  })
})
