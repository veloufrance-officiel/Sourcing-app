'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'

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
    return { error: 'Impossible de créer le profil.' }
  }

  const { error: linkError } = await supabase.from('mission_candidates').insert({
    tenant_id: appUser.tenant_id,
    mission_id: missionId,
    candidate_id: candidate.id,
    stage_id: stageId,
  })

  if (linkError) {
    return { error: "Impossible d'ajouter le profil au pipeline." }
  }

  revalidatePath(`/missions/${missionId}`)
  return {}
}
