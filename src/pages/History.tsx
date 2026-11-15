import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import DateFilter from '../components/DateFilter'
import Modal from '../components/Modal'
import Receipt from '../components/Receipt'
import { db } from '../db/db'
import { useProfileNames } from '../hooks/useProfiles'
import { downloadCsv } from '../lib/csv'
import { defaultDateFilter, inRange, resolveRange, type DateFilterValue } from '../lib/dates'
import { formatDateTime, formatPeso, manilaDayKey } from '../lib/format'
import { inputCls } from '../lib/ui'
import type { LocalTransaction } from '../types'

type Sort = 'newest' | 'oldest' | 'high' | 'low'

function SyncTag({ s }: { s: LocalTransaction['sync_status'] }) {
  const map = {
    synced: ['Synced', 'bg-emerald-900/60 text-emerald-300'],
    pending: ['Saved locally', 'bg-amber-900/50 text-amber-300'],
    error: ['Sync error', 'bg-red-900/50 text-red-300'],
  } as const
  const [text, cls] = map[s]
  return <span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{text}</span>
}

function StatusTag({ s }: { s: LocalTransaction['status'] }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
        s === 'completed' ? 'bg-emerald-900/60 text-emerald-300' : 'bg-slate-600 text-slate-200'
      }`}
    >
      {s === 'completed' ? 'Completed' : 'Cancelled'}
    </span>
  )
}

export default function History() {
  const nameOf = useProfileNames()
  const txs = useLiveQuery(() => db.transactions.toArray(), [], [] as LocalTransaction[])

  const [date, setDate] = useState<DateFilterValue>(defaultDateFilter)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'all' | 'completed' | 'cancelled'>('all')
  const [sync, setSync] = useState<'all' | 'synced' | 'pending' | 'error'>('all')
  const [sort, setSort] = useState<Sort>('newest')
  const [limit, setLimit] = useState(100)
  const [open, setOpen] = useState<LocalTransaction | null>(null)
  const [receipt, setReceipt] = useState<LocalTransaction | null>(null)

  const rows = useMemo(() => {
    const range = resolveRange(date)
    const q = search.trim().toLowerCase()
    const list = txs.filter(
      (t) =>
        inRange(t.created_at, range) &&
        (status === 'all' || t.status === status) &&
        (sync === 'all' || t.sync_status === sync) &&
        (!q ||
          t.receipt_no.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          t.items.some((i) => i.product_name.toLowerCase().includes(q) || i.sku.toLowerCase().includes(q))),
    )
    list.sort((a, b) => {
      if (sort === 'newest') return b.created_at.localeCompare(a.created_at)
      if (sort === 'oldest') return a.created_at.localeCompare(b.created_at)
      if (sort === 'high') return b.total_amount - a.total_amount
      return a.total_amount - b.total_amount
    })
    return list
  }, [txs, date, search, status, sync, sort])

  const completed = rows.filter((t) => t.status === 'completed')
  const revenue = completed.reduce((s, t) => s + t.total_amount, 0)
  const stamp = manilaDayKey(new Date().toISOString())

  const exportTransactions = () =>
    downloadCsv(`transactions-${stamp}.csv`, [
      ['Transaction ID', 'Receipt no', 'Date and time (Manila)', 'Cashier', 'Status', 'Items', 'Total (PHP)', 'Cash received (PHP)', 'Change (PHP)', 'Sync status'],
      ...rows.map((t) => [
        t.id,
        t.receipt_no,
        formatDateTime(t.created_at),
        nameOf(t.cashier_id),
        t.status,
        t.items.reduce((s, i) => s + i.quantity, 0),
        t.total_amount,
        t.cash_received,
        t.change_given,
        t.sync_status,
      ]),
    ])

  const exportItems = () =>
    downloadCsv(`transaction-items-${stamp}.csv`, [
      ['Transaction ID', 'Receipt no', 'Date and time (Manila)', 'Status', 'Product', 'SKU', 'Quantity', 'Unit price (PHP)', 'Line total (PHP)'],
      ...rows.flatMap((t) =>
        t.items.map((i) => [
          t.id,
          t.receipt_no,
          formatDateTime(t.created_at),
          t.status,
          i.product_name,
          i.sku,
          i.quantity,
          i.unit_price,
          i.line_total,
        ]),
      ),
    ])

  return (
    <div className="mx-auto max-w-7xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gold">Transaction history</h1>
          <p className="text-sm text-slate-400">
            {rows.length} transactions, {completed.length} completed, {formatPeso(revenue)} revenue
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportTransactions} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold hover:bg-slate-600">
            Export CSV
          </button>
          <button onClick={exportItems} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold hover:bg-slate-600">
            Export line items
          </button>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <DateFilter value={date} onChange={setDate} />
        <input
          className={`${inputCls} w-full sm:w-64`}
          placeholder="Receipt, ID, product, or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${inputCls} w-auto`} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="all">All statuses</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select className={`${inputCls} w-auto`} value={sync} onChange={(e) => setSync(e.target.value as typeof sync)}>
          <option value="all">All sync states</option>
          <option value="synced">Synced</option>
          <option value="pending">Saved locally</option>
          <option value="error">Sync error</option>
        </select>
        <select className={`${inputCls} w-auto`} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="high">Highest total</option>
          <option value="low">Lowest total</option>
        </select>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-slate-800 p-6 text-center text-slate-400">No transactions match.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-slate-800 p-3">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-2">Receipt</th>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Cashier</th>
                <th className="py-2 pr-2">Items</th>
                <th className="py-2 pr-2">Total</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2">Sync</th>
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, limit).map((t) => (
                <tr
                  key={t.id}
                  onClick={() => setOpen(t)}
                  className="cursor-pointer border-t border-slate-700 hover:bg-slate-700/40"
                >
                  <td className="py-2 pr-2 font-mono text-xs">{t.receipt_no}</td>
                  <td className="py-2 pr-2">{formatDateTime(t.created_at)}</td>
                  <td className="py-2 pr-2">{nameOf(t.cashier_id)}</td>
                  <td className="py-2 pr-2">{t.items.reduce((s, i) => s + i.quantity, 0)}</td>
                  <td className="py-2 pr-2 font-semibold">{formatPeso(t.total_amount)}</td>
                  <td className="py-2 pr-2">
                    <StatusTag s={t.status} />
                  </td>
                  <td className="py-2">
                    <SyncTag s={t.sync_status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows.length > limit && (
            <button onClick={() => setLimit((l) => l + 100)} className="mt-3 w-full rounded-lg bg-slate-700 py-2 text-sm">
              Show more ({rows.length - limit} left)
            </button>
          )}
        </div>
      )}

      {open && (
        <Modal title="Transaction details" onClose={() => setOpen(null)}>
          <div className="space-y-1 text-sm">
            <p className="break-all text-xs text-slate-400">ID: {open.id}</p>
            <p>Receipt: {open.receipt_no}</p>
            <p>Date: {formatDateTime(open.created_at)}</p>
            <p>Cashier: {nameOf(open.cashier_id)}</p>
            <p className="flex items-center gap-2">
              <StatusTag s={open.status} /> <SyncTag s={open.sync_status} />
            </p>
            {open.sync_error && <p className="text-red-300">Sync error: {open.sync_error}</p>}
          </div>
          <ul className="my-3 space-y-1 border-y border-slate-700 py-3 text-sm">
            {open.items.map((i) => (
              <li key={i.product_id} className="flex justify-between gap-2">
                <span>
                  {i.quantity} x {i.product_name}{' '}
                  <span className="text-slate-400">({formatPeso(i.unit_price)})</span>
                </span>
                <span>{formatPeso(i.line_total)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between font-bold">
            <span>Total</span>
            <span className="text-gold">{formatPeso(open.total_amount)}</span>
          </p>
          <p className="flex justify-between text-sm text-slate-300">
            <span>Cash received</span>
            <span>{formatPeso(open.cash_received)}</span>
          </p>
          <p className="flex justify-between text-sm text-slate-300">
            <span>Change</span>
            <span>{formatPeso(open.change_given)}</span>
          </p>
          <button
            onClick={() => setReceipt(open)}
            className="mt-4 w-full rounded-lg bg-gold py-2.5 font-bold text-slate-deep"
          >
            View / print receipt
          </button>
        </Modal>
      )}
      {receipt && <Receipt tx={receipt} closeLabel="Close" onClose={() => setReceipt(null)} />}
    </div>
  )
}