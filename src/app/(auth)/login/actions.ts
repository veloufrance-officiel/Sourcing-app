'use server'

import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

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

  // 5 demandes / 15 min par email : empêche de spammer la boîte mail de
  // quelqu'un d'autre. Fail-open volontaire (voir catch) : une panne du
  // rate limiter ne doit jamais empêcher une connexion légitime.
  try {
    const { data: allowed, error: rateLimitError } = await supabase.rpc('check_rate_limit', {
      p_key: `login:${email.toLowerCase()}`,
      p_max_attempts: 5,
      p_window_seconds: 900,
    })
    if (rateLimitError) {
      logServerError('login.checkRateLimit', rateLimitError, { emailDomain: email.split('@')[1] ?? null })
    } else if (allowed === false) {
      return { error: 'Trop de tentatives. Réessaie dans quelques minutes.' }
    }
  } catch (err) {
    logServerError('login.checkRateLimit.exception', err, { emailDomain: email.split('@')[1] ?? null })
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      // TEMPORAIRE (bootstrap) : true pour permettre la toute première
      // connexion sans compte pré-provisionné manuellement. À repasser à
      // false une fois que toi (et Arnaud si besoin) avez un compte —
      // le vrai contrôle d'accès reste app_users + RLS, pas ce flag.
      shouldCreateUser: true,
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`,
    },
  })

  if (error) {
    // Ne jamais logger l'email en clair : au pire un domaine, jamais l'adresse complète.
    logServerError('login.signInWithOtp', error, { emailDomain: email.split('@')[1] ?? null })
    return { error: "Impossible d'envoyer le lien de connexion. Réessaie dans un instant." }
  }

  return { success: true }
}
