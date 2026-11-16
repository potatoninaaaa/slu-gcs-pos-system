import { db } from '../db/db'
import { supabase } from './supabase'

export interface Backup {
  format: 'gcs-pos-backup'
  version: 1
  exported_at: string
  categories: unknown[]
  products: unknown[]
  transactions: unknown[]
  movements: unknown[]
  logs: unknown[]
  settings: { key: string; value: unknown }[]
}

export async function buildBackup(): Promise<Backup> {
  const [categories, products, transactions, movements, logs, settingsRow] = await Promise.all([
    db.categories.toArray(),
    db.products.toArray(),
    db.transactions.toArray(),
    db.movements.toArray(),
    db.logs.toArray(),
    db.kv.get('settings'),
  ])
  const settings = Object.entries((settingsRow?.value as Record<string, unknown>) ?? {}).map(
    ([key, value]) => ({ key, value }),
  )
  return {
    format: 'gcs-pos-backup',
    version: 1,
    exported_at: new Date().toISOString(),
    categories,
    products,
    transactions: transactions.map(({ sync_status: _s, sync_error: _e, ...t }) => {
      void _s
      void _e
      return t
    }),
    movements: movements.map(({ sync_status: _s, ...m }) => {
      void _s
      return m
    }),
    logs: logs.map(({ sync_status: _s, ...l }) => {
      void _s
      return l
    }),
    settings,
  }
}

export function parseBackup(text: string): Backup {
  let obj: unknown
  try {
    obj = JSON.parse(text)
  } catch {
    throw new Error('That file is not valid JSON.')
  }
  const b = obj as Partial<Backup> | null
  if (!b || b.format !== 'gcs-pos-backup' || b.version !== 1) {
    throw new Error('This is not a GCS POS backup file.')
  }
  for (const k of ['categories', 'products', 'transactions', 'movements', 'logs', 'settings'] as const) {
    if (!Array.isArray(b[k])) throw new Error(`The backup is missing "${k}".`)
  }
  return b as Backup
}

export async function restoreBackup(b: Backup): Promise<Record<string, number>> {
  const { data, error } = await supabase.rpc('restore_backup', { p_data: b })
  if (error) throw error
  return data as Record<string, number>
}

export function downloadJson(filename: string, obj: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}