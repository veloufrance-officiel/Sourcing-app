import { createClient } from '@/lib/supabase/server'
import { MissionForm } from './mission-form'

export default async function NewMissionPage() {
  const supabase = await createClient()
  const { data: clients } = await supabase.from('clients').select('id, name').order('name')

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Nouvelle mission</h1>
      <MissionForm clients={clients ?? []} />
    </div>
  )
}
