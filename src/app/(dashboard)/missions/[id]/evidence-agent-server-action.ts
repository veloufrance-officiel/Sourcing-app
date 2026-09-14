'use server'

import type Anthropic from '@anthropic-ai/sdk'
import { revalidatePath } from 'next/cache'
import { getAnthropicClientForTenantSafe } from '@/lib/anthropic'
import { buildEvidenceDrafts, groundEvidenceProposals } from '@/lib/evidence-agent'
import { logServerError } from '@/lib/log'
import { createClient } from '@/lib/supabase/server'
import { EVIDENCE_PROPOSAL_TOOL, buildCandidateSnapshot, candidateEvidenceSource } from './evidence-agent-actions'

export type RunEvidenceAgentState = { error?: string; proposed?: number; saved?: number }

export async function runEvidenceAgent(
  _prevState: RunEvidenceAgentState,
  formData: FormData
): Promise<RunEvidenceAgentState> {
  const missionId = String(formData.get('mission_id') ?? '')
  const candidateId = String(formData.get('candidate_id') ?? '')
  if (!missionId || !candidateId) return { error: 'Mission ou candidat manquant.' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { data: appUser } = await supabase.from('app_users').select('tenant_id').eq('id', user.id).single()
  if (!appUser) return { error: 'Compte non rattaché à un tenant.' }

  const { data: link } = await supabase
    .from('mission_candidates')
    .select('candidate_id')
    .eq('mission_id', missionId)
    .eq('candidate_id', candidateId)
    .single()
  if (!link) return { error: "Ce candidat n'appartient pas à cette mission." }

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, full_name, title, location, skills, source, github_user_id')
    .eq('id', candidateId)
    .single()
  if (!candidate) return { error: 'Candidat introuvable.' }

  const { data: criteria } = await supabase
    .from('brief_criteria')
    .select('id, label')
    .eq('mission_id', missionId)
    .eq('weight', 3)
  if (!criteria?.length) return { error: 'Aucun critère obligatoire à analyser.' }

  const anthropic = await getAnthropicClientForTenantSafe(appUser.tenant_id)
  if (anthropic.status !== 'AVAILABLE') return { error: 'Anthropic indisponible pour ce tenant.' }

  const snapshot = buildCandidateSnapshot(candidate)
  const criterionList = criteria.map((criterion) => `${criterion.id}: ${criterion.label}`).join('\n')

  let proposals: unknown[]
  try {
    const response = await anthropic.client.messages.create({
      model: 'claude-sonnet-5',
      max_tokens: 1200,
      system: 'Repère uniquement les signaux explicitement présents dans le snapshot. source_excerpt doit être recopié exactement depuis ce snapshot. Ne déduis rien qui ne soit écrit.',
      tools: [EVIDENCE_PROPOSAL_TOOL as Anthropic.Tool],
      tool_choice: { type: 'tool', name: 'propose_candidate_evidence' },
      messages: [{ role: 'user', content: `CRITERES\n${criterionList}\n\nSNAPSHOT\n${snapshot}` }],
    })
    const toolUse = response.content.find((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use')
    const parsed = toolUse?.input as { proposals?: unknown[] } | undefined
    proposals = Array.isArray(parsed?.proposals) ? parsed.proposals : []
  } catch (error) {
    logServerError('evidenceAgent.apiCall', error, { tenantId: appUser.tenant_id, missionId, candidateId })
    return { error: "L'analyse des preuves a échoué." }
  }

  const source = candidateEvidenceSource(candidate)
  const grounded = groundEvidenceProposals({
    sourceText: snapshot,
    sourceType: source.type,
    sourceUrl: source.url,
    proposals,
  })
  const drafts = buildEvidenceDrafts({
    tenantId: appUser.tenant_id,
    candidateId,
    mandatoryCriteria: criteria,
    proposals: grounded,
  })

  if (drafts.length > 0) {
    const { error } = await supabase.from('evidence').insert(drafts)
    if (error) {
      logServerError('evidenceAgent.insert', error, { tenantId: appUser.tenant_id, missionId, candidateId })
      return { error: "Impossible d'enregistrer les preuves proposées." }
    }

    const { error: logError } = await supabase.from('activity_log').insert({
      tenant_id: appUser.tenant_id,
      entity_type: 'evidence',
      entity_id: candidateId,
      action: 'evidence_agent_ran',
      actor_id: user.id,
    })
    if (logError) logServerError('evidenceAgent.activityLog', logError, { tenantId: appUser.tenant_id })
  }

  revalidatePath(`/missions/${missionId}`)
  return { proposed: proposals.length, saved: drafts.length }
}
