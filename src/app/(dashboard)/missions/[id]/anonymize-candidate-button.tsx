'use client'

import { useActionState, useState } from 'react'
import { ShieldOff } from 'lucide-react'
import { anonymizeCandidate, type AnonymizeCandidateState } from './actions'

const initialState: AnonymizeCandidateState = {}

export function AnonymizeCandidateButton({
  candidateId,
  missionId,
  candidateName,
}: {
  candidateId: string
  missionId: string
  candidateName: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [state, formAction, pending] = useActionState(anonymizeCandidate, initialState)

  if (state.success) return null

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-slate hover:text-amber"
        title="Anonymiser (RGPD)"
      >
        <ShieldOff className="h-3 w-3" />
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-[10px] text-amber">Anonymiser {candidateName} ?</span>
      <form action={formAction}>
        <input type="hidden" name="candidate_id" value={candidateId} />
        <input type="hidden" name="mission_id" value={missionId} />
        <button type="submit" disabled={pending} className="text-[10px] font-semibold text-amber underline">
          {pending ? '…' : 'Confirmer'}
        </button>
      </form>
      <button type="button" onClick={() => setConfirming(false)} className="text-[10px] text-slate underline">
        Annuler
      </button>
    </span>
  )
}
