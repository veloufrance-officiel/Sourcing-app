'use client'

import { useActionState } from 'react'
import { addCandidateToShortlist, type ShortlistCandidateState } from './actions'

const initialState: ShortlistCandidateState = {}

export function AddToShortlistForm({
  missionId,
  shortlistId,
  availableCandidates,
}: {
  missionId: string
  shortlistId: string
  availableCandidates: { id: string; full_name: string }[]
}) {
  const [state, formAction, pending] = useActionState(addCandidateToShortlist, initialState)

  if (availableCandidates.length === 0) {
    return (
      <p className="mt-4 text-sm text-slate">
        Tous les profils du pipeline de cette mission sont déjà dans cette shortlist.
      </p>
    )
  }

  return (
    <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
      <input type="hidden" name="mission_id" value={missionId} />
      <input type="hidden" name="shortlist_id" value={shortlistId} />
      <div>
        <label htmlFor="candidate_id" className="block text-xs font-medium text-slate">
          Ajouter un profil du pipeline
        </label>
        <select
          id="candidate_id"
          name="candidate_id"
          required
          className="mt-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
        >
          <option value="">Choisir…</option>
          {availableCandidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name}
            </option>
          ))}
        </select>
      </div>
      {state.error ? <p className="w-full text-sm text-amber">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
      >
        {pending ? 'Ajout…' : '+ Ajouter'}
      </button>
    </form>
  )
}
