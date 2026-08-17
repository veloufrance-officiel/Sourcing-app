'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type ConfirmEvidenceState = { error?: string; success?: boolean }

// Ne garantit RIEN elle-même sur verified_by/verified_at ni sur le refus
// d'un pipeline automatique — ce n'est pas son rôle. Le trigger
// internal.enforce_human_verification (durcissement Evidence, déjà
// testé exhaustivement) impose déjà auth.uid() non null et écrase toute
// valeur fournie ici pour verified_by/verified_at. Cette action se
// contente d'appeler createClient() (session réelle, jamais
// service_role) et de laisser l'erreur du trigger remonter telle
// quelle si jamais elle se déclenchait — cas normalement impossible ici
// puisque createClient() porte toujours une vraie session ou échoue
// avant (see !user ci-dessous).
export async function confirmEvidence(
  _prevState: ConfirmEvidenceState,
  formData: FormData
): Promise<ConfirmEvidenceState> {
  const candidateId = String(formData.get('candidate_id') ?? '')
  const criterionId = String(formData.get('criterion_id') ?? '')
  const missionId = String(formData.get('mission_id') ?? '')
  const status = String(formData.get('status') ?? '')
  const evidenceText = String(formData.get('evidence_text') ?? '').trim()
  const verificationMethod = String(formData.get('verification_method') ?? '').trim()

  if (status !== 'VERIFIED' && status !== 'CONTRADICTED') {
    return { error: 'Statut invalide.' }
  }
  if (!candidateId || !criterionId) {
    return { error: 'Candidat ou critère manquant.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  // is_inference=false, source_type='recruiter_note' : reflète une
  // déclaration humaine directe (confirmation après revue), pas une
  // extraction automatique. verified_by/verified_at délibérément non
  // fournis ici — imposés par le trigger, jamais par ce code.
  const { error } = await supabase.from('evidence').insert({
    tenant_id: appUser.tenant_id,
    candidate_id: candidateId,
    criterion_id: criterionId,
    status,
    is_inference: false,
    evidence_text: evidenceText || null,
    source_type: 'recruiter_note',
    source_priority: 1,
    verification_method: verificationMethod || null,
  })

  if (error) {
    logServerError('evidence.confirm', error, { tenantId: appUser.tenant_id, candidateId, criterionId })
    return { error: "Impossible d'enregistrer cette confirmation." }
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'evidence',
    entity_id: candidateId,
    action: status === 'VERIFIED' ? 'evidence_verified' : 'evidence_contradicted',
    actor_id: user.id,
  })
  if (logError) logServerError('evidence.confirm.activityLog', logError, { tenantId: appUser.tenant_id })

  revalidatePath(`/missions/${missionId}`)
  return { success: true }
}
