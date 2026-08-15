import Anthropic from '@anthropic-ai/sdk'

// Instancié à l'appel plutôt qu'au chargement du module : si la clé est
// absente, l'erreur remonte proprement dans le Server Action qui l'utilise
// (avec un message clair), pas comme un crash au démarrage du serveur.
export function getAnthropicClient() {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return null
  return new Anthropic({ apiKey })
}
