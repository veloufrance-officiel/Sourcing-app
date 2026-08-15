// Logging serveur minimal mais réel : chaque échec applicatif doit laisser
// une trace exploitable (Vercel/Railway capturent stdout/stderr en logs
// structurables), sans jamais exposer de détail au client ni logger de
// données sensibles (email, nom de candidat, jeton...).
//
// Usage : logServerError('missions.create', error, { tenantId })
// Ne JAMAIS passer l'objet formData/candidat entier en contexte.

type LogContext = Record<string, string | number | boolean | null | undefined>

export function logServerError(action: string, error: unknown, context: LogContext = {}) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(
    JSON.stringify({
      level: 'error',
      action,
      message,
      ...context,
      timestamp: new Date().toISOString(),
    })
  )
}
