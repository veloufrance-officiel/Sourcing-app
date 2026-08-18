import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ rpc: mockRpc })),
}))
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: (...args: unknown[]) => mockSendTelegramMessage(...args) }))

const mockRpc = vi.fn()
const mockSendTelegramMessage = vi.fn()

function buildRequest(): Request {
  return new Request('https://example.invalid/api/cron/rgpd-retention', {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
}

describe('GET /api/cron/rgpd-retention', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 'test-secret'
  })

  it('rejette sans le bon secret', async () => {
    const req = new Request('https://example.invalid/api/cron/rgpd-retention')
    const res = await GET(req)
    expect(res.status).toBe(401)
  })

  it('appelle les deux RPC (candidates et oppositions), pas seulement un', async () => {
    mockRpc.mockResolvedValue({ data: [{ anonymized_count: 0, deleted_count: 0 }], error: null })
    await GET(buildRequest())
    expect(mockRpc).toHaveBeenCalledWith('enforce_data_retention')
    expect(mockRpc).toHaveBeenCalledWith('enforce_opposition_retention')
  })

  it("un échec de enforce_data_retention n'empêche PAS enforce_opposition_retention de s'exécuter — point de vigilance explicite", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'enforce_data_retention') return Promise.resolve({ data: null, error: { message: 'candidates RPC failed' } })
      return Promise.resolve({ data: [{ deleted_count: 2 }], error: null })
    })
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(mockRpc).toHaveBeenCalledWith('enforce_opposition_retention')
    expect(body.oppositions.ok).toBe(true)
    expect(body.oppositions.deleted_count).toBe(2)
    expect(body.candidates.ok).toBe(false)
  })

  it("un échec de enforce_opposition_retention n'empêche PAS enforce_data_retention de s'exécuter (symétrique)", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'enforce_opposition_retention') return Promise.resolve({ data: null, error: { message: 'oppositions RPC failed' } })
      return Promise.resolve({ data: [{ anonymized_count: 3 }], error: null })
    })
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(mockRpc).toHaveBeenCalledWith('enforce_data_retention')
    expect(body.candidates.ok).toBe(true)
    expect(body.candidates.anonymized_count).toBe(3)
    expect(body.oppositions.ok).toBe(false)
  })

  it("l'échec de l'une n'est jamais masqué par le succès de l'autre — status 500 si au moins une échoue", async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'enforce_opposition_retention') return Promise.resolve({ data: null, error: { message: 'fail' } })
      return Promise.resolve({ data: [{ anonymized_count: 0 }], error: null })
    })
    const res = await GET(buildRequest())
    expect(res.status).toBe(500)
  })

  it('succès des deux -> status 200, ok:true global', async () => {
    mockRpc.mockResolvedValue({ data: [{ anonymized_count: 0, deleted_count: 0 }], error: null })
    const res = await GET(buildRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
  })

  it('notification Telegram distincte pour les oppositions, jamais mélangée avec celle des candidats', async () => {
    mockRpc.mockImplementation((fn: string) => {
      if (fn === 'enforce_opposition_retention') return Promise.resolve({ data: [{ deleted_count: 5 }], error: null })
      return Promise.resolve({ data: [{ anonymized_count: 0 }], error: null })
    })
    await GET(buildRequest())
    const oppositionCall = mockSendTelegramMessage.mock.calls.find((c) => String(c[0]).includes('oppositions'))
    expect(oppositionCall).toBeDefined()
    expect(String(oppositionCall![0])).toContain('5')
  })
})
