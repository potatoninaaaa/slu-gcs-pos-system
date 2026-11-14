import { db } from '../db/db'
import { supabase } from '../lib/supabase'
import type { LocalTransaction, OutboxItem } from '../types'
import { cacheProductImages } from './images'

export interface SyncState {
  running: boolean
  lastSyncAt: string | null
  lastError: string | null
}

let state: SyncState = { running: false, lastSyncAt: null, lastError: null }
const listeners = new Set<(s: SyncState) => void>()
const emit = () => listeners.forEach((l) => l(state))
function setState(patch: Partial<SyncState>) {
  state = { ...state, ...patch }
  emit()
}

export const getSyncState = () => state
export function subscribeSync(fn: (s: SyncState) => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

// ---------- Pull: server -> local ----------
async function pullAll() {
  const [cats, prods] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase.from('products').select('*'),
  ])
  if (cats.error) throw cats.error
  if (prods.error) throw prods.error

  // Never overwrite a product whose stock is being changed by an unsent sale
  const pendingSales = await db.outbox.where('type').equals('sale').toArray()
  const pendingAdjust = await db.outbox.where('type').equals('stock_adjust').toArray()
  const hasPendingStock = pendingSales.length + pendingAdjust.length > 0

  await db.transaction('rw', db.categories, db.products, async () => {
    await db.categories.clear()
    await db.categories.bulkPut(cats.data)

    if (!hasPendingStock) {
      await db.products.clear()
      await db.products.bulkPut(prods.data)
    } else {
      // Keep local stock numbers (they include unsent sales); refresh everything else
      const local = new Map((await db.products.toArray()).map((p) => [p.id, p]))
      const merged = prods.data.map((p) => {
        const l = local.get(p.id)
        return l ? { ...p, stock_qty: l.stock_qty } : p
      })
      await db.products.clear()
      await db.products.bulkPut(merged)
    }
  })

  await cacheProductImages()
  await db.kv.put({ key: 'last_pull', value: new Date().toISOString() })
}

// ---------- Push: local -> server ----------
async function pushItem(item: OutboxItem): Promise<void> {
  switch (item.type) {
    case 'sale': {
      const t = item.payload as LocalTransaction
      const { data, error } = await supabase.rpc('process_sale', {
        p_id: t.id,
        p_receipt_no: t.receipt_no,
        p_created_at: t.created_at,
        p_status: t.status,
        p_cash_received: t.cash_received,
        p_items: t.items.map((i) => ({
          product_id: i.product_id,
          unit_price: i.unit_price,
          quantity: i.quantity,
        })),
      })
      if (error) throw error
      // 'created' and 'duplicate' both mean the server has this sale
      void data
      await db.transactions.update(t.id, { sync_status: 'synced', sync_error: undefined })
      return
    }
    case 'stock_adjust': {
      const p = item.payload as {
        movement_id: string
        product_id: string
        mode: 'add' | 'deduct' | 'set'
        quantity: number
        reason: string
        created_at: string
      }
      const { error } = await supabase.rpc('adjust_stock', {
        p_movement_id: p.movement_id,
        p_product_id: p.product_id,
        p_mode: p.mode,
        p_quantity: p.quantity,
        p_reason: p.reason,
        p_created_at: p.created_at,
      })
      if (error) throw error
      await db.movements.update(p.movement_id, { sync_status: 'synced' })
      return
    }
    case 'product_upsert': {
      const p = item.payload as Record<string, unknown>
      const { stock_qty: _ignored, ...rest } = p
      void _ignored
      const { error } = await supabase.from('products').upsert(rest, { onConflict: 'id' })
      if (error) throw error
      return
    }
    case 'product_delete': {
      const { id } = item.payload as { id: string }
      const { error } = await supabase.from('products').delete().eq('id', id)
      if (error) throw error
      return
    }
    case 'category_upsert': {
      const { error } = await supabase
        .from('categories')
        .upsert(item.payload as Record<string, unknown>, { onConflict: 'id' })
      if (error) throw error
      return
    }
    case 'activity_log': {
      const l = item.payload as { id: string }
      const { error } = await supabase
        .from('activity_logs')
        .upsert(item.payload as Record<string, unknown>, { onConflict: 'id' })
      if (error) throw error
      await db.logs.update(l.id, { sync_status: 'synced' })
      return
    }
  }
}

function isNetworkError(err: unknown): boolean {
  const msg = String((err as { message?: string })?.message ?? err).toLowerCase()
  return (
    !navigator.onLine ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed')
  )
}

async function pushAll() {
  // Oldest first, so stock changes replay in the order they happened
  const items = await db.outbox.orderBy('created_at').toArray()
  for (const item of items) {
    try {
      await pushItem(item)
      await db.outbox.delete(item.id)
    } catch (err) {
      if (isNetworkError(err)) throw err // connection dropped: stop and retry later
      // Server rejected this item. Keep it (never discard a sale) and move on.
      const message = String((err as { message?: string })?.message ?? err)
      await db.outbox.update(item.id, {
        attempts: item.attempts + 1,
        last_error: message,
      })
      if (item.type === 'sale') {
        const t = item.payload as LocalTransaction
        await db.transactions.update(t.id, { sync_status: 'error', sync_error: message })
      }
    }
  }
}

// ---------- Orchestration ----------
export async function syncNow(): Promise<void> {
  if (state.running || !navigator.onLine) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return

  setState({ running: true, lastError: null })
  try {
    await pushAll()
    await pullAll()
    setState({ lastSyncAt: new Date().toISOString() })
  } catch (err) {
    setState({ lastError: String((err as { message?: string })?.message ?? err) })
  } finally {
    setState({ running: false })
  }
}

let started = false
export function startSync() {
  if (started) return
  started = true
  window.addEventListener('online', () => void syncNow())
  setInterval(() => void syncNow(), 30_000)
  void syncNow()
}

export async function pendingCount(): Promise<number> {
  return db.outbox.count()
}