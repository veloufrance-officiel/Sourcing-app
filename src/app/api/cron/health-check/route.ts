import { createClient } from '@/lib/supabase/server'
import { sendTelegramMessage } from '@/lib/telegram'

// Déclenché quotidiennement par Vercel Cron (voir vercel.json). Vercel
// ajoute automatiquement l'en-tête d'autorisation avec CRON_SECRET pour
// ses propres appels planifiés ; on le vérifie pour empêcher un
// déclenchement public de ce endpoint.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 })
  }

  const supabase = await createClient()
  const { error } = await supabase.from('tenants').select('id').limit(1)

  await sendTelegramMessage(
    error ? `🔴 <b>Check-in</b> — problème base de données : ${error.message}` : '✅ <b>Check-in</b> — tout fonctionne'
  )

  return Response.json({ ok: !error })
}
