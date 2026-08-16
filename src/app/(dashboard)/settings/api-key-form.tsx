'use client'

import { useActionState } from 'react'
import { KeyRound } from 'lucide-react'
import { setAnthropicKey, removeAnthropicKey, type ApiKeyState } from './actions'

const initialState: ApiKeyState = {}

export function ApiKeyForm({ hasKey }: { hasKey: boolean }) {
  const [state, formAction, pending] = useActionState(setAnthropicKey, initialState)

  return (
    <div className="rounded-xl border border-line bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-signal" />
        <p className="font-display text-xs font-semibold uppercase tracking-wider text-ink">
          Clé API Anthropic (BYOK)
        </p>
      </div>
      <p className="mt-2 text-sm text-slate">
        Utilisée pour l&apos;analyse IA du brief. Ta propre clé, ta propre consommation — sans clé
        configurée ici, l&apos;analyse utilise la clé par défaut de la plateforme si elle existe.
      </p>

      {hasKey || state.success ? (
        <div className="mt-4 flex items-center justify-between rounded-lg bg-signal-soft px-3 py-2">
          <p className="text-sm font-medium text-ink">✓ Clé configurée</p>
          <form action={removeAnthropicKey}>
            <button type="submit" className="text-xs font-medium text-amber hover:underline">
              Retirer
            </button>
          </form>
        </div>
      ) : (
        <form action={formAction} className="mt-4 flex flex-wrap items-end gap-3">
          <div className="min-w-[16rem] flex-1">
            <label htmlFor="api_key" className="block text-xs font-medium text-slate">
              Clé (sk-ant-...)
            </label>
            <input
              id="api_key"
              name="api_key"
              type="password"
              required
              placeholder="sk-ant-api03-..."
              className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 font-mono text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
          </div>
          {state.error ? <p className="w-full text-sm text-amber">{state.error}</p> : null}
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-paper hover:bg-ink/90 disabled:opacity-50"
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      )}
      <p className="mt-3 text-xs text-slate">
        Stockée chiffrée (Supabase Vault). Jamais réaffichée en clair une fois enregistrée, jamais
        visible par un rôle autre que owner/admin.
      </p>
    </div>
  )
}
