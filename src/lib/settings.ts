import { db } from '../db/db'
import { logActivity } from './activity'
import { supabase } from './supabase'

// Saves one settings group to the cloud, then updates this device's copy.
export async function saveSetting(key: string, value: unknown, userId: string): Promise<void> {
  const { error } = await supabase.from('app_settings').upsert({ key, value }, { onConflict: 'key' })
  if (error) throw error
  const row = await db.kv.get('settings')
  const current = (row?.value as Record<string, unknown> | undefined) ?? {}
  await db.kv.put({ key: 'settings', value: { ...current, [key]: value } })
  await logActivity(userId, 'settings_updated', 'setting', key, { value })
}