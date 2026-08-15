'use client'

import { useActionState } from 'react'
import { signInWithEmail, type SignInState } from './actions'
import { OAuthButtons } from './oauth-buttons'

const initialState: SignInState = {}

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signInWithEmail, initialState)

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-paper px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-signal opacity-[0.06] blur-3xl"
      />
      <div className="relative w-full max-w-sm">
        <p className="font-display text-sm uppercase tracking-[0.25em] text-slate">OrakL</p>
        <h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-ink">Sourcing OS</h1>
        <p className="mt-2 text-sm text-slate">Connexion réservée aux comptes déjà provisionnés.</p>

        <div className="mt-10 rounded-2xl border border-line bg-white p-6 shadow-sm">
          {!state.success ? (
            <div>
              <OAuthButtons />
              <div className="my-5 flex items-center gap-3 text-xs text-slate">
                <span className="h-px flex-1 bg-line" />
                ou
                <span className="h-px flex-1 bg-line" />
              </div>
            </div>
          ) : null}

          {state.success ? (
            <p className="rounded-lg border border-line bg-signal-soft px-4 py-3 text-sm text-ink">
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
                className="w-full rounded-lg bg-ink px-3 py-2.5 text-sm font-medium text-paper transition hover:bg-ink/90 disabled:opacity-50"
              >
                {pending ? 'Envoi…' : 'Recevoir le lien de connexion'}
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
