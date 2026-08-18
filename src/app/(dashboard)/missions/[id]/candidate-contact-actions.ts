'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type MarkCandidateContactedState = { error?: string; contactId?: string }

const MAX_MESSAGE_LENGTH = 4000

// "Marquer comme contacté", jamais "Envoyer" — SourcingOS ne possède ni
// destinataire enregistré ni infrastructure d'envoi (candidates.email
// est toujours NULL, confirmé en base avant d'écrire cette action). Le
// recruteur copie le message lui-même dans son propre canal ; cette
// action ne fait que tracer ce qu'il a validé, après coup.
export async function markCandidateContacted(
  _prevState: MarkCandidateContactedState,
  formData: FormData
): Promise<MarkCandidateContactedState> {
  const candidateId = String(formData.get('candidate_id') ?? '')
  const missionId = String(formData.get('mission_id') ?? '')
  const message = String(formData.get('message') ?? '').trim()

  if (!candidateId || !missionId) return { error: 'Candidat ou mission manquant.' }
  if (!message) return { error: 'Le message ne peut pas être vide.' }
  if (message.length > MAX_MESSAGE_LENGTH) return { error: 'Message trop long.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  // Candidat + mission appartiennent bien au tenant courant — vérifié
  // explicitement, pas seulement implicitement via RLS (défense en
  // profondeur, cohérent avec le pattern déjà en place sur
  // importGithubCandidates).
  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, github_user_id')
    .eq('id', candidateId)
    .eq('tenant_id', appUser.tenant_id)
    .single()
  if (!candidate) return { error: 'Candidat introuvable pour ce tenant.' }

  const { data: mission } = await supabase.from('missions').select('id').eq('id', missionId).eq('tenant_id', appUser.tenant_id).single()
  if (!mission) return { error: 'Mission introuvable pour ce tenant.' }

  // Opposition existante -> refus immédiat, avant toute écriture.
  // Vérifié en conditions réelles avant d'écrire cette action : le
  // lookup candidateId -> github_user_id -> contact_oppositions
  // fonctionne correctement dans les deux sens (candidat neuf jamais
  // bloqué à tort, candidat opposé toujours détecté).
  if (candidate.github_user_id) {
    const { data: opposition } = await supabase
      .from('contact_oppositions')
      .select('tenant_id')
      .eq('tenant_id', appUser.tenant_id)
      .eq('github_user_id', candidate.github_user_id)
      .maybeSingle()
    if (opposition) {
      return { error: 'Ce profil s\u2019est opposé à être contacté \u2014 action refusée.' }
    }
  }

  // legal_basis fixé ici, jamais fourni par le formulaire — un seul
  // scénario juridique pour ce MVP, pas un choix laissé au recruteur.
  const { data: contact, error } = await supabase
    .from('candidate_contacts')
    .insert({
      tenant_id: appUser.tenant_id,
      candidate_id: candidateId,
      mission_id: missionId,
      message_sent: message,
      legal_basis: 'legitimate_interest',
      sent_by: user.id,
    })
    .select('id')
    .single()

  if (error || !contact) {
    logServerError('candidateContacts.mark', error, { tenantId: appUser.tenant_id, candidateId })
    return { error: "Impossible d'enregistrer ce contact." }
  }

  revalidatePath(`/missions/${missionId}`)
  return { contactId: contact.id }
}

export type RecordCandidateResponseState = { error?: string; success?: boolean }

const VALID_RESPONSES = ['interested', 'refused', 'opposed']

// candidateContactId explicite, jamais déduit par "dernier contact
// pour ce candidat" — un candidat peut avoir plusieurs contacts, un
// par mission, la réponse doit s'attacher à l'interaction précise que
// l'UI a affichée, pas à une heuristique de tri.
export async function recordCandidateResponse(
  _prevState: RecordCandidateResponseState,
  formData: FormData
): Promise<RecordCandidateResponseState> {
  const contactId = String(formData.get('contact_id') ?? '')
  const response = String(formData.get('response') ?? '')
  const missionId = String(formData.get('mission_id') ?? '')

  if (!contactId) return { error: 'Contact manquant.' }
  if (!VALID_RESPONSES.includes(response)) return { error: 'Réponse invalide.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  // Le contactId fourni par le navigateur est un identifiant de
  // référence, jamais une preuve d'autorisation — revalidé
  // explicitement contre le tenant courant avant toute écriture.
  const { data: existing } = await supabase
    .from('candidate_contacts')
    .select('id, tenant_id')
    .eq('id', contactId)
    .eq('tenant_id', appUser.tenant_id)
    .single()
  if (!existing) return { error: 'Contact introuvable pour ce tenant.' }

  // .select() après l'update, pas seulement vérifier l'absence
  // d'erreur : un UPDATE bloqué silencieusement par RLS (rôle
  // insuffisant, ex. viewer — confirmé en conditions réelles avant
  // d'écrire cette action) ne lève aucune exception PostgREST, il
  // affecte simplement 0 ligne. Sans ce .select(), l'action croirait à
  // tort avoir réussi.
  const { data: updated, error } = await supabase
    .from('candidate_contacts')
    .update({ response, responded_at: new Date().toISOString() })
    .eq('id', contactId)
    .select('id')
    .single()

  if (error || !updated) {
    logServerError('candidateContacts.recordResponse', error, { tenantId: appUser.tenant_id, contactId })
    return { error: "Impossible d'enregistrer cette réponse (droits insuffisants ou contact introuvable)." }
  }

  if (missionId) revalidatePath(`/missions/${missionId}`)
  return { success: true }
}
