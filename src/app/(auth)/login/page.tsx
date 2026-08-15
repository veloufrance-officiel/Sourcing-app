'use client'

import { useActionState } from 'react'
import { signInWithEmail, type SignInState } from './actions'
import { OAuthButtons } from './oauth-buttons'

const initialState: SignInState = {}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInWithEmail, initialState)

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6">
      <div className="w-full max-w-sm">
        <p className="font-display text-sm uppercase tracking-[0.2em] text-slate">OrakL</p>
        <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Sourcing OS</h1>
        <p className="mt-2 text-sm text-slate">Connexion réservée aux comptes déjà provisionnés.</p>

        {!state.success ? (
          <div className="mt-8">
            <OAuthButtons />
            <div className="my-4 flex items-center gap-3 text-xs text-slate">
              <span className="h-px flex-1 bg-line" />
              ou
              <span className="h-px flex-1 bg-line" />
            </div>
          </div>
        ) : null}

        {state.success ? (
          <p className="mt-8 rounded-lg border border-line bg-signal-soft px-4 py-3 text-sm text-ink">
            Lien de connexion envoyé. Vérifie ta boîte mail.
          </p>
        ) : (
          <form action={formAction} className="space-y-3">
            <label className="block text-sm font-medium text-ink" htmlFor="email">
              Email professionnel
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="prenom@cabinet.fr"
              className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink outline-none focus:border-signal focus:ring-2 focus:ring-signal/20"
            />
            {state.error ? <p className="text-sm text-amber">{state.error}</p> : null}
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50"
            >
              {pending ? 'Envoi…' : 'Recevoir le lien de connexion'}
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
