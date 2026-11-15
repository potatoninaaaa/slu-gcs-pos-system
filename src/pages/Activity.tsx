import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import DateFilter from '../components/DateFilter'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useProfileNames } from '../hooks/useProfiles'
import { downloadCsv } from '../lib/csv'
import { inRange, resolveRange, type DateFilterValue } from '../lib/dates'
import { formatDateTime, manilaDayKey } from '../lib/format'
import { inputCls } from '../lib/ui'
import type { ActivityLog, InventoryMovement, Product } from '../types'

const labels: Record<string, string> = {
  sale_completed: 'Sale completed',
  sale_cancelled: 'Sale cancelled',
  product_created: 'Product created',
  product_updated: 'Product updated',
  product_deleted: 'Product deleted',
  product_archived: 'Product archived',
  product_restored: 'Product restored',
  stock_restock: 'Stock added',
  stock_deduction: 'Stock deducted',
  stock_adjustment: 'Stock set',
  sync_stock_conflict: 'Stock conflict during sync',
  sync_completed: 'Sync completed',
  user_signed_in: 'User signed in',
}
const label = (a: string) => labels[a] ?? a

const moveLabels: Record<string, string> = {
  initial: 'Initial stock',
  sale: 'Sale',
  restock: 'Stock added',
  deduction: 'Stock deducted',
  adjustment: 'Stock set',
}

function summarize(d: Record<string, unknown>): string {
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
    .join('; ')
}

