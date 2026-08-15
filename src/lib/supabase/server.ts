import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Client Supabase côté serveur (Server Components, Server Actions, Route Handlers).
// Utilise toujours la clé "publishable" : la sécurité vient des policies RLS,
// jamais d'une clé qui les contourne. La clé "secret" ne doit jamais transiter ici.
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // setAll() appelé depuis un Server Component : sans effet, c'est le
            // proxy (src/proxy.ts) qui rafraîchit la session sur chaque requête.
          }
        },
      },
    }
  )
}
