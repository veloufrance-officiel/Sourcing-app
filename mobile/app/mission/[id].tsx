import { useLocalSearchParams, useRouter } from 'expo-router'
import { MissionDetailScreen } from '../../screens/MissionDetailScreen'

export default function MissionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  return (
    <MissionDetailScreen
      missionId={id}
      onSelectCandidate={(candidateId) => router.push(`/candidate/${candidateId}?missionId=${id}`)}
    />
  )
}
