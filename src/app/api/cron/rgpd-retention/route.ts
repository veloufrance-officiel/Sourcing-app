import { createServiceClient } from '@/lib/supabase/service'
import { sendTelegramMessage } from '@/lib/telegram'

// Déclenché quotidiennement (voir vercel.json). service_role : les
// fonctions enforce_data_retention() et enforce_opposition_retention()
// ne sont volontairement accordées qu'à service_role, jamais à
// authenticated — un seul job de confiance décide, pas chaque
// utilisateur individuellement.
//
// Deux politiques de rétention distinctes, deux appels RPC
// indépendants dans la même route (pas un nouveau job) : candidates
// (2 ans, données de candidature) et contact_oppositions (3 ans,
// liste repoussoir — CNIL recommande ce minimum spécifiquement pour ce
// type de donnée, distinct des autres données candidat). Chaque appel
// est isolé dans son propre try/catch : un échec de l'un ne doit
// jamais empêcher l'autre de s'exécuter, ni masquer son propre échec
// derrière le succès de l'autre — exigence explicite avant ce
// changement, pas un oubli à corriger après coup.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient()

  let candidatesResult: { ok: boolean; anonymized_count?: number; error?: string }
  try {
    const { data, error } = await supabase.rpc('enforce_data_retention')
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : data
    const count = result?.anonymized_count ?? 0
    candidatesResult = { ok: true, anonymized_count: count }
    if (count > 0) {
      await sendTelegramMessage(
        `🗑️ <b>RGPD — rétention candidats</b> — ${count} profil${count > 1 ? 's' : ''} anonymisé${count > 1 ? 's' : ''} (durée de conservation dépassée)`
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    candidatesResult = { ok: false, error: message }
    await sendTelegramMessage(`🔴 <b>RGPD — rétention candidats</b> — échec : ${message}`)
  }

  let oppositionsResult: { ok: boolean; deleted_count?: number; error?: string }
  try {
    const { data, error } = await supabase.rpc('enforce_opposition_retention')
    if (error) throw error
    const result = Array.isArray(data) ? data[0] : data
    const count = result?.deleted_count ?? 0
    oppositionsResult = { ok: true, deleted_count: count }
    if (count > 0) {
      await sendTelegramMessage(
        `🗑️ <b>RGPD — rétention oppositions</b> — ${count} opposition${count > 1 ? 's' : ''} expirée${count > 1 ? 's' : ''} supprimée${count > 1 ? 's' : ''} (3 ans dépassés)`
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    oppositionsResult = { ok: false, error: message }
    await sendTelegramMessage(`🔴 <b>RGPD — rétention oppositions</b> — échec : ${message}`)
  }

  const overallOk = candidatesResult.ok && oppositionsResult.ok
  return Response.json({ ok: overallOk, candidates: candidatesResult, oppositions: oppositionsResult }, { status: overallOk ? 200 : 500 })
}

