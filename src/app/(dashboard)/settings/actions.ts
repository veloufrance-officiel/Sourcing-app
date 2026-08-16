'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { logServerError } from '@/lib/log'

export type ApiKeyState = { error?: string; success?: boolean }

export async function setAnthropicKey(
  _prevState: ApiKeyState,
  formData: FormData
): Promise<ApiKeyState> {
  const key = String(formData.get('api_key') ?? '').trim()
  if (!key) return { error: 'La clé ne peut pas être vide.' }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: 'Session expirée.' }

  const { error } = await supabase.rpc('set_tenant_anthropic_key', { p_key: key })

  if (error) {
    logServerError('settings.setAnthropicKey', error, {})
    return { error: error.message.includes('owner/admin') ? error.message : 'Impossible d\u2019enregistrer la clé.' }
  }

  revalidatePath('/settings')
  return { success: true }
}

export async function removeAnthropicKey(): Promise<void> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return

  const { error } = await supabase.rpc('remove_tenant_anthropic_key')
  if (error) logServerError('settings.removeAnthropicKey', error, {})

  revalidatePath('/settings')
}
