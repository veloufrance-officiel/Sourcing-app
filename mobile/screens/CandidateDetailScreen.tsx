// Détail candidat — lecture seule, pas le drawer de vérification
// humaine interactif du web (perimetre volontairement plus etroit
// pour ce premier ecran, cohérent avec la même décision déjà prise
// pour MissionDetailScreen : ne pas construire plus gros que ce que
// l'usage actuel justifie).
//
// Vocabulaire exact repris du web (evidence-review-drawer.tsx),
// vérifié précisément avant d'écrire ce fichier, pas inventé : les 4
// statuts EvidenceStatus ont chacun un libellé français fixe, y
// compris "Déduit — non confirmé" pour INFERRED_UNCONFIRMED — jamais
// un signal automatique affiché comme une preuve confirmée.
import { useEffect, useState } from 'react'
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'

type EvidenceStatus = 'VERIFIED' | 'NOT_VERIFIED' | 'CONTRADICTED' | 'INFERRED_UNCONFIRMED'

type CandidateDetail = {
  id: string
  full_name: string
  title: string | null
  location: string | null
  skills: string[] | null
}

type CriterionRow = {
  id: string
  label: string
  weight: number
}

type EvidenceRow = {
  criterion_id: string
  status: EvidenceStatus
}

const STATUS_LABEL: Record<EvidenceStatus, string> = {
  VERIFIED: 'Vérifié',
  CONTRADICTED: 'Contredit',
  NOT_VERIFIED: 'Non vérifié',
  INFERRED_UNCONFIRMED: 'Déduit — non confirmé',
}

export function EvidenceBadge({ status }: { status: EvidenceStatus | null }) {
  const effectiveStatus = status ?? 'NOT_VERIFIED'
  if (effectiveStatus === 'VERIFIED') {
    return (
      <View style={[styles.badge, styles.badgeVerified]}>
        <Text style={styles.badgeTextVerified}>{STATUS_LABEL.VERIFIED}</Text>
      </View>
    )
  }
  if (effectiveStatus === 'CONTRADICTED') {
    return (
      <View style={[styles.badge, styles.badgeContradicted]}>
        <Text style={styles.badgeTextContradicted}>{STATUS_LABEL.CONTRADICTED}</Text>
      </View>
    )
  }
  // NOT_VERIFIED et INFERRED_UNCONFIRMED partagent le même style
  // visuel neutre — même choix déjà fait côté web, cohérent : aucun
  // des deux n'est une preuve, l'un est juste explicitement une
  // inférence non confirmée plutôt qu'une simple absence de preuve.
  return (
    <View style={[styles.badge, styles.badgeNeutral]}>
      <Text style={styles.badgeTextNeutral}>{STATUS_LABEL[effectiveStatus]}</Text>
    </View>
  )
}

export function CandidateDetailScreen({ candidateId, missionId }: { candidateId: string; missionId: string }) {
  const [candidate, setCandidate] = useState<CandidateDetail | null>(null)
  const [criteria, setCriteria] = useState<CriterionRow[]>([])
  const [evidenceByCriterion, setEvidenceByCriterion] = useState<Map<string, EvidenceStatus>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      const { data: candidateData, error: candidateError } = await supabase
        .from('candidates')
        .select('id, full_name, title, location, skills')
        .eq('id', candidateId)
        .returns<CandidateDetail[]>()
        .single()

      if (cancelled) return
      if (candidateError) {
        setError(candidateError.message)
        setLoading(false)
        return
      }
      setCandidate(candidateData)

      const { data: criteriaData, error: criteriaError } = await supabase
        .from('brief_criteria')
        .select('id, label, weight')
        .eq('mission_id', missionId)
        .order('weight', { ascending: false })

      if (cancelled) return
      if (criteriaError) {
        setError(criteriaError.message)
        setLoading(false)
        return
      }
      setCriteria(criteriaData ?? [])

      // superseded_by is null — même filtre que celui qu'applique
      // internal.recalculate_eligibility côté DB (confirmé précisément
      // dans le commentaire du web avant d'écrire ce fichier), pour
      // que ce que cet écran affiche corresponde exactement à ce qui a
      // déterminé eligibility_status, pas une ligne historique remplacée.
      const { data: evidenceData, error: evidenceError } = await supabase
        .from('evidence')
        .select('criterion_id, status')
        .eq('candidate_id', candidateId)
        .is('superseded_by', null)
        .returns<EvidenceRow[]>()

      if (cancelled) return
      if (evidenceError) {
        setError(evidenceError.message)
      } else {
        const map = new Map<string, EvidenceStatus>()
        for (const row of evidenceData ?? []) {
          map.set(row.criterion_id, row.status)
        }
        setEvidenceByCriterion(map)
      }
      setLoading(false)
    }

    load()
    return () => {
      cancelled = true
    }
  }, [candidateId, missionId])

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    )
  }

  if (error || !candidate) {
    return (
      <View style={styles.centered}>
        <Text style={styles.error}>{error ?? 'Candidat introuvable.'}</Text>
      </View>
    )
  }

  return (
    <FlatList
      style={styles.list}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.name}>{candidate.full_name}</Text>
          {candidate.title ? <Text style={styles.title}>{candidate.title}</Text> : null}
          {candidate.location ? <Text style={styles.location}>{candidate.location}</Text> : null}
          {candidate.skills && candidate.skills.length > 0 ? (
            <View style={styles.skillsRow}>
              {candidate.skills.map((skill) => (
                <View key={skill} style={styles.skillChip}>
                  <Text style={styles.skillText}>{skill}</Text>
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.sectionLabel}>Critères de la mission</Text>
        </View>
      }
      data={criteria}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.criterionCard}>
          <View style={styles.criterionInfo}>
            <Text style={styles.criterionLabel}>{item.label}</Text>
            {item.weight === 3 ? <Text style={styles.mandatoryTag}>Obligatoire</Text> : null}
          </View>
          <EvidenceBadge status={evidenceByCriterion.get(item.id) ?? null} />
        </View>
      )}
      ListEmptyComponent={
        <View style={styles.centered}>
          <Text style={styles.empty}>Aucun critère défini pour cette mission.</Text>
        </View>
      }
    />
  )
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  name: { fontSize: 20, fontWeight: '700', marginBottom: 4 },
  title: { fontSize: 14, color: '#374151', marginBottom: 2 },
  location: { fontSize: 13, color: '#6b7280', marginBottom: 10 },
  skillsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
  skillChip: { backgroundColor: '#f3f4f6', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  skillText: { fontSize: 12, color: '#374151' },
  sectionLabel: { fontSize: 13, fontWeight: '600', color: '#374151' },
  criterionCard: {
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
  criterionInfo: { flex: 1, marginRight: 12 },
  criterionLabel: { fontSize: 14, fontWeight: '500' },
  mandatoryTag: { fontSize: 11, color: '#dc2626', marginTop: 2, fontWeight: '600' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeVerified: { backgroundColor: '#dcfce7' },
  badgeTextVerified: { fontSize: 11, fontWeight: '700', color: '#166534' },
  badgeContradicted: { backgroundColor: '#fee2e2' },
  badgeTextContradicted: { fontSize: 11, fontWeight: '700', color: '#991b1b' },
  badgeNeutral: { backgroundColor: '#e5e7eb' },
  badgeTextNeutral: { fontSize: 11, fontWeight: '700', color: '#374151' },
  error: { color: '#dc2626', fontSize: 14, textAlign: 'center' },
  empty: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
})
