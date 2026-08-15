'use client'

import { createClient } from '@/lib/supabase/client'

// Boutons fonctionnels et neutres pour l'instant. Avant mise en prod,
// remplacer par les boutons officiels (Google Identity Services / Sign in
// with Apple JS) — chaque marque impose ses propres règles graphiques.
export function OAuthButtons() {
  async function signInWithProvider(provider: 'google' | 'apple') {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => signInWithProvider('google')}
        className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm font-medium text-ink hover:bg-paper"
      >
        Continuer avec Google
      </button>
      <button
        type="button"
        onClick={() => signInWithProvider('apple')}
        className="w-full rounded-lg bg-ink px-3 py-2 text-sm font-medium text-paper hover:bg-ink/90"
      >
        Continuer avec Apple
      </button>
    </div>
  )
}
