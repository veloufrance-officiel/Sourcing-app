'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'
import type { GithubSearchResult } from './github-search-actions'

export type ImportGithubCandidatesState = { error?: string; imported?: number }

// Reçoit les résultats déjà obtenus par searchGithubCandidates (jamais
// re-interrogés ici) : le recruteur a déjà vu et sélectionné, cette
// action ne fait plus que persister son choix.
export async function importGithubCandidates(
  _prevState: ImportGithubCandidatesState,
  formData: FormData
): Promise<ImportGithubCandidatesState> {
  const missionId = String(formData.get('mission_id') ?? '')
  const selectedJson = String(formData.get('selected_profiles') ?? '')

  if (!missionId || !selectedJson) return { error: 'Sélection manquante.' }

  let selected: GithubSearchResult[]
  try {
    selected = JSON.parse(selectedJson)
  } catch {
    return { error: 'Sélection invalide.' }
  }
  if (!Array.isArray(selected) || selected.length === 0) {
    return { error: 'Aucun profil sélectionné.' }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  const { data: pipelineStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('tenant_id', appUser.tenant_id)
    .order('sort_order', { ascending: true })
    .limit(1)
    .single()
  if (!pipelineStage) {
    return { error: "Aucune étape de pipeline configurée pour ce tenant." }
  }

  const { data: criteria } = await supabase
    .from('brief_criteria')
    .select('id, label')
    .eq('mission_id', missionId)
    .eq('weight', 3)

  let importedCount = 0

  for (const profile of selected) {
    // source='github', github_user_id=profile.id (identifiant numérique
    // stable, jamais le login mutable), consent_status='pending'
    // (défaut de la colonne, jamais 'granted' fourni ici — le recruteur
    // devra explicitement obtenir et enregistrer le consentement plus
    // tard, ailleurs dans le produit, avant que ce candidat puisse
    // jamais atteindre une shortlist).
    const { data: candidate, error: candidateError } = await supabase
      .from('candidates')
      .insert({
        tenant_id: appUser.tenant_id,
        full_name: profile.name || profile.login,
        title: profile.bio,
        location: profile.location,
        skills: profile.detectedSkills,
        source: 'github',
        github_user_id: profile.id,
      })
      .select('id')
      .single()

    if (candidateError || !candidate) {
      logServerError('github.import.candidate', candidateError, { tenantId: appUser.tenant_id, login: profile.login })
      continue // un profil qui échoue à l'import ne doit pas bloquer les autres
    }

    const { error: mcError } = await supabase.from('mission_candidates').insert({
      tenant_id: appUser.tenant_id,
      mission_id: missionId,
      candidate_id: candidate.id,
      stage_id: pipelineStage.id,
    })
    if (mcError) {
      logServerError('github.import.missionCandidate', mcError, { tenantId: appUser.tenant_id, candidateId: candidate.id })
    }

    // Evidence : uniquement pour les critères obligatoires où un signal
    // détecté correspond. is_inference=true, status='INFERRED_UNCONFIRMED'
    // — jamais 'VERIFIED', jamais fourni par cette action, cohérent avec
    // la contrainte déjà posée en base (evidence_inference_never_verified)
    // qui rendrait de toute façon impossible d'écrire VERIFIED ici même
    // par erreur.
    for (const criterion of criteria ?? []) {
      const criterionLower = criterion.label.toLowerCase()
      const hasSignal = profile.detectedSkills.some((skill) => criterionLower.includes(skill.toLowerCase()))
      if (!hasSignal) continue

      const { error: evidenceError } = await supabase.from('evidence').insert({
        tenant_id: appUser.tenant_id,
        candidate_id: candidate.id,
        criterion_id: criterion.id,
        status: 'INFERRED_UNCONFIRMED',
        is_inference: true,
        evidence_text: `Signal détecté automatiquement sur GitHub (${profile.login}) : présence de code public correspondant à "${criterion.label}". Ne prouve pas la maîtrise réelle — à confirmer par le recruteur.`,
        source_type: 'web_search',
        source_priority: 3,
        source_url: profile.htmlUrl,
      })
      if (evidenceError) {
        logServerError('github.import.evidence', evidenceError, { tenantId: appUser.tenant_id, candidateId: candidate.id })
      }
    }

    importedCount++
  }

  if (importedCount === 0) {
    return { error: "Aucun profil n'a pu être importé." }
  }

  revalidatePath(`/missions/${missionId}`)
  return { imported: importedCount }
}
