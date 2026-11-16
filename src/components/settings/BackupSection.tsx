import { useLiveQuery } from 'dexie-react-hooks'
import { useState, type ChangeEvent } from 'react'
import { db } from '../../db/db'
import { useOnline } from '../../hooks/useOnline'
import { buildBackup, downloadJson, parseBackup, restoreBackup, type Backup } from '../../lib/backup'
import { downloadCsv } from '../../lib/csv'
import { manilaDayKey } from '../../lib/format'
import { syncNow } from '../../sync/engine'
import Msg, { type Notice } from '../Msg'

export default function BackupSection() {
  const online = useOnline()
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const [msg, setMsg] = useState<Notice | null>(null)
  const [parsed, setParsed] = useState<Backup | null>(null)
  const [busy, setBusy] = useState(false)
  const stamp = manilaDayKey(new Date().toISOString())

  const exportJson = async () => {
    downloadJson(`gcs-pos-backup-${stamp}.json`, await buildBackup())
    setMsg({ ok: true, text: 'Backup downloaded. Keep the file somewhere safe, such as Google Drive.' })
  }

  const exportProducts = async () => {
    const [products, categories] = await Promise.all([db.products.toArray(), db.categories.toArray()])
    const cat = (id: string | null) => categories.find((c) => c.id === id)?.name ?? ''
    downloadCsv(`products-${stamp}.csv`, [
      ['SKU', 'Name', 'Category', 'Price (PHP)', 'Stock', 'Low-stock threshold', 'Available', 'Archived'],
      ...products.map((p) => [
        p.sku, p.name, cat(p.category_id), p.price, p.stock_qty, p.low_stock_threshold,
        p.is_available ? 'yes' : 'no', p.is_archived ? 'yes' : 'no',
      ]),
    ])
  }

  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setParsed(null)
    if (!file) return
    try {
      setParsed(parseBackup(await file.text()))
      setMsg(null)
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    }
  }

  const restore = async () => {
    if (!parsed) return
    if (!online) return setMsg({ ok: false, text: 'Restoring needs an internet connection.' })
    if (!window.confirm('Restore this backup? Missing records are added. Existing records are never changed.')) return
    setBusy(true)
    try {
      const r = await restoreBackup(parsed)
      setMsg({
        ok: true,
        text: `Restored: ${r.products} products, ${r.categories} categories, ${r.transactions} transactions, ${r.movements} stock movements, ${r.logs} log entries.`,
      })
      setParsed(null)
      void syncNow(true)
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-1 font-semibold text-gold">Back up</h2>
        <p className="mb-3 text-sm text-slate-400">
          Downloads products, categories, all transactions, stock movements, activity logs, and settings.
          Product photos and logos stay in cloud storage and are not inside the file.
        </p>
        {pending > 0 && (
          <p className="mb-3 rounded-lg bg-amber-900/40 px-3 py-2 text-sm text-amber-200">
            {pending} change(s) are still waiting to sync. They are included, but sync first if you can.
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void exportJson()} className="rounded-lg bg-gold px-4 py-2 font-bold text-slate-deep">
            Download full backup (JSON)
          </button>
          <button onClick={() => void exportProducts()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600">
            Products (CSV)
          </button>
        </div>
      </div>

      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-1 font-semibold text-gold">Restore</h2>
        <p className="mb-3 text-sm text-slate-400">
          Adds anything from the backup that is missing in the cloud database. It never overwrites or duplicates
          existing records, so restoring the same file twice is safe.
        </p>
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => void pick(e)}
          className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-700 file:px-3 file:py-2 file:font-semibold file:text-white"
        />
        {parsed && (
          <div className="mt-3 rounded-lg bg-slate-900 p-3 text-sm">
            <p>Backup from {new Date(parsed.exported_at).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })}</p>
            <p className="text-slate-400">
              {parsed.products.length} products, {parsed.categories.length} categories, {parsed.transactions.length}{' '}
              transactions, {parsed.movements.length} movements, {parsed.logs.length} log entries
            </p>
            <button
              onClick={() => void restore()}
              disabled={busy}
              className="mt-3 rounded-lg bg-gold px-4 py-2 font-bold text-slate-deep disabled:opacity-50"
            >
              {busy ? 'Restoring...' : 'Restore this backup'}
            </button>
          </div>
        )}
      </div>
      <Msg n={msg} />
    </div>
  )
}