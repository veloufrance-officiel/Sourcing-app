'use client'

import { useActionState } from 'react'
import { addCandidateToMission, type AddCandidateState } from './actions'

const initialState: AddCandidateState = {}

export function AddCandidateForm({ missionId, stageId }: { missionId: string; stageId: string }) {
  const [state, formAction, pending] = useActionState(addCandidateToMission, initialState)

  return (
    <form
      action={formAction}
      className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-line bg-white p-4"
    >
      <input type="hidden" name="mission_id" value={missionId} />
      <input type="hidden" name="stage_id" value={stageId} />
      <div>
        <label htmlFor="full_name" className="block text-xs font-medium text-slate">
          Nom du profil
        </label>
        <input
          id="full_name"
          name="full_name"
          required
          placeholder="Profil DEMO A"
          className="mt-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
        />
      </div>
      <div>
        <label htmlFor="title" className="block text-xs font-medium text-slate">
          Intitulé
        </label>
        <input
          id="title"
          name="title"
          placeholder="Administrateur Système Senior"
          className="mt-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
        />
      </div>
      {state.error ? <p className="w-full text-sm text-amber">{state.error}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
      >
        {pending ? 'Ajout…' : '+ Ajouter au pipeline'}
      </button>
    </form>
  )
}
