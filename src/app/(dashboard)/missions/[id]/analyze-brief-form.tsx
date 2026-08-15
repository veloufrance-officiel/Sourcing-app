'use client'

import { useActionState } from 'react'
import { analyzeBrief, type AnalyzeBriefState } from './actions'

const initialState: AnalyzeBriefState = {}

export function AnalyzeBriefForm({ missionId }: { missionId: string }) {
  const [state, formAction, pending] = useActionState(analyzeBrief, initialState)

  return (
    <form action={formAction} className="mt-3">
      <input type="hidden" name="mission_id" value={missionId} />
      {state.error ? <p className="mb-2 text-sm text-amber">{state.error}</p> : null}
      {state.criteriaCount !== undefined ? (
        <p className="mb-2 text-sm text-ink">
          {state.criteriaCount} critère{state.criteriaCount > 1 ? 's' : ''} extrait
          {state.criteriaCount > 1 ? 's' : ''}.
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium text-ink hover:bg-paper disabled:opacity-50"
      >
        {pending ? 'Analyse…' : 'Analyser le brief avec l\u2019IA'}
      </button>
    </form>
  )
}
