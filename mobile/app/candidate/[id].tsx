import { useLocalSearchParams } from 'expo-router'
import { CandidateDetailScreen } from '../../screens/CandidateDetailScreen'

export default function CandidateDetail() {
  const { id, missionId } = useLocalSearchParams<{ id: string; missionId: string }>()
  return <CandidateDetailScreen candidateId={id} missionId={missionId} />
}
