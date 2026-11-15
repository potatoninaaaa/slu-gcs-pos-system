import { db } from '../db/db'
import type { Product } from '../types'
import { newId } from './id'

export class InventoryError extends Error {}

// Saves a product row from the server but keeps this device's stock number,
// because it may include sales that have not synced yet.
export async function putProductKeepingStock(row: Product): Promise<void> {
  const local = await db.products.get(row.id)
  await db.products.put(local ? { ...row, stock_qty: local.stock_qty } : row)
}

interface AdjustArgs {
  productId: string
  mode: 'add' | 'deduct' | 'set'
  quantity: number
  reason: string
  userId: string
}

// Works offline: updates local stock now, queues the change for the cloud.
export async function adjustStockLocal(a: AdjustArgs): Promise<void> {
  const reason = a.reason.trim()
  if (!reason) throw new InventoryError('A reason is required.')
  if (!Number.isInteger(a.quantity) || a.quantity < 0) {
    throw new InventoryError('Quantity must be a whole number.')
  }
  if (a.mode !== 'set' && a.quantity === 0) {
    throw new InventoryError('Quantity must be more than 0.')
  }

  const movementId = newId()
  const createdAt = new Date().toISOString()

  await db.transaction('rw', db.products, db.movements, db.outbox, async () => {
    const p = await db.products.get(a.productId)
    if (!p) throw new InventoryError('Product not found.')

    const before = p.stock_qty
    const after =
      a.mode === 'add' ? before + a.quantity : a.mode === 'deduct' ? before - a.quantity : a.quantity
    if (after < 0) throw new InventoryError('Cannot deduct more than the current stock.')

    const type = a.mode === 'add' ? 'restock' : a.mode === 'deduct' ? 'deduction' : 'adjustment'

    await db.products.update(p.id, { stock_qty: after })
    await db.movements.add({
      id: movementId,
      product_id: p.id,
      movement_type: type,
      quantity_change: after - before,
      stock_before: before,
      stock_after: after,
      reason,
      transaction_id: null,
      created_by: a.userId,
      created_at: createdAt,
      sync_status: 'pending',
    })
    await db.outbox.add({
      id: newId(),
      type: 'stock_adjust',
      payload: {
        movement_id: movementId,
        product_id: p.id,
        mode: a.mode,
        quantity: a.quantity,
        reason,
        created_at: createdAt,
      },
      created_at: createdAt,
      attempts: 0,
    })
  })
}