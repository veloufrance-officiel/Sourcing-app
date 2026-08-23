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
//
// getSession() peut échouer de deux façons distinctes, vérifié dans le
// code source de @supabase/auth-js avant d'écrire ce fichier, pas
// suppose : soit elle retourne { data, error } avec error rempli (cas
// normal, jamais un throw), soit elle rejette réellement la promesse si
// son initialisation interne échoue (await this.initializePromise, sans
// try/catch visible dans l'implémentation) — exactement le type
// d'échec AsyncStorage/Native module observé en conditions réelles plus
// tôt dans ce projet. Sans gérer ce second cas, l'app reste bloquée
// indéfiniment sur le spinner, jamais loading=false, aucun message.
import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [initError, setInitError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (cancelled) return
        if (error) {
          setInitError(error.message)
        } else {
          setSession(data.session)
        }
        setLoading(false)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        // Vrai rejet de promesse (pas le cas { error } normal) — sans
        // ce bloc, loading resterait true indéfiniment.
        setInitError(err instanceof Error ? err.message : 'Erreur de connexion inconnue.')
        setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  if (initError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Connexion impossible</Text>
        <Text style={styles.errorMessage}>{initError}</Text>
        <Pressable
          style={styles.retryButton}
          onPress={() => {
            setInitError(null)
            setLoading(true)
            supabase.auth
              .getSession()
              .then(({ data, error }) => {
                if (error) {
                  setInitError(error.message)
                } else {
                  setSession(data.session)
                }
                setLoading(false)
              })
              .catch((err: unknown) => {
                setInitError(err instanceof Error ? err.message : 'Erreur de connexion inconnue.')
                setLoading(false)
              })
          }}
        >
          <Text style={styles.retryText}>Réessayer</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <>
      <Stack>
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ title: 'Missions' }} />
          <Stack.Screen name="mission/[id]" options={{ title: 'Détail mission' }} />
          <Stack.Screen name="candidate/[id]" options={{ title: 'Détail candidat' }} />
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', padding: 24 },
  errorTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  errorMessage: { fontSize: 14, color: '#6b7280', textAlign: 'center', marginBottom: 20 },
  retryButton: { backgroundColor: '#111827', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 12 },
  retryText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})
