'use client'

import { useActionState } from 'react'
import { useParams } from 'next/navigation'
import { createShortlist, type CreateShortlistState } from './actions'

const initialState: CreateShortlistState = {}

export default function NewShortlistPage() {
  const params = useParams<{ id: string }>()
  const [state, formAction, pending] = useActionState(createShortlist, initialState)

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-semibold text-ink">Nouvelle shortlist</h1>
      <form action={formAction} className="mt-6 space-y-4">
        <input type="hidden" name="mission_id" value={params.id} />
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-ink">
            Nom
          </label>
          <input
            id="name"
            name="name"
            required
            placeholder="Shortlist finale"
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            name="shared_with_external"
            className="h-4 w-4 rounded border-line accent-[#2563eb] focus:ring-2 focus:ring-signal/30"
          />
          Destinée à être partagée en externe (Arnaud)
        </label>
        <p className="text-xs text-slate">
          Le partage externe lui-même (lien) n&apos;est pas encore construit — cette case prépare juste le terrain.
        </p>
        {state.error ? <p className="text-sm text-amber">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {pending ? 'Création…' : 'Créer la shortlist'}
        </button>
      </form>
    </div>
  )
}
