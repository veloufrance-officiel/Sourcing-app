'use client'

import { useActionState } from 'react'
import { runEvidenceAgent, type RunEvidenceAgentState } from './evidence-agent-server-action'

const initialState: RunEvidenceAgentState = {}

export function EvidenceAgentButton({ missionId, candidateId }: { missionId: string; candidateId: string }) {
  const [state, formAction, pending] = useActionState(runEvidenceAgent, initialState)

  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      <input type="hidden" name="mission_id" value={missionId} />
      <input type="hidden" name="candidate_id" value={candidateId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-medium text-ink hover:border-signal hover:text-signal disabled:opacity-50"
      >
        {pending ? 'Analyse…' : 'Analyser les preuves'}
      </button>
      {state.error ? <span className="max-w-56 text-right text-[11px] text-amber">{state.error}</span> : null}
      {state.saved !== undefined && !state.error ? (
        <span className="text-[11px] text-slate">
          {state.saved} preuve{state.saved > 1 ? 's' : ''} proposée{state.saved > 1 ? 's' : ''}
        </span>
      ) : null}
    </form>
  )
}
