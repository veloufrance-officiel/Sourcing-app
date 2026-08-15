'use client'

import { useActionState, useState } from 'react'
import { createMission, type MissionFormState } from './actions'

const initialState: MissionFormState = {}

export function MissionForm({ clients }: { clients: { id: string; name: string }[] }) {
  const [state, formAction, pending] = useActionState(createMission, initialState)
  const [clientMode, setClientMode] = useState<'existing' | 'new'>(clients.length > 0 ? 'existing' : 'new')

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <Field label="Titre" name="title" required placeholder="Administrateur Système" />

      <fieldset>
        <legend className="block text-sm font-medium text-ink">
          Origine de la mission <span className="text-amber">*</span>
        </legend>
        <p className="mt-1 text-xs text-slate">Détermine le partage à 10% avec Arnaud — pas de choix par défaut.</p>
        <div className="mt-2 flex gap-4">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="source" value="arnaud" required className="border-line" />
            Arnaud (apport d&apos;affaires)
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="radio" name="source" value="direct" required className="border-line" />
            Direct
          </label>
        </div>
      </fieldset>

      <div>
        <p className="block text-sm font-medium text-ink">Client</p>
        {clients.length > 0 ? (
          <div className="mt-1 flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={clientMode === 'existing'}
                onChange={() => setClientMode('existing')}
                className="border-line"
              />
              Client existant
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={clientMode === 'new'}
                onChange={() => setClientMode('new')}
                className="border-line"
              />
              Nouveau client
            </label>
          </div>
        ) : null}

        {clientMode === 'existing' && clients.length > 0 ? (
          <select
            name="client_id"
            className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
          >
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <input
            name="new_client_name"
            placeholder="Nom du client"
            className="mt-2 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
          />
        )}
      </div>

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
