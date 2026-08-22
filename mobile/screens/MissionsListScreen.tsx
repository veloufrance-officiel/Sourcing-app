// Liste des missions — même requête Supabase, mêmes champs, même type
// que src/app/(dashboard)/missions/page.tsx côté web (vérifié avant
// d'écrire ce fichier, pas supposé identique). Le moteur PostgREST
// sous-jacent est le même des deux côtés (client web via @supabase/ssr,
// client mobile via @supabase/supabase-js), donc la syntaxe de requête
// avec relations imbriquées (clients(name), mission_candidates(count))
// fonctionne identiquement.
import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { supabase } from '../lib/supabase'

type MissionListEntry = {
  id: string
  title: string
  location: string | null
  contract_type: string | null
  daily_rate: number | null
  status: string
  source: string
  clients: { name: string } | null
  mission_candidates: { count: number }[]
}

export function MissionsListScreen({ onSelectMission }: { onSelectMission: (missionId: string) => void }) {
  const [missions, setMissions] = useState<MissionListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadMissions() {
      const { data, error: fetchError } = await supabase
        .from('missions')
        .select('id, title, location, contract_type, daily_rate, status, source, clients(name), mission_candidates(count)')
        .order('created_at', { ascending: false })
        .returns<MissionListEntry[]>()

      if (cancelled) return

      if (fetchError) {
        setError(fetchError.message)
      } else {
        setMissions(data ?? [])
      }
      setLoading(false)
    }

    loadMissions()
    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error}</Text>
      </View>
    )
  }

  if (missions.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.empty}>Aucune mission pour l&apos;instant.</Text>
      </View>
    )
  }

  return (
    <FlatList
      style={styles.list}
      data={missions}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => {
        const candidateCount = item.mission_candidates[0]?.count ?? 0
        return (
          <Pressable style={styles.card} onPress={() => onSelectMission(item.id)}>
            <Text style={styles.title}>{item.title}</Text>
            <View style={styles.metaRow}>
              {item.clients?.name ? <Text style={styles.meta}>{item.clients.name}</Text> : null}
              {item.location ? <Text style={styles.meta}>{item.location}</Text> : null}
              {item.daily_rate ? <Text style={styles.meta}>{item.daily_rate} €/j</Text> : null}
            </View>
            <Text style={styles.count}>
              {candidateCount} candidat{candidateCount > 1 ? 's' : ''}
            </Text>
          </Pressable>
        )
      }}
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  title: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  metaRow: { flexDirection: 'row', gap: 8, marginBottom: 6, flexWrap: 'wrap' },
  meta: { fontSize: 13, color: '#6b7280' },
  count: { fontSize: 13, color: '#111827', fontWeight: '500' },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  empty: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
})
