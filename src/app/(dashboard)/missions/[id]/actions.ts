'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type AddCandidateState = { error?: string }

export async function addCandidateToMission(
  _prevState: AddCandidateState,
  formData: FormData
): Promise<AddCandidateState> {
  const missionId = String(formData.get('mission_id') ?? '')
  const stageId = String(formData.get('stage_id') ?? '')
  const fullName = String(formData.get('full_name') ?? '').trim()
  if (!fullName) return { error: 'Le nom est requis.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase
    .from('app_users')
    .select('tenant_id')
    .eq('id', user.id)
    .single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .insert({
      tenant_id: appUser.tenant_id,
      full_name: fullName,
      title: String(formData.get('title') ?? '').trim() || null,
    })
    .select('id')
    .single()

  if (candidateError || !candidate) {
    logServerError('missions.addCandidate.createCandidate', candidateError, {
      tenantId: appUser.tenant_id,
      missionId,
    })
    return { error: 'Impossible de créer le profil.' }
  }

  const { error: linkError } = await supabase.from('mission_candidates').insert({
    tenant_id: appUser.tenant_id,
    mission_id: missionId,
    candidate_id: candidate.id,
    stage_id: stageId,
  })

  if (linkError) {
    logServerError('missions.addCandidate.link', linkError, { tenantId: appUser.tenant_id, missionId })
    return { error: "Impossible d'ajouter le profil au pipeline." }
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'mission_candidate',
    entity_id: candidate.id,
    action: 'added_to_pipeline',
    actor_id: user.id,
  })
  if (logError) logServerError('missions.addCandidate.activityLog', logError, { tenantId: appUser.tenant_id, missionId })

  revalidatePath(`/missions/${missionId}`)
  return {}
}
