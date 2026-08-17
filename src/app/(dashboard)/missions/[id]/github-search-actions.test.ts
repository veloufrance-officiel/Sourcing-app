import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchGithubCandidates } from './github-search-actions'

vi.mock('@/lib/log', () => ({ logServerError: vi.fn() }))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const mockGetUser = vi.fn()
const mockAppUserSingle = vi.fn()
const mockOppositionsEq = vi.fn()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: (table: string) => {
      if (table === 'app_users') return { select: () => ({ eq: () => ({ single: mockAppUserSingle }) }) }
      if (table === 'contact_oppositions') return { select: () => ({ eq: mockOppositionsEq }) }
      throw new Error(`Table non mockée : ${table}`)
    },
  })),
}))

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
    mockGetUser.mockResolvedValue({ data: { user: { id: 'user-1' } } })
    mockAppUserSingle.mockResolvedValue({ data: { tenant_id: 'tenant-1' } })
    mockOppositionsEq.mockResolvedValue({ data: [] }) // aucune opposition par défaut
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
          id: 583231,
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

  it("capture explicitement l'id numérique GitHub (user.id), jamais seulement le login — test dédié à la correction github_user_id", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ login: 'octocat' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 583231, // vrai ID numérique GitHub, distinct du login
          login: 'octocat',
          name: 'The Octocat',
          bio: null,
          location: null,
          company: null,
          html_url: 'https://github.com/octocat',
          public_repos: 8,
        }),
      })

    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    expect(result.results).toHaveLength(1)
    expect(result.results![0]!.id).toBe(583231)
    expect(typeof result.results![0]!.id).toBe('number')
    // login capturé aussi, mais l'id ne doit jamais dépendre de lui
    expect(result.results![0]!.login).toBe('octocat')
  })

  it("filtre un profil déjà opposé — n'apparaît jamais dans les résultats, même brièvement", async () => {
    mockOppositionsEq.mockResolvedValue({ data: [{ github_user_id: 583231 }] })
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ login: 'octocat' }] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 583231, // même ID que l'opposition mockée
          login: 'octocat',
          name: 'The Octocat',
          bio: null,
          location: null,
          company: null,
          html_url: 'https://github.com/octocat',
          public_repos: 8,
        }),
      })

    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    // Aucun résultat — le seul profil trouvé était opposé, filtré avant
    // même d'être ajouté à la liste retournée.
    expect(result.results).toBeUndefined()
    expect(result.error).toBeDefined()
  })

  it('un profil non opposé continue de passer normalement (pas de faux positif sur le filtre)', async () => {
    mockOppositionsEq.mockResolvedValue({ data: [{ github_user_id: 999999999 }] }) // un ID différent
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ items: [{ login: 'octocat' }] }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 583231, login: 'octocat', name: null, bio: null, location: null, company: null, html_url: 'https://github.com/octocat', public_repos: 1 }),
      })

    const result = await searchGithubCandidates({}, buildFormData({ criteria_labels: 'TypeScript' }))
    expect(result.results).toHaveLength(1)
  })
})
