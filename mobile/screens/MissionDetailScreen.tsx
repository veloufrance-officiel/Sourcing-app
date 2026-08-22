// Détail mission — même requêtes et vocabulaire que le web (vérifié
// précisément, pas deviné) : eligibility-badge.tsx pour les libellés
// exacts "À vérifier"/"Non éligible", jamais un score inventé pour ces
// deux statuts. Le score de matching (ELIGIBLE uniquement) n'est
// volontairement pas implémenté ici — nécessiterait de porter tout le
// moteur matching.ts côté mobile, une extension d'architecture
// prématurée pour ce premier écran, cohérent avec le principe déjà
// retenu tout au long de ce projet.
import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'

type MissionDetail = {
  id: string
  title: string
  location: string | null
  contract_type: string | null
  daily_rate: number | null
  clients: { name: string } | null
}

type EligibilityStatus = 'ELIGIBLE' | 'NOT_QUALIFIED' | 'INELIGIBLE'

type MissionCandidateEntry = {
  id: string
  eligibility_status: EligibilityStatus
  candidates: {
    id: string
    full_name: string
    title: string | null
    location: string | null
  } | null
}

function EligibilityBadge({ status }: { status: EligibilityStatus }) {
  if (status === 'ELIGIBLE') {
    return (
      <View style={[styles.badge, styles.badgeEligible]}>
        <Text style={styles.badgeTextEligible}>Éligible</Text>
      </View>
    )
  }
  if (status === 'NOT_QUALIFIED') {
    return (
      <View style={[styles.badge, styles.badgeAmber]}>
        <Text style={styles.badgeTextAmber}>À vérifier</Text>
      </View>
    )
  }
  return (
    <View style={[styles.badge, styles.badgeNeutral]}>
      <Text style={styles.badgeTextNeutral}>Non éligible</Text>
    </View>
  )
}

export function MissionDetailScreen({ missionId }: { missionId: string }) {
  const [mission, setMission] = useState<MissionDetail | null>(null)
  const [entries, setEntries] = useState<MissionCandidateEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: missionData, error: missionError } = await supabase
        .from('missions')
        .select('id, title, location, contract_type, daily_rate, clients(name)')
        .eq('id', missionId)
        .returns<MissionDetail[]>()
        .single()

      if (cancelled) return

      if (missionError) {
        setError(missionError.message)
        setLoading(false)
        return
      }
      setMission(missionData)

      const { data: candidatesData, error: candidatesError } = await supabase
        .from('mission_candidates')
        .select('id, eligibility_status, candidates(id, full_name, title, location)')
        .eq('mission_id', missionId)
        .returns<MissionCandidateEntry[]>()

      if (cancelled) return

      if (candidatesError) {
        setError(candidatesError.message)
      } else {
        setEntries(candidatesData ?? [])
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [missionId])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  if (error || !mission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? 'Mission introuvable.'}</Text>
      </View>
    )
  }

  return (
    <FlatList
      style={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.title}>{mission.title}</Text>
          <View style={styles.metaRow}>
            {mission.clients?.name ? <Text style={styles.meta}>{mission.clients.name}</Text> : null}
            {mission.location ? <Text style={styles.meta}>{mission.location}</Text> : null}
            {mission.daily_rate ? <Text style={styles.meta}>{mission.daily_rate} €/j</Text> : null}
            {mission.contract_type ? <Text style={styles.meta}>{mission.contract_type}</Text> : null}
          </View>
          <Text style={styles.sectionLabel}>
            {entries.length} candidat{entries.length > 1 ? 's' : ''}
          </Text>
        </View>
      }
      data={entries}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.candidateCard}>
          <View style={styles.candidateInfo}>
            <Text style={styles.candidateName}>{item.candidates?.full_name ?? 'Candidat'}</Text>
            {item.candidates?.title ? <Text style={styles.candidateTitle}>{item.candidates.title}</Text> : null}
          </View>
          <EligibilityBadge status={item.eligibility_status} />
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.empty}>Aucun candidat pour cette mission.</Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  metaRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: 12 },
  meta: { fontSize: 13, color: '#6b7280' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  candidateCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginVertical: 4,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  candidateInfo: { flex: 1, marginRight: 12 },
  candidateName: { fontSize: 15, fontWeight: '600' },
  candidateTitle: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeEligible: { backgroundColor: '#dcfce7' },
  badgeTextEligible: { fontSize: 11, fontWeight: '700', color: '#166534', textTransform: 'uppercase' },
  badgeAmber: { backgroundColor: '#fef3c7' },
  badgeTextAmber: { fontSize: 11, fontWeight: '700', color: '#92400e', textTransform: 'uppercase' },
  badgeNeutral: { backgroundColor: '#e5e7eb' },
  badgeTextNeutral: { fontSize: 11, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  empty: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
})