export default function Activity() {
  const { profile } = useAuth()
  const nameOf = useProfileNames()
  const logs = useLiveQuery(() => db.logs.orderBy('created_at').reverse().toArray(), [], [] as ActivityLog[])
  const moves = useLiveQuery(
    () => db.movements.orderBy('created_at').reverse().toArray(),
    [],
    [] as InventoryMovement[],
  )
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])

  const [tab, setTab] = useState<'logs' | 'moves'>('logs')
  const [date, setDate] = useState<DateFilterValue>({ preset: 'all', from: '', to: '' })
  const [search, setSearch] = useState('')
  const [kind, setKind] = useState('all')
  const [limit, setLimit] = useState(100)

  const productName = (id: string) => {
    const p = products.find((x) => x.id === id)
    return p ? `${p.name} (${p.sku})` : 'Deleted product'
  }

  const logRows = useMemo(() => {
    const range = resolveRange(date)
    const q = search.trim().toLowerCase()
    return logs.filter(
      (l) =>
        inRange(l.created_at, range) &&
        (kind === 'all' || l.action === kind) &&
        (!q ||
          label(l.action).toLowerCase().includes(q) ||
          summarize(l.details).toLowerCase().includes(q) ||
          nameOf(l.user_id).toLowerCase().includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logs, date, search, kind])

  const moveRows = useMemo(() => {
    const range = resolveRange(date)
    const q = search.trim().toLowerCase()
    return moves.filter(
      (m) =>
        inRange(m.created_at, range) &&
        (kind === 'all' || m.movement_type === kind) &&
        (!q ||
          productName(m.product_id).toLowerCase().includes(q) ||
          (m.reason ?? '').toLowerCase().includes(q)),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves, products, date, search, kind])

  if (profile?.role !== 'admin') {
    return <p className="p-6 text-center text-slate-400">Only administrators can view activity logs.</p>
  }

  const actionOptions = Array.from(new Set(logs.map((l) => l.action))).sort()
  const stamp = manilaDayKey(new Date().toISOString())

  const exportCsv = () => {
    if (tab === 'logs') {
      downloadCsv(`activity-log-${stamp}.csv`, [
        ['Date and time (Manila)', 'User', 'Action', 'Entity', 'Entity ID', 'Details'],
        ...logRows.map((l) => [
          formatDateTime(l.created_at),
          nameOf(l.user_id),
          label(l.action),
          l.entity_type,
          l.entity_id,
          summarize(l.details),
        ]),
      ])
    } else {
      downloadCsv(`stock-movements-${stamp}.csv`, [
        ['Date and time (Manila)', 'Product', 'Type', 'Change', 'Before', 'After', 'Reason', 'By'],
        ...moveRows.map((m) => [
          formatDateTime(m.created_at),
          productName(m.product_id),
          moveLabels[m.movement_type],
          m.quantity_change,
          m.stock_before,
          m.stock_after,
          m.reason,
          nameOf(m.created_by),
        ]),
      ])
    }
  }

  const tabBtn = (t: 'logs' | 'moves', text: string) => (
    <button
      onClick={() => {
        setTab(t)
        setKind('all')
        setLimit(100)
      }}
      className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
        tab === t ? 'bg-gold text-slate-deep' : 'bg-slate-800 text-slate-300'
      }`}
    >
      {text}
    </button>
  )

  return (
    <div className="mx-auto max-w-7xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {tabBtn('logs', 'Activity log')}
          {tabBtn('moves', 'Stock movements')}
        </div>
        <button onClick={exportCsv} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold hover:bg-slate-600">
          Export CSV
        </button>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <DateFilter value={date} onChange={setDate} />
        <input
          className={`${inputCls} w-full sm:w-64`}
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={`${inputCls} w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="all">{tab === 'logs' ? 'All actions' : 'All types'}</option>
          {tab === 'logs'
            ? actionOptions.map((a) => (
                <option key={a} value={a}>
                  {label(a)}
                </option>
              ))
            : Object.entries(moveLabels).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl bg-slate-800 p-3">
        {tab === 'logs' ? (
          logRows.length === 0 ? (
            <p className="p-4 text-center text-slate-400">No activity found.</p>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="text-slate-400">
                <tr>
                  <th className="py-2 pr-2">Date</th>
                  <th className="py-2 pr-2">User</th>
                  <th className="py-2 pr-2">Action</th>
                  <th className="py-2">Details</th>
                </tr>
              </thead>
              <tbody>
                {logRows.slice(0, limit).map((l) => (
                  <tr key={l.id} className="border-t border-slate-700 align-top">
                    <td className="whitespace-nowrap py-2 pr-2">{formatDateTime(l.created_at)}</td>
                    <td className="py-2 pr-2">{nameOf(l.user_id)}</td>
                    <td className="py-2 pr-2 font-medium">{label(l.action)}</td>
                    <td className="py-2 text-xs text-slate-400">{summarize(l.details)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : moveRows.length === 0 ? (
          <p className="p-4 text-center text-slate-400">No stock movements found.</p>
        ) : (
          <table className="w-full min-w-[820px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-2">Date</th>
                <th className="py-2 pr-2">Product</th>
                <th className="py-2 pr-2">Type</th>
                <th className="py-2 pr-2">Change</th>
                <th className="py-2 pr-2">Before → After</th>
                <th className="py-2 pr-2">Reason</th>
                <th className="py-2">By</th>
              </tr>
            </thead>
            <tbody>
              {moveRows.slice(0, limit).map((m) => (
                <tr key={m.id} className="border-t border-slate-700">
                  <td className="whitespace-nowrap py-2 pr-2">{formatDateTime(m.created_at)}</td>
                  <td className="py-2 pr-2">{productName(m.product_id)}</td>
                  <td className="py-2 pr-2">{moveLabels[m.movement_type]}</td>
                  <td className={`py-2 pr-2 font-semibold ${m.quantity_change < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                    {m.quantity_change > 0 ? `+${m.quantity_change}` : m.quantity_change}
                  </td>
                  <td className="py-2 pr-2">
                    {m.stock_before} → {m.stock_after}
                  </td>
                  <td className="py-2 pr-2 text-slate-300">{m.reason}</td>
                  <td className="py-2">{nameOf(m.created_by)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(tab === 'logs' ? logRows.length : moveRows.length) > limit && (
          <button onClick={() => setLimit((l) => l + 100)} className="mt-3 w-full rounded-lg bg-slate-700 py-2 text-sm">
            Show more
          </button>
        )}
      </div>
    </div>
  )
}