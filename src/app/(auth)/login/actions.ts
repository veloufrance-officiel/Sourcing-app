'use server'

import { createClient } from '@/lib/supabase/server'

export type SignInState = { error?: string; success?: boolean }

// Phase 1 : pas de self-serve. shouldCreateUser: false — seuls les comptes
// déjà provisionnés (toi, Arnaud si besoin) peuvent recevoir un lien.
// L'inscription libre arrive en Phase 5, avec la couche SaaS.
export async function signInWithEmail(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get('email') ?? '').trim()
  if (!email) {
    return { error: 'Adresse email requise.' }
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  })

  if (error) {
    return { error: "Impossible d'envoyer le lien de connexion. Réessaie dans un instant." }
  }

  return { success: true }
}
