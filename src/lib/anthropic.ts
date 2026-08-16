import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from './supabase/service'

// Instancié à l'appel plutôt qu'au chargement du module : si la clé est
// absente, l'erreur remonte proprement dans le Server Action qui l'utilise
// (avec un message clair), pas comme un crash au démarrage du serveur.

// Ordre : clé BYOK du tenant d'abord (chacun paie sa propre conso), puis
// repli sur la clé plateforme si le tenant n'a rien configuré. Le repli
// existe pour ne pas casser l'usage interne d'OrakL tant que BYOK n'est
// pas généralisé aux autres tenants.
export async function getAnthropicClientForTenant(tenantId: string): Promise<Anthropic | null> {
  try {
    const service = createServiceClient()
    const { data: tenantKey } = await service.rpc('get_tenant_anthropic_key_for_service', {
      p_tenant_id: tenantId,
    })
    if (tenantKey) return new Anthropic({ apiKey: tenantKey })
  } catch {
    // Si la récupération de la clé du tenant échoue (ex: SUPABASE_SECRET_KEY
    // pas encore configurée), on retombe silencieusement sur la clé plateforme.
  }

  const platformKey = process.env.ANTHROPIC_API_KEY
  if (!platformKey) return null
  return new Anthropic({ apiKey: platformKey })
}

export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}
