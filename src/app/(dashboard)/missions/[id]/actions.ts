'use server'

import type Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'
import { getAnthropicClient } from '@/lib/anthropic'

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

// ---------------------------------------------------------------------
// Analyse IA du brief : extrait des critères structurés depuis le texte
// libre du brief client. Sortie forcée via tool_choice (pas de JSON en
// espérant que ça parse) — plus fiable, pas de parsing fragile.
// ---------------------------------------------------------------------
export type AnalyzeBriefState = { error?: string; criteriaCount?: number }

const EXTRACT_CRITERIA_TOOL: Anthropic.Tool = {
  name: 'extract_mission_criteria',
  description: "Enregistre les critères de sélection extraits d'un brief de mission freelance.",
  input_schema: {
    type: 'object',
    properties: {
      criteria: {
        type: 'array',
        description: 'Liste des critères identifiés dans le brief, sans doublon.',
        items: {
          type: 'object',
          properties: {
            label: {
              type: 'string',
              description: "Le critère, formulé clairement et brièvement (ex: '5 ans d'expérience Windows Server').",
            },
            weight: {
              type: 'integer',
              description: 'Importance : 1 = souhaitable, 2 = important, 3 = obligatoire/bloquant.',
              minimum: 1,
              maximum: 3,
            },
          },
          required: ['label', 'weight'],
        },
      },
    },
    required: ['criteria'],
  },
}

export async function analyzeBrief(
  _prevState: AnalyzeBriefState,
  formData: FormData
): Promise<AnalyzeBriefState> {
  const missionId = String(formData.get('mission_id') ?? '')
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  const { data: mission } = await supabase
    .from('missions')
    .select('id, brief_raw')
    .eq('id', missionId)
    .single()

  const briefRaw = mission?.brief_raw?.trim()
  if (!briefRaw) {
    return { error: "Aucun texte de brief à analyser. Ajoute-le d'abord sur la mission." }
  }

  const anthropic = getAnthropicClient()
  if (!anthropic) {
    logServerError('missions.analyzeBrief.missingApiKey', new Error('ANTHROPIC_API_KEY absente'), {
      tenantId: appUser.tenant_id,
      missionId,
    })
    return { error: "Clé API Anthropic non configurée côté serveur (ANTHROPIC_API_KEY)." }
  }

  let criteria: { label: string; weight: number }[] = []
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1024,
      system:
        "Tu extrais les critères de sélection d'un brief de mission freelance : compétences techniques, " +
        'expérience, certifications, disponibilité, contraintes. Précis et concis, un critère par ligne, ' +
        "sans doublon ni reformulation vague. Appelle toujours l'outil fourni, même si peu de critères " +
        'sont identifiables — dans ce cas renvoie une liste courte plutôt que vide.',
      tools: [EXTRACT_CRITERIA_TOOL],
      tool_choice: { type: 'tool', name: 'extract_mission_criteria' },
      messages: [{ role: 'user', content: briefRaw }],
    })

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    )
    const parsed = toolUse?.input as { criteria?: { label: string; weight: number }[] } | undefined
    criteria = (parsed?.criteria ?? []).filter((c) => c.label?.trim())
  } catch (err) {
    logServerError('missions.analyzeBrief.apiCall', err, { tenantId: appUser.tenant_id, missionId })
    return { error: "L'analyse du brief a échoué. Réessaie dans un instant." }
  }

  if (criteria.length === 0) {
    return { error: 'Aucun critère identifiable dans ce brief. Complète-le ou ajoute les critères à la main.' }
  }

  // Une nouvelle analyse remplace les critères IA précédents (pas les
  // critères ajoutés manuellement, qui ont source='manual').
  const { error: deleteError } = await supabase
    .from('brief_criteria')
    .delete()
    .eq('mission_id', missionId)
    .eq('source', 'ai')
  if (deleteError) {
    logServerError('missions.analyzeBrief.deleteOld', deleteError, { tenantId: appUser.tenant_id, missionId })
  }

  const { error: insertError } = await supabase.from('brief_criteria').insert(
    criteria.map((c) => ({
      tenant_id: appUser.tenant_id,
      mission_id: missionId,
      label: c.label,
      weight: c.weight,
      source: 'ai' as const,
    }))
  )

  if (insertError) {
    logServerError('missions.analyzeBrief.insert', insertError, { tenantId: appUser.tenant_id, missionId })
    return { error: 'Critères extraits mais impossible de les enregistrer.' }
  }

  const { error: logError } = await supabase.from('activity_log').insert({
    tenant_id: appUser.tenant_id,
    entity_type: 'mission',
    entity_id: missionId,
    action: 'brief_analyzed',
    actor_id: user.id,
  })
  if (logError) logServerError('missions.analyzeBrief.activityLog', logError, { tenantId: appUser.tenant_id, missionId })

  revalidatePath(`/missions/${missionId}`)
  return { criteriaCount: criteria.length }
}
