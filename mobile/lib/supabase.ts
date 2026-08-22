// Client Supabase pour React Native/Expo — distinct de src/lib/supabase/*.ts
// côté web (celui-ci utilise @supabase/ssr, spécifique à Next.js, jamais
// portable vers React Native : pas de cookies HTTP en mobile natif).
//
// Même projet Supabase, mêmes policies RLS, aucune duplication de backend —
// seule la couche client change. AsyncStorage remplace les cookies pour la
// persistance de session, exactement le pattern documenté officiellement par
// Supabase pour React Native (pas une improvisation).
import 'react-native-url-polyfill/auto'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL et EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY doivent être définis — voir .env.example'
  )
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
})
