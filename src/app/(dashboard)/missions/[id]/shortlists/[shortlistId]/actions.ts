'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type ShortlistCandidateState = { error?: string }

export async function addCandidateToShortlist(
  _prevState: ShortlistCandidateState,
  formData: FormData
): Promise<ShortlistCandidateState> {
  const shortlistId = String(formData.get('shortlist_id') ?? '')
  const missionId = String(formData.get('mission_id') ?? '')
  const candidateId = String(formData.get('candidate_id') ?? '')
  if (!candidateId) return { error: 'Choisis un profil à ajouter.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  const { error } = await supabase.from('shortlist_candidates').insert({
    tenant_id: appUser.tenant_id,
    shortlist_id: shortlistId,
    candidate_id: candidateId,
  })

  if (error) {
    logServerError('shortlists.addCandidate', error, { tenantId: appUser.tenant_id, shortlistId })
    return { error: 'Impossible d\u2019ajouter ce profil (déjà présent ?).' }
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'shortlist_candidate',
    entity_id: candidateId,
    action: 'added_to_shortlist',
    actor_id: user.id,
  })
  if (logError) logServerError('shortlists.addCandidate.activityLog', logError, { tenantId: appUser.tenant_id })

  revalidatePath(`/missions/${missionId}/shortlists/${shortlistId}`)
  return {}
}

export async function removeCandidateFromShortlist(formData: FormData): Promise<void> {
  const shortlistId = String(formData.get('shortlist_id') ?? '')
  const missionId = String(formData.get('mission_id') ?? '')
  const candidateId = String(formData.get('candidate_id') ?? '')

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return

  const { error } = await supabase
    .from('shortlist_candidates')
    .delete()
    .eq('shortlist_id', shortlistId)
    .eq('candidate_id', candidateId)

  if (error) {
    logServerError('shortlists.removeCandidate', error, { tenantId: appUser.tenant_id, shortlistId })
    return
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'shortlist_candidate',
    entity_id: candidateId,
    action: 'removed_from_shortlist',
    actor_id: user.id,
  })
  if (logError) logServerError('shortlists.removeCandidate.activityLog', logError, { tenantId: appUser.tenant_id })

  revalidatePath(`/missions/${missionId}/shortlists/${shortlistId}`)
}

export async function toggleSharing(formData: FormData): Promise<void> {
  const shortlistId = String(formData.get('shortlist_id') ?? '')
  const missionId = String(formData.get('mission_id') ?? '')
  const nextValue = formData.get('next_value') === 'true'

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return

  const { error } = await supabase
    .from('shortlists')
    .update({ shared_with_external: nextValue })
    .eq('id', shortlistId)

  if (error) {
    logServerError('shortlists.toggleSharing', error, { tenantId: appUser.tenant_id, shortlistId })
    return
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'shortlist',
    entity_id: shortlistId,
    action: nextValue ? 'sharing_enabled' : 'sharing_disabled',
    actor_id: user.id,
  })
  if (logError) logServerError('shortlists.toggleSharing.activityLog', logError, { tenantId: appUser.tenant_id })

  revalidatePath(`/missions/${missionId}/shortlists/${shortlistId}`)
}
