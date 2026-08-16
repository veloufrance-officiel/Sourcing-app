import { createClient } from '@supabase/supabase-js'

// Client service_role : bypasse RLS, jamais exposé au navigateur (utilisé
// uniquement dans du code serveur). Réservé aux opérations qui exigent
// explicitement ce niveau d'accès (ex : relire une clé BYOK en clair) —
// ne pas s'en servir comme raccourci pour éviter d'écrire une policy RLS.
export function createServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
