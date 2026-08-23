// Tests des 4 états BYOK distincts (audit sécurité) : NOT_CONFIGURED,
// RETRIEVAL_ERROR, INVALID_CONFIGURATION, AVAILABLE. Le vrai bug
// corrigé : un tenant ayant réellement configuré son BYOK ne doit
// jamais retomber silencieusement sur la clé plateforme si sa
// récupération échoue — il doit obtenir RETRIEVAL_ERROR, jamais un
// AVAILABLE avec usingPlatformKey: true à son insu.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getAnthropicClientForTenantSafe } from './anthropic'

vi.mock('./supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: mockRpc })),
}))

const mockRpc = vi.fn()
const TENANT_ID = '11111111-1111-1111-1111-111111111111'

describe('getAnthropicClientForTenantSafe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    delete process.env.ANTHROPIC_API_KEY
  })

  it('CAS A — aucune clé BYOK configurée, clé plateforme disponible -> AVAILABLE, usingPlatformKey: true', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null }) // exists check
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key'

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('AVAILABLE')
    if (result.status === 'AVAILABLE') {
      expect(result.usingPlatformKey).toBe(true)
    }
  })

  it('CAS A bis — aucune clé BYOK, aucune clé plateforme non plus -> NOT_CONFIGURED', async () => {
    mockRpc.mockResolvedValueOnce({ data: false, error: null })
    // ANTHROPIC_API_KEY volontairement absent (delete dans beforeEach)

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('NOT_CONFIGURED')
  })

  it('CAS B — clé BYOK configurée et récupérable -> AVAILABLE, usingPlatformKey: false, jamais la clé plateforme', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null }) // exists check
    mockRpc.mockResolvedValueOnce({ data: 'sk-tenant-byok-key', error: null }) // valeur réelle
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key'

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('AVAILABLE')
    if (result.status === 'AVAILABLE') {
      expect(result.usingPlatformKey).toBe(false)
    }
  })

  it("CAS C — clé BYOK configurée mais l'appel RPC de récupération échoue -> RETRIEVAL_ERROR, JAMAIS un fallback silencieux sur la clé plateforme", async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null }) // exists: oui, une clé existe
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('vault injoignable') }) // récupération échoue
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key' // présente, mais ne doit JAMAIS être utilisée ici

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('RETRIEVAL_ERROR')
    expect(result).not.toHaveProperty('client')
  })

  it('CAS C bis — la vérification d\'existence elle-même lève une exception -> RETRIEVAL_ERROR, jamais NOT_CONFIGURED (on ne sait pas, ce n\'est pas la même chose que savoir qu\'il n\'y en a pas)', async () => {
    mockRpc.mockRejectedValueOnce(new Error('connexion vault perdue'))
    process.env.ANTHROPIC_API_KEY = 'sk-platform-key'

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('RETRIEVAL_ERROR')
  })

  it('clé existe mais la RPC retourne une valeur vide/null sans erreur explicite -> INVALID_CONFIGURATION, pas un crash silencieux', async () => {
    mockRpc.mockResolvedValueOnce({ data: true, error: null }) // exists: oui
    mockRpc.mockResolvedValueOnce({ data: null, error: null }) // pas d'erreur, mais rien retourné

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('INVALID_CONFIGURATION')
  })

  it("le check d'existence échoue (error retourné, pas d'exception) -> RETRIEVAL_ERROR", async () => {
    mockRpc.mockResolvedValueOnce({ data: null, error: new Error('permission denied') })

    const result = await getAnthropicClientForTenantSafe(TENANT_ID)

    expect(result.status).toBe('RETRIEVAL_ERROR')
  })
})
