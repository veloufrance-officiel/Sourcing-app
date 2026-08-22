// Root layout — remplace la logique de session qui vivait dans
// l'ancien App.tsx. Stack.Protected (mécanisme officiel depuis SDK 53,
// ce projet est en 57) plutôt que des redirections manuelles : plus
// robuste, gère automatiquement le nettoyage de l'historique de
// navigation quand le guard change.
//
// Point de vigilance connu, pas une surprise à découvrir plus tard : si
// l'utilisateur est sur un écran protégé et que le guard passe à false
// (ex. déconnexion), le router bascule silencieusement vers le premier
// écran disponible, sans message d'erreur visible.
import { useEffect, useState } from 'react'
import { View, StyleSheet, ActivityIndicator } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => subscription.subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  return (
    <>
      <Stack>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ title: 'Missions' }} />
          <Stack.Screen name="mission/[id]" options={{ title: 'Détail mission' }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="login" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' },
})
