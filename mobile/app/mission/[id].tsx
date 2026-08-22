import { useLocalSearchParams } from 'expo-router'
import { MissionDetailScreen } from '../../screens/MissionDetailScreen'

export default function MissionDetail() {
  const { id } = useLocalSearchParams<{ id: string }>()
  return <MissionDetailScreen missionId={id} />
}
