import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Point d'entrée unique pour tout flux Supabase Auth qui redirige avec un
// ?code= à échanger : OAuth (Google, Apple) et lien magique (PKCE).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/missions'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
