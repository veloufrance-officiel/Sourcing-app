import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './lib/supabase'
import { LoginScreen } from './screens/LoginScreen'

export default function App() {
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

  if (!session) {
    return (
      <>
        <LoginScreen />
        <StatusBar style="auto" />
      </>
    )
  }

  // Écran minimal prouvant que la session persiste réellement — pas
  // encore le vrai pipeline mission/candidat, juste la preuve que
  // l'authentification fonctionne de bout en bout contre la même base
  // Supabase que le web.
  return (
    <View style={styles.centered}>
      <Text style={styles.connected}>Connecté : {session.user.email}</Text>
      <Pressable style={styles.signOutButton} onPress={() => supabase.auth.signOut()}>
        <Text style={styles.signOutText}>Se déconnecter</Text>
      </Pressable>
      <StatusBar style="auto" />
    </View>
  )
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  connected: { fontSize: 16, marginBottom: 16 },
  signOutButton: { padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
  signOutText: { fontSize: 14, color: '#374151' },
})
