'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type MissionFormState = { error?: string }

export async function createMission(
  _prevState: MissionFormState,
  formData: FormData
): Promise<MissionFormState> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée, reconnecte-toi.' }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()

  if (!appUser) {
    return { error: "Ton compte n'est rattaché à aucun tenant (vérifie la table app_users)." }
  }

  const title = String(formData.get('title') ?? '').trim()
  if (!title) return { error: 'Le titre de la mission est requis.' }

  const dailyRateRaw = String(formData.get('daily_rate') ?? '').trim()

  const { data: mission, error } = await supabase
    .from('missions')
    .insert({
      tenant_id: appUser.tenant_id,
      title,
      client_name: String(formData.get('client_name') ?? '').trim() || null,
      location: String(formData.get('location') ?? '').trim() || null,
      contract_type: String(formData.get('contract_type') ?? '').trim() || null,
      daily_rate: dailyRateRaw ? Number(dailyRateRaw) : null,
      brief_raw: String(formData.get('brief_raw') ?? '').trim() || null,
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !mission) {
    logServerError('missions.create', error, { tenantId: appUser.tenant_id })
    return { error: 'Impossible de créer la mission.' }
  }

  // Best-effort : une erreur de log ne doit jamais bloquer la création réussie.
  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'mission',
    entity_id: mission.id,
    action: 'created',
    actor_id: user.id,
  })
  if (logError) logServerError('missions.create.activityLog', logError, { tenantId: appUser.tenant_id })

  redirect(`/missions/${mission.id}`)
}
