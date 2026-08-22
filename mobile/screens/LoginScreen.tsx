// Écran de login minimal — magic link uniquement, cohérent avec la
// politique déjà en place côté web (src/app/(auth)/login/actions.ts) :
// shouldCreateUser: false, pas de self-serve en Phase 1, seuls les
// comptes déjà provisionnés peuvent se connecter.
//
// Limite connue, pas résolue ici : un magic link envoyé par email ouvre
// normalement un navigateur, pas directement l'app — rouvrir l'app
// depuis ce lien nécessite un deep link configuré (scheme dans app.json
// + gestion du retour dans le code), volontairement hors périmètre de ce
// premier écran fonctionnel. Pour l'instant, le lien confirme la
// connexion mais l'utilisateur doit revenir manuellement dans l'app.
import { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
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
      options: { shouldCreateUser: false },
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
