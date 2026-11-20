import { db } from '../db/db'
import { logActivity } from '../lib/activity'
import { supabase } from '../lib/supabase'
import type {
  ActivityLog,
  InventoryMovement,
  LocalTransaction,
  OutboxItem,
  PaymentMethod,
  SaleItem,
} from '../types'
import { cacheBrandingImages, cacheProductImages } from './images'

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

let currentUserId = ''
let lastHistoryPull = 0
const HISTORY_EVERY_MS = 120_000

interface TxRow {
  id: string
  receipt_no: string
  cashier_id: string | null
  status: 'completed' | 'cancelled'
  total_amount: number | string
  payment_method: PaymentMethod
  payment_reference: string | null
  cash_received: number | string
  change_given: number | string
  created_at: string
}
interface ItemRow {
  transaction_id: string
  product_id: string
  product_name: string
  sku: string
  unit_price: number | string
  quantity: number
  line_total: number | string
}

async function fetchAll<T>(table: string): Promise<T[]> {
  const out: T[] = []
  const size = 1000
  for (let from = 0; ; from += size) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .order('id')
      .range(from, from + size - 1)
    if (error) throw error
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < size) break
  }
  return out
}

// ---------- Pull: server -> local ----------
async function pullHistory() {
  const [txs, items, moves, logs] = await Promise.all([
    fetchAll<TxRow>('transactions'),
    fetchAll<ItemRow>('transaction_items'),
    fetchAll<Omit<InventoryMovement, 'sync_status'>>('inventory_movements'),
    fetchAll<Omit<ActivityLog, 'sync_status'>>('activity_logs'),
  ])

  const itemsByTx = new Map<string, SaleItem[]>()
  for (const i of items) {
    const list = itemsByTx.get(i.transaction_id) ?? []
    list.push({
      product_id: i.product_id,
      product_name: i.product_name,
      sku: i.sku,
      unit_price: Number(i.unit_price),
      quantity: i.quantity,
      line_total: Number(i.line_total),
    })
    itemsByTx.set(i.transaction_id, list)
  }

  await db.transaction('rw', db.transactions, db.movements, db.logs, async () => {
    // Never overwrite something on this device that has not reached the server yet
    const localTx = new Map((await db.transactions.toArray()).map((t) => [t.id, t]))
    const txRows: LocalTransaction[] = []
    for (const t of txs) {
      const l = localTx.get(t.id)
      if (l && l.sync_status !== 'synced') continue
      txRows.push({
        id: t.id,
        receipt_no: t.receipt_no,
        cashier_id: t.cashier_id,
        status: t.status,
        total_amount: Number(t.total_amount),
        payment_method: t.payment_method,
        payment_reference: t.payment_reference,
        cash_received: Number(t.cash_received),
        change_given: Number(t.change_given),
        created_at: t.created_at,
        items: itemsByTx.get(t.id) ?? [],
        sync_status: 'synced',
      })
    }
    await db.transactions.bulkPut(txRows)

    const localMoves = new Map((await db.movements.toArray()).map((m) => [m.id, m]))
    await db.movements.bulkPut(
      moves
        .filter((m) => localMoves.get(m.id)?.sync_status !== 'pending')
        .map((m) => ({ ...m, sync_status: 'synced' as const })),
    )

    const localLogs = new Map((await db.logs.toArray()).map((l) => [l.id, l]))
    await db.logs.bulkPut(
      logs
        .filter((l) => localLogs.get(l.id)?.sync_status !== 'pending')
        .map((l) => ({ ...l, sync_status: 'synced' as const })),
    )
  })
  lastHistoryPull = Date.now()
}

async function pullAll(includeHistory: boolean) {
  const [cats, prods] = await Promise.all([
    supabase.from('categories').select('*'),
    supabase.from('products').select('*'),
  ])
  if (cats.error) throw cats.error
  if (prods.error) throw prods.error

  // Never overwrite a product whose stock is being changed by an unsent sale or adjustment
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
      const local = new Map((await db.products.toArray()).map((p) => [p.id, p]))
      const merged = prods.data.map((p) => {
        const l = local.get(p.id)
        return l ? { ...p, stock_qty: l.stock_qty } : p
      })
      await db.products.clear()
      await db.products.bulkPut(merged)
    }
  })

  const prof = await supabase.from('profiles').select('id, email, full_name, role')
  if (!prof.error) await db.kv.put({ key: 'profiles', value: prof.data })

  const st = await supabase.from('app_settings').select('key, value')
  if (!st.error) {
    await db.kv.put({
      key: 'settings',
      value: Object.fromEntries(st.data.map((r) => [r.key, r.value])),
    })
  }

  await cacheProductImages()
  await cacheBrandingImages()
  if (includeHistory) await pullHistory()
  await db.kv.put({ key: 'last_pull', value: new Date().toISOString() })
}

// ---------- Push: local -> server ----------
async function pushItem(item: OutboxItem): Promise<void> {
  switch (item.type) {
    case 'sale': {
      const t = item.payload as LocalTransaction
      const { error } = await supabase.rpc('process_sale', {
        p_id: t.id,
        p_receipt_no: t.receipt_no,
        p_created_at: t.created_at,
        p_status: t.status,
        p_payment_method: t.payment_method,
        p_payment_reference: t.payment_reference,
        p_cash_received: t.cash_received,
        p_items: t.items.map((i) => ({
          product_id: i.product_id,
          unit_price: i.unit_price,
          quantity: i.quantity,
        })),
      })
      if (error) throw error
      // 'created' and 'duplicate' both mean the server has this sale
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
        .insert(item.payload as Record<string, unknown>)
      if (error) {
        if (error.code === '23505') {
          // already on the server
        } else if (error.code === '42501') {
          // belongs to a different signed-in user; cannot be uploaded from this session
          await db.logs.update(l.id, { sync_status: 'error' })
          return
        } else {
          throw error
        }
      }
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

// Returns how many sales/stock changes were uploaded
async function pushAll(): Promise<number> {
  // Oldest first, so stock changes replay in the order they happened
  const items = await db.outbox.orderBy('created_at').toArray()
  let pushed = 0
  for (const item of items) {
    try {
      await pushItem(item)
      await db.outbox.delete(item.id)
      if (item.type !== 'activity_log') pushed += 1
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
  return pushed
}

// ---------- Orchestration ----------
export async function syncNow(forceHistory = false): Promise<void> {
  if (state.running || !navigator.onLine) return
  const { data } = await supabase.auth.getSession()
  if (!data.session) return
  currentUserId = data.session.user.id

  setState({ running: true, lastError: null })
  try {
    const pushed = await pushAll()
    if (pushed > 0) {
      await logActivity(currentUserId, 'sync_completed', 'sync', null, { uploaded: pushed })
    }
    const includeHistory =
      forceHistory || pushed > 0 || Date.now() - lastHistoryPull > HISTORY_EVERY_MS
    await pullAll(includeHistory)
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