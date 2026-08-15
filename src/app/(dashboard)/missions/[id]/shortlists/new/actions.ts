'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type CreateShortlistState = { error?: string }

export async function createShortlist(
  _prevState: CreateShortlistState,
  formData: FormData
): Promise<CreateShortlistState> {
  const missionId = String(formData.get('mission_id') ?? '')
  const name = String(formData.get('name') ?? '').trim()
  if (!name) return { error: 'Le nom de la shortlist est requis.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  const { data: shortlist, error } = await supabase
    .from('shortlists')
    .insert({
      tenant_id: appUser.tenant_id,
      mission_id: missionId,
      name,
      shared_with_external: formData.get('shared_with_external') === 'on',
    })
    .select('id')
    .single()

  if (error || !shortlist) {
    logServerError('shortlists.create', error, { tenantId: appUser.tenant_id, missionId })
    return { error: 'Impossible de créer la shortlist.' }
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'shortlist',
    entity_id: shortlist.id,
    action: 'created',
    actor_id: user.id,
  })
  if (logError) logServerError('shortlists.create.activityLog', logError, { tenantId: appUser.tenant_id })

  redirect(`/missions/${missionId}/shortlists/${shortlist.id}`)
}
