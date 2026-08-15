'use client'

import { UserPlus } from 'lucide-react'
import { useActionState } from 'react'
import { addCandidateToMission, type AddCandidateState } from './actions'

const initialState: AddCandidateState = {}

export function AddCandidateForm({ missionId, stageId }: { missionId: string; stageId: string }) {
  const [state, formAction, pending] = useActionState(addCandidateToMission, initialState)

  return (
    <div className="mt-6 rounded-xl border border-line bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <UserPlus className="h-3.5 w-3.5 text-slate" />
        <p className="text-xs font-semibold uppercase tracking-wider text-slate">Ajouter au pipeline</p>
      </div>
      <form action={formAction} className="mt-3 flex flex-wrap items-end gap-3">
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
        <div>
          <label htmlFor="skills" className="block text-xs font-medium text-slate">
            Compétences (séparées par des virgules)
          </label>
          <input
            id="skills"
            name="skills"
            placeholder="Windows Server, Active Directory, PowerShell"
            className="mt-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
          />
        </div>
        <div>
          <label htmlFor="location" className="block text-xs font-medium text-slate">
            Localisation
          </label>
          <input
            id="location"
            name="location"
            placeholder="Bordeaux"
            className="mt-1 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
          />
        </div>
        <label className="flex items-center gap-2 self-end pb-2 text-xs text-ink">
          <input
            type="checkbox"
            name="qualified_by_arnaud"
            className="h-4 w-4 rounded border-line accent-[#2563eb] focus:ring-2 focus:ring-signal/30"
          />
          Pré-qualifié par Arnaud
        </label>
        {state.error ? <p className="w-full text-sm text-amber">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {pending ? 'Ajout…' : '+ Ajouter au pipeline'}
        </button>
      </form>
    </div>
  )
}
