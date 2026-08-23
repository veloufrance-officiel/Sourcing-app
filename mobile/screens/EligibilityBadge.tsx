// Extrait de MissionDetailScreen.tsx — composant de présentation pur,
// délibérément séparé du fichier qui importe lib/supabase.ts. Un
// composant purement visuel ne doit jamais dépendre transitivement
// d'un client réseau : le test unitaire de ce badge a révélé que
// l'import déclenchait la vraie initialisation Supabase (AsyncStorage,
// auto-refresh de session), jamais voulu pour tester juste le rendu
// visuel d'un statut.
import { View, Text, StyleSheet } from 'react-native'

export type EligibilityStatus = 'ELIGIBLE' | 'NOT_QUALIFIED' | 'INELIGIBLE'

export function EligibilityBadge({ status }: { status: EligibilityStatus }) {
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

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeEligible: { backgroundColor: '#dcfce7' },
  badgeTextEligible: { fontSize: 11, fontWeight: '700', color: '#166534', textTransform: 'uppercase' },
  badgeAmber: { backgroundColor: '#fef3c7' },
  badgeTextAmber: { fontSize: 11, fontWeight: '700', color: '#92400e', textTransform: 'uppercase' },
  badgeNeutral: { backgroundColor: '#e5e7eb' },
  badgeTextNeutral: { fontSize: 11, fontWeight: '700', color: '#374151', textTransform: 'uppercase' },
})
