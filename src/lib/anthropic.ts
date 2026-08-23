import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from './supabase/service'

// Instancié à l'appel plutôt qu'au chargement du module : si la clé est
// absente, l'erreur remonte proprement dans le Server Action qui l'utilise
// (avec un message clair), pas comme un crash au démarrage du serveur.

export type AnthropicKeyStatus = 'NOT_CONFIGURED' | 'RETRIEVAL_ERROR' | 'INVALID_CONFIGURATION' | 'AVAILABLE'

export type AnthropicClientResult =
  | { status: 'AVAILABLE'; client: Anthropic; usingPlatformKey: boolean }
  | { status: Exclude<AnthropicKeyStatus, 'AVAILABLE'> }

// Ordre : clé BYOK du tenant d'abord (chacun paie sa propre conso), puis
// repli sur la clé plateforme SEULEMENT si le tenant n'a explicitement rien
// configuré. Le repli existe pour ne pas casser l'usage interne d'OrakL
// tant que BYOK n'est pas généralisé aux autres tenants.
//
// Correction (audit sécurité) : l'ancien comportement retombait
// silencieusement sur la clé plateforme quel que soit le type d'échec —
// un tenant ayant réellement configuré son BYOK n'avait alors aucune
// garantie que c'était sa clé qui était utilisée si sa récupération
// échouait en coulisse (ex. SUPABASE_SECRET_KEY manquante, timeout
// réseau vers Vault). Un tenant BYOK dont la récupération échoue doit
// obtenir une erreur explicite, jamais un fallback qui le fait payer
// via la clé plateforme à son insu.
//
// tenant_anthropic_key_exists_for_service (migration 0030) répond
// uniquement "un secret existe-t-il" sans jamais le déchiffrer — permet
// de distinguer NOT_CONFIGURED (jamais configuré, fallback légitime) de
// RETRIEVAL_ERROR (configuré, mais la valeur n'a pas pu être récupérée
// — jamais de fallback silencieux dans ce cas).
export async function getAnthropicClientForTenantSafe(tenantId: string): Promise<AnthropicClientResult> {
  const service = createServiceClient()

  let keyExists = false
  try {
    const { data, error } = await service.rpc('tenant_anthropic_key_exists_for_service', {
      p_tenant_id: tenantId,
    })
    if (error) return { status: 'RETRIEVAL_ERROR' }
    keyExists = data === true
  } catch {
    // Échec de la vérification d'existence elle-même (ex. Vault
    // injoignable) — traité comme RETRIEVAL_ERROR, jamais comme
    // NOT_CONFIGURED : on ne sait pas si une clé existe, ce n'est pas
    // la même chose que savoir qu'il n'y en a pas.
    return { status: 'RETRIEVAL_ERROR' }
  }

  if (!keyExists) {
    // Vraiment jamais configuré — repli légitime sur la clé plateforme.
    const platformKey = process.env.ANTHROPIC_API_KEY
    if (!platformKey) return { status: 'NOT_CONFIGURED' }
    return { status: 'AVAILABLE', client: new Anthropic({ apiKey: platformKey }), usingPlatformKey: true }
  }

  // Une clé existe : sa récupération doit réussir, sinon erreur
  // explicite — jamais de fallback silencieux à partir d'ici.
  try {
    const { data: tenantKey, error } = await service.rpc('get_tenant_anthropic_key_for_service', {
      p_tenant_id: tenantId,
    })
    if (error) return { status: 'RETRIEVAL_ERROR' }
    if (!tenantKey) return { status: 'INVALID_CONFIGURATION' }
    return { status: 'AVAILABLE', client: new Anthropic({ apiKey: tenantKey }), usingPlatformKey: false }
  } catch {
    return { status: 'RETRIEVAL_ERROR' }
  }
}

// Conservée pour compatibilité : ancien comportement (repli silencieux),
// jamais utilisée pour de nouveaux appelants — getAnthropicClientForTenantSafe
// est la voie recommandée désormais. Dépréciée plutôt que supprimée : la
// suppression immédiate n'est pas demandée par l'audit, seulement la
// disponibilité d'une alternative sûre.
/** @deprecated utiliser getAnthropicClientForTenantSafe, qui ne fallback jamais silencieusement sur une erreur de récupération BYOK réelle. */
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
