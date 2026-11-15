import { db } from '../db/db'
import type { LocalTransaction, SaleItem } from '../types'
import { newId, newReceiptNo } from './id'
import { roundMoney } from './money'

export interface CartLine {
  product_id: string
  quantity: number
}

export class SaleError extends Error {}

// Saves a sale (or a cancelled sale) on this device and queues it for the cloud.
// Everything happens in ONE local transaction: if anything fails, nothing is saved.
export async function recordSale(
  lines: CartLine[],
  status: 'completed' | 'cancelled',
  cashReceived: number,
  cashierId: string | null,
): Promise<LocalTransaction> {
  if (lines.length === 0) throw new SaleError('The cart is empty.')

  const createdAt = new Date().toISOString()
  const id = newId()

  return db.transaction('rw', db.products, db.transactions, db.outbox, async () => {
    const items: SaleItem[] = []

    for (const line of lines) {
      if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
        throw new SaleError('Invalid quantity in the cart.')
      }
      const p = await db.products.get(line.product_id)
      if (!p) throw new SaleError('A product in the cart no longer exists.')

      if (status === 'completed') {
        if (p.is_archived || !p.is_available) {
          throw new SaleError(`${p.name} is not available.`)
        }
        if (line.quantity > p.stock_qty) {
          throw new SaleError(`Not enough stock for ${p.name}. Available: ${p.stock_qty}.`)
        }
      }

      const price = Number(p.price)
      items.push({
        product_id: p.id,
        product_name: p.name,
        sku: p.sku,
        unit_price: price,
        quantity: line.quantity,
        line_total: roundMoney(price * line.quantity),
      })
    }

    const total = roundMoney(items.reduce((sum, i) => sum + i.line_total, 0))

    if (status === 'completed' && cashReceived < total) {
      throw new SaleError('Cash received is less than the total.')
    }

    // Deduct stock locally right away (completed sales only)
    if (status === 'completed') {
      for (const item of items) {
        const p = await db.products.get(item.product_id)
        await db.products.update(item.product_id, { stock_qty: p!.stock_qty - item.quantity })
      }
    }

    const tx: LocalTransaction = {
      id,
      receipt_no: newReceiptNo(),
      cashier_id: cashierId,
      status,
      total_amount: total,
      cash_received: status === 'completed' ? cashReceived : 0,
      change_given: status === 'completed' ? roundMoney(cashReceived - total) : 0,
      created_at: createdAt,
      items,
      sync_status: 'pending',
    }

    await db.transactions.add(tx)
    await db.outbox.add({
      id: newId(),
      type: 'sale',
      payload: tx,
      created_at: createdAt,
      attempts: 0,
    })

    return tx
  })
}