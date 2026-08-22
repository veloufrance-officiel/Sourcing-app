import { useRouter } from 'expo-router'
import { MissionsListScreen } from '../screens/MissionsListScreen'

export default function Index() {
  const router = useRouter()
  return <MissionsListScreen onSelectMission={(missionId) => router.push(`/mission/${missionId}`)} />
}
