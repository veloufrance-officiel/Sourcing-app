import { createServiceClient } from '@/lib/supabase/service'
import { sendTelegramMessage } from '@/lib/telegram'

// Déclenché quotidiennement (voir vercel.json). service_role : la fonction
// enforce_data_retention() n'est volontairement accordée qu'à service_role,
// jamais à authenticated — un seul job de confiance décide, pas chaque
// utilisateur individuellement.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = createServiceClient()
  const { data, error } = await supabase.rpc('enforce_data_retention')
  const result = Array.isArray(data) ? data[0] : data

  if (error) {
    await sendTelegramMessage(`🔴 <b>RGPD — rétention</b> — échec : ${error.message}`)
    return Response.json({ ok: false, error: error.message }, { status: 500 })
  }

  const count = result?.anonymized_count ?? 0
  if (count > 0) {
    await sendTelegramMessage(
      `🗑️ <b>RGPD — rétention</b> — ${count} profil${count > 1 ? 's' : ''} anonymisé${count > 1 ? 's' : ''} (durée de conservation dépassée)`
    )
  }

  return Response.json({ ok: true, anonymized_count: count })
}
