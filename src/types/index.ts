export type Role = 'admin' | 'cashier'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: Role
  active: boolean
}

export interface Category {
  id: string
  name: string
  is_archived: boolean
  created_at: string
  updated_at: string
}

export interface Product {
  id: string
  sku: string
  name: string
  description: string | null
  category_id: string | null
  price: number
  stock_qty: number
  low_stock_threshold: number
  is_available: boolean
  is_archived: boolean
  image_path: string | null
  created_at: string
  updated_at: string
}

export interface SaleItem {
  product_id: string
  product_name: string
  sku: string
  unit_price: number
  quantity: number
  line_total: number
}

export type SyncStatus = 'pending' | 'synced' | 'error'

export interface LocalTransaction {
  id: string
  receipt_no: string
  cashier_id: string | null
  status: 'completed' | 'cancelled'
  total_amount: number
  cash_received: number
  change_given: number
  created_at: string
  items: SaleItem[]
  sync_status: SyncStatus
  sync_error?: string
}

export interface InventoryMovement {
  id: string
  product_id: string
  movement_type: 'initial' | 'sale' | 'restock' | 'deduction' | 'adjustment'
  quantity_change: number
  stock_before: number
  stock_after: number
  reason: string | null
  transaction_id: string | null
  created_by: string | null
  created_at: string
  sync_status: SyncStatus
}

export interface ActivityLog {
  id: string
  user_id: string | null
  action: string
  entity_type: string | null
  entity_id: string | null
  details: Record<string, unknown>
  created_at: string
  sync_status: SyncStatus
}

export type OutboxType =
  | 'sale'
  | 'stock_adjust'
  | 'product_upsert'
  | 'product_delete'
  | 'category_upsert'
  | 'activity_log'

export interface OutboxItem {
  id: string
  type: OutboxType
  payload: unknown
  created_at: string
  attempts: number
  last_error?: string
}

export interface CachedImage {
  path: string
  blob: Blob
  cached_at: string
}

export interface KV {
  key: string
  value: unknown
}