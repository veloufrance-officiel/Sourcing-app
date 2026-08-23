// Écran de login minimal — magic link uniquement, cohérent avec la
// politique déjà en place côté web (src/app/(auth)/login/actions.ts) :
// shouldCreateUser: false, pas de self-serve en Phase 1, seuls les
// comptes déjà provisionnés peuvent se connecter.
//
// emailRedirectTo explicite sur web : sans lui, Supabase retombe
// silencieusement sur le Site URL par défaut du projet (confirmé par
// la doc officielle Supabase) — c'est exactement ce qui redirigeait
// vers le site web principal au lieu de ce déploiement mobile de test,
// avant cette correction. Doit correspondre à une entrée de la liste
// "Redirect URLs" du Dashboard Supabase, sinon même correction
// silencieusement ignorée — vérifier ce réglage côté Dashboard.
//
// Platform.OS === 'web' avant d'utiliser window : ce composant est
// partagé avec le natif iOS/Android (jamais de `window` global
// là-bas), un accès direct planterait un futur build natif.
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Platform } from 'react-native'
import { supabase } from '../lib/supabase'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  async function handleSendMagicLink() {
    if (!email.trim()) {
      setStatus('error')
      setErrorMessage('Adresse email requise.')
      return
    }
    setStatus('sending')
    setErrorMessage(null)

    // shouldCreateUser: false — même politique que le web, cohérente
    // et non dupliquée arbitrairement : seuls les comptes déjà
    // provisionnés en base peuvent recevoir un lien.
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        shouldCreateUser: false,
        ...(Platform.OS === 'web' ? { emailRedirectTo: window.location.origin } : {}),
      },
    })

    if (error) {
      setStatus('error')
      setErrorMessage(error.message)
      return
    }
    setStatus('sent')
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>SourcingOS</Text>
      {status === 'sent' ? (
        <Text style={styles.message}>
          Lien envoyé à {email}. Ouvrez-le depuis votre boîte mail pour vous connecter.
        </Text>
      ) : (
        <>
          <TextInput
            style={styles.input}
            placeholder="votre@email.com"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            editable={status !== 'sending'}
          />
          {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
          <Pressable
            style={[styles.button, status === 'sending' && styles.buttonDisabled]}
            onPress={handleSendMagicLink}
            disabled={status === 'sending'}
          >
            {status === 'sending' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Recevoir un lien de connexion</Text>
            )}
          </Pressable>
        </>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#fff' },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 32, textAlign: 'center' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  button: { backgroundColor: '#111827', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  message: { fontSize: 16, textAlign: 'center', color: '#374151' },
  error: { color: '#dc2626', fontSize: 14, marginBottom: 12 },
})
