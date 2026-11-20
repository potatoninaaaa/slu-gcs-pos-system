import Dexie, { type EntityTable } from 'dexie'
import type {
    ActivityLog,
    CachedImage,
    Category,
    InventoryMovement,
    KV,
    LocalTransaction,
    OutboxItem,
    Product,
} from '../types'

export const db = new Dexie('gcs-pos') as Dexie & {
  products: EntityTable<Product, 'id'>
  categories: EntityTable<Category, 'id'>
  transactions: EntityTable<LocalTransaction, 'id'>
  movements: EntityTable<InventoryMovement, 'id'>
  logs: EntityTable<ActivityLog, 'id'>
  outbox: EntityTable<OutboxItem, 'id'>
  images: EntityTable<CachedImage, 'path'>
  kv: EntityTable<KV, 'key'>
}

db.version(1).stores({
  products: 'id, sku, name, category_id, is_archived',
  categories: 'id, name',
  transactions: 'id, receipt_no, created_at, status, sync_status, cashier_id',
  movements: 'id, product_id, created_at, transaction_id, sync_status',
  logs: 'id, created_at, action, sync_status',
  outbox: 'id, type, created_at',
  images: 'path',
  kv: 'key',
})

db.version(2)
  .stores({
    products: 'id, sku, name, category_id, is_archived',
    categories: 'id, name',
    transactions: 'id, receipt_no, created_at, status, sync_status, cashier_id',
    movements: 'id, product_id, created_at, transaction_id, sync_status',
    logs: 'id, created_at, action, sync_status',
    outbox: 'id, type, created_at',
    images: 'path',
    kv: 'key',
  })
  .upgrade(async (tx) => {
    await tx
      .table('transactions')
      .toCollection()
      .modify((transaction: Record<string, unknown>) => {
        transaction.payment_method = 'cash'
        transaction.payment_reference = null
      })
  })