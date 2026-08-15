'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

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
      created_by: user.id,
    })
    .select('id')
    .single()

  if (error || !mission) {
    return { error: 'Impossible de créer la mission.' }
  }

  redirect(`/missions/${mission.id}`)
}
