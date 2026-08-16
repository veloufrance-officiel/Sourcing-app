import { createClient } from '@/lib/supabase/server'
import { ApiKeyForm } from './api-key-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: hasKey } = await supabase.rpc('has_tenant_anthropic_key')

  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Réglages</h1>
      <div className="mt-6">
        <ApiKeyForm hasKey={Boolean(hasKey)} />
      </div>
    </div>
  )
}
