import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { useOnline } from '../../hooks/useOnline'
import { useSync } from '../../hooks/useSync'
import { formatDateTime } from '../../lib/format'
import { syncNow } from '../../sync/engine'
import type { OutboxItem } from '../../types'

const typeLabel: Record<string, string> = {
  sale: 'Sale',
  stock_adjust: 'Stock adjustment',
  product_upsert: 'Product change',
  product_delete: 'Product deletion',
  category_upsert: 'Category change',
  activity_log: 'Activity log',
}

export default function SyncSection() {
  const online = useOnline()
  const { running, lastSyncAt, lastError, pending } = useSync()
  const counts = useLiveQuery(
    async () => ({
      pending: await db.transactions.where('sync_status').equals('pending').count(),
      synced: await db.transactions.where('sync_status').equals('synced').count(),
      error: await db.transactions.where('sync_status').equals('error').count(),
    }),
    [],
    { pending: 0, synced: 0, error: 0 },
  )
  const failed = useLiveQuery(
    () => db.outbox.filter((o) => (o.attempts ?? 0) > 0).toArray(),
    [],
    [] as OutboxItem[],
  )

  // Only stock adjustments may be discarded. Sales are never discarded.
  const discard = async (o: OutboxItem) => {
    if (o.type !== 'stock_adjust') return
    if (!window.confirm('Discard this stock adjustment? It will not be applied to the cloud.')) return
    const p = o.payload as { movement_id: string }
    await db.transaction('rw', db.outbox, db.movements, async () => {
      await db.outbox.delete(o.id)
      await db.movements.delete(p.movement_id)
    })
    void syncNow()
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold text-gold">Synchronization status</h2>
        <div className="grid gap-1 text-sm text-slate-300">
          <p>Network: {online ? 'Online' : 'Offline'}</p>
          <p>State: {running ? 'Syncing...' : 'Idle'}</p>
          <p>Last sync: {lastSyncAt ? formatDateTime(lastSyncAt) : 'not yet this session'}</p>
          <p>Waiting to upload: {pending}</p>
          <p>
            Sales on this device: {counts.synced} synced, {counts.pending} saved locally, {counts.error} with errors
          </p>
          {lastError && <p className="text-red-300">Last error: {lastError}</p>}
        </div>
        <button
          onClick={() => void syncNow(true)}
          disabled={!online || running}
          className="mt-3 rounded-lg bg-gold px-4 py-2 font-bold text-slate-deep disabled:opacity-50"
        >
          Sync now
        </button>
      </div>

      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-2 font-semibold text-gold">Items needing attention</h2>
        {failed.length === 0 ? (
          <p className="text-sm text-slate-400">Nothing is stuck. Every saved change is uploading normally.</p>
        ) : (
          <ul className="space-y-2">
            {failed.map((o) => (
              <li key={o.id} className="rounded-lg bg-slate-900 p-3 text-sm">
                <p className="font-medium">
                  {typeLabel[o.type] ?? o.type}{' '}
                  <span className="text-xs text-slate-500">
                    saved {formatDateTime(o.created_at)}, tried {o.attempts} time(s)
                  </span>
                </p>
                <p className="mt-1 text-red-300">{o.last_error}</p>
                {o.type === 'sale' ? (
                  <p className="mt-1 text-xs text-slate-400">
                    A sale is never discarded. It stays on this device and retries on every sync.
                  </p>
                ) : o.type === 'stock_adjust' ? (
                  <button
                    onClick={() => void discard(o)}
                    className="mt-2 rounded-lg bg-slate-700 px-3 py-1 text-xs font-semibold text-red-300 hover:bg-slate-600"
                  >
                    Discard this adjustment
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}