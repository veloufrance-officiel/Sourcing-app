'use client'

import { useActionState } from 'react'
import { createMission, type MissionFormState } from './actions'

const initialState: MissionFormState = {}

export default function NewMissionPage() {
  const [state, formAction, pending] = useActionState(createMission, initialState)

  return (
    <div className="max-w-lg">
      <h1 className="font-display text-2xl font-semibold text-ink">Nouvelle mission</h1>
      <form action={formAction} className="mt-6 space-y-4">
        <Field label="Titre" name="title" required placeholder="Administrateur Système" />
        <Field label="Client" name="client_name" placeholder="Client DEMO" />
        <Field label="Lieu" name="location" placeholder="Bordeaux" />
        <Field label="Type de contrat" name="contract_type" placeholder="Freelance" />
        <Field label="TJM (€)" name="daily_rate" type="number" placeholder="350" />
        <div>
          <label htmlFor="brief_raw" className="block text-sm font-medium text-ink">
            Brief client (optionnel)
          </label>
          <textarea
            id="brief_raw"
            name="brief_raw"
            rows={5}
            placeholder="Colle ici le texte du brief — l'analyse IA en extraira les critères."
            className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
          />
        </div>
        {state.error ? <p className="text-sm text-amber">{state.error}</p> : null}
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
        >
          {pending ? 'Création…' : 'Créer la mission'}
        </button>
      </form>
    </div>
  )
}

function Field({
  label,
  name,
  required,
  placeholder,
  type = 'text',
}: {
  label: string
  name: string
  required?: boolean
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label htmlFor={name} className="block text-sm font-medium text-ink">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
      />
    </div>
  )
}
