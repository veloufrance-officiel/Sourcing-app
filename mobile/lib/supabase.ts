// Client Supabase pour React Native/Expo — distinct de src/lib/supabase/*.ts
// côté web (celui-ci utilise @supabase/ssr, spécifique à Next.js, jamais
// portable vers React Native : pas de cookies HTTP en mobile natif).
//
// Même projet Supabase, mêmes policies RLS, aucune duplication de backend —
// seule la couche client change. AsyncStorage remplace les cookies pour la
// persistance de session, exactement le pattern documenté officiellement par
// Supabase pour React Native (pas une improvisation).
//
// Deux réglages conditionnels sur Platform.OS, corrigés après un vrai bug
// observé en conditions réelles (magic link web ramenait systématiquement
// vers l'écran login, jamais la session) :
//
// - storage: AsyncStorage n'a pas d'implémentation web propre (aucun fichier
//   .web.* dans le paquet, vérifié avant de corriger) — la doc officielle
//   Supabase pour React Native applique déjà Platform.OS !== 'web' sur ce
//   paramètre, jamais appliqué ici jusqu'à cette correction.
// - detectSessionInUrl: false est correct pour un vrai natif iOS/Android (pas
//   d'URL de navigateur à lire), mais faux pour le web — sans lire le
//   fragment d'URL renvoyé par le magic link, le client ne crée jamais la
//   session au retour du clic, quel que soit l'état réel côté Supabase.
import { Platform } from 'react-native'
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
    ...(Platform.OS !== 'web' ? { storage: AsyncStorage } : {}),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
})
