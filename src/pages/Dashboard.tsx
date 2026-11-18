import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import DateFilter from '../components/DateFilter'
import ExportButtons from '../components/ExportButtons'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useProfileNames } from '../hooks/useProfiles'
import { inRange, resolveRange, type DateFilterValue } from '../lib/dates'
import type { TableDoc } from '../lib/exporter'
import { formatPeso, manilaDayKey } from '../lib/format'
import { roundMoney } from '../lib/money'
import { inputCls } from '../lib/ui'
import type { Category, LocalTransaction, Product, SaleItem } from '../types'

const DAY = 86_400_000
const dayStartMs = (key: string) => new Date(`${key}T00:00:00+08:00`).getTime()
const dayLabel = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' })
const labelOfKey = (k: string) => dayLabel.format(new Date(`${k}T00:00:00+08:00`))
const hourLabel = (h: number) => `${h % 12 || 12}${h < 12 ? 'AM' : 'PM'}`

interface SaleLine {
  tx: LocalTransaction
  item: SaleItem
}

const GOLD = '#278a5a'
const GRID = '#dbe7de'
const AXIS = '#5f7d6b'
const tooltipStyle = { background: '#ffffff', border: '1px solid #bcd3c4', borderRadius: 12, color: '#12372a' }

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl bg-slate-800 p-4">
      <p className="text-xs uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gold">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
    </div>
  )
}

type PSort = 'name' | 'qty' | 'revenue'

export default function Dashboard() {
  const { profile } = useAuth()
  const nameOf = useProfileNames()
  const txs = useLiveQuery(() => db.transactions.toArray(), [], [] as LocalTransaction[])
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const categories = useLiveQuery(() => db.categories.toArray(), [], [] as Category[])

  const [date, setDate] = useState<DateFilterValue>({ preset: 'today', from: '', to: '' })
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [cashier, setCashier] = useState('all')
  const [status, setStatus] = useState<'completed' | 'cancelled' | 'all'>('completed')
  const [pSort, setPSort] = useState<PSort>('revenue')
  const [pAsc, setPAsc] = useState(false)

  const range = useMemo(() => resolveRange(date), [date])
  const productsById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])
  const categoryName = (id: string | null | undefined) =>
    categories.find((c) => c.id === id)?.name ?? 'Uncategorized'

  const cashierIds = useMemo(
    () => Array.from(new Set(txs.map((t) => t.cashier_id).filter(Boolean))) as string[],
    [txs],
  )

  const lines = useMemo(() => {
    const q = search.trim().toLowerCase()
    const out: SaleLine[] = []
    for (const t of txs) {
      if (!inRange(t.created_at, range)) continue
      if (status !== 'all' && t.status !== status) continue
      if (cashier !== 'all' && t.cashier_id !== cashier) continue
      for (const item of t.items) {
        if (q && !item.product_name.toLowerCase().includes(q) && !item.sku.toLowerCase().includes(q)) continue
        if (categoryId !== 'all' && productsById.get(item.product_id)?.category_id !== categoryId) continue
        out.push({ tx: t, item })
      }
    }
    return out
  }, [txs, range, status, cashier, search, categoryId, productsById])

  const done = useMemo(() => lines.filter((l) => l.tx.status === 'completed'), [lines])

  const revenue = roundMoney(done.reduce((s, l) => s + l.item.line_total, 0))
  const itemsSold = done.reduce((s, l) => s + l.item.quantity, 0)
  const txCount = new Set(done.map((l) => l.tx.id)).size
  const avg = txCount ? roundMoney(revenue / txCount) : 0
  const cancelled = new Set(lines.filter((l) => l.tx.status === 'cancelled').map((l) => l.tx.id)).size

  const stockProducts = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        !p.is_archived &&
        (categoryId === 'all' || p.category_id === categoryId) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    )
  }, [products, search, categoryId])
  const inventoryValue = roundMoney(stockProducts.reduce((s, p) => s + Number(p.price) * p.stock_qty, 0))
  const outOfStock = stockProducts.filter((p) => p.stock_qty <= 0)
  const lowStock = stockProducts.filter((p) => p.stock_qty > 0 && p.stock_qty <= p.low_stock_threshold)

  const perProduct = useMemo(() => {
    const m = new Map<string, { id: string; name: string; sku: string; qty: number; revenue: number }>()
    for (const { item } of done) {
      const r = m.get(item.product_id) ?? {
        id: item.product_id,
        name: item.product_name,
        sku: item.sku,
        qty: 0,
        revenue: 0,
      }
      r.qty += item.quantity
      r.revenue = roundMoney(r.revenue + item.line_total)
      m.set(item.product_id, r)
    }
    return Array.from(m.values())
  }, [done])

  const productRows = useMemo(() => {
    const dir = pAsc ? 1 : -1
    return [...perProduct].sort((a, b) =>
      pSort === 'name' ? a.name.localeCompare(b.name) * dir : (a[pSort] - b[pSort]) * dir,
    )
  }, [perProduct, pSort, pAsc])

  const best = useMemo(
    () =>
      [...perProduct]
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 8)
        .map((p) => ({ ...p, short: p.name.length > 16 ? `${p.name.slice(0, 15)}…` : p.name })),
    [perProduct],
  )

  const byCategory = useMemo(() => {
    const m = new Map<string, number>()
    for (const { item } of done) {
      const name = categoryName(productsById.get(item.product_id)?.category_id)
      m.set(name, roundMoney((m.get(name) ?? 0) + item.line_total))
    }
    return Array.from(m, ([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done, productsById, categories])

  const trend = useMemo(() => {
    const hourly =
      !!range && Number.isFinite(range.start) && Number.isFinite(range.end) && range.end - range.start <= DAY
    const keyOf = (iso: string) =>
      hourly ? String(new Date(new Date(iso).getTime() + 8 * 3_600_000).getUTCHours()) : manilaDayKey(iso)

    const buckets = new Map<string, { revenue: number; orders: Set<string> }>()
    for (const l of done) {
      const k = keyOf(l.tx.created_at)
      const b = buckets.get(k) ?? { revenue: 0, orders: new Set<string>() }
      b.revenue += l.item.line_total
      b.orders.add(l.tx.id)
      buckets.set(k, b)
    }

    const keys: string[] = []
    if (hourly) {
      for (let h = 0; h < 24; h++) keys.push(String(h))
    } else {
      const times = done.map((l) => new Date(l.tx.created_at).getTime())
      let start = range && Number.isFinite(range.start) ? range.start : NaN
      let end = range && Number.isFinite(range.end) ? range.end : NaN
      if (Number.isNaN(start) && times.length) {
        start = dayStartMs(manilaDayKey(new Date(Math.min(...times)).toISOString()))
      }
      if (Number.isNaN(end) && times.length) {
        end = dayStartMs(manilaDayKey(new Date(Math.max(...times)).toISOString())) + DAY
      }
      if (!Number.isNaN(start) && !Number.isNaN(end)) {
        for (let t = start, n = 0; t < end && n < 400; t += DAY, n++) {
          keys.push(manilaDayKey(new Date(t).toISOString()))
        }
      }
    }
    return keys.map((k) => {
      const b = buckets.get(k)
      return {
        label: hourly ? hourLabel(Number(k)) : labelOfKey(k),
        revenue: roundMoney(b?.revenue ?? 0),
        orders: b?.orders.size ?? 0,
      }
    })
  }, [done, range])

  if (profile?.role !== 'admin') {
    return <p className="p-6 text-center text-slate-400">Only administrators can view the dashboard.</p>
  }

  const sortBtn = (key: PSort, text: string) => (
    <button
      onClick={() => {
        if (pSort === key) setPAsc((a) => !a)
        else {
          setPSort(key)
          setPAsc(key === 'name')
        }
      }}
      className="font-semibold hover:text-gold"
    >
      {text} {pSort === key ? (pAsc ? '▲' : '▼') : ''}
    </button>
  )

  const productDoc = (): TableDoc => ({
    title: 'Product sales',
    subtitle: 'Completed sales within the selected filters',
    summary: [
      ['Total revenue', formatPeso(revenue)],
      ['Completed transactions', String(txCount)],
      ['Items sold', String(itemsSold)],
      ['Average transaction', formatPeso(avg)],
    ],
    fileBase: `product-sales-${manilaDayKey(new Date().toISOString())}`,
    columns: [
      { header: 'Product', width: 32 },
      { header: 'SKU', width: 18 },
      { header: 'Units sold', kind: 'int', width: 12 },
      { header: 'Revenue', kind: 'money', width: 16 },
    ],
    rows: productRows.map((p) => [p.name, p.sku, p.qty, p.revenue]),
  })

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-bold text-gold">Sales dashboard</h1>
        <ExportButtons label="Product sales" build={productDoc} disabled={productRows.length === 0} />
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <DateFilter value={date} onChange={setDate} />
        <input
          className={inputCls}
          placeholder="Product name or SKU"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="all">All categories</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className={inputCls} value={cashier} onChange={(e) => setCashier(e.target.value)}>
          <option value="all">All cashiers</option>
          {cashierIds.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All statuses</option>
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total revenue" value={formatPeso(revenue)} hint="Completed sales only" />
        <Kpi label="Completed transactions" value={String(txCount)} />
        <Kpi label="Items sold" value={String(itemsSold)} />
        <Kpi label="Average transaction" value={formatPeso(avg)} />
        <Kpi label="Inventory value" value={formatPeso(inventoryValue)} hint="Price x current stock" />
        <Kpi label="Low stock" value={String(lowStock.length)} />
        <Kpi label="Out of stock" value={String(outOfStock.length)} />
        <Kpi label="Cancelled sales" value={String(cancelled)} hint="Within the filters" />
      </div>

      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-2 font-semibold">Sales trend</h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={trend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} interval="preserveStartEnd" />
              <YAxis stroke={AXIS} fontSize={12} width={60} tickFormatter={(v) => `₱${v}`} />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v) => [formatPeso(Number(v)), 'Revenue']}
              />
              <Line type="monotone" dataKey="revenue" stroke={GOLD} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-800 p-4">
          <h2 className="mb-2 font-semibold">Best-selling products (units)</h2>
          {best.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No sales match these filters.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={best} layout="vertical" margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis type="number" stroke={AXIS} fontSize={12} allowDecimals={false} />
                  <YAxis type="category" dataKey="short" stroke={AXIS} fontSize={12} width={110} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [String(v), 'Units sold']} />
                  <Bar dataKey="qty" fill={GOLD} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
        <div className="rounded-xl bg-slate-800 p-4">
          <h2 className="mb-2 font-semibold">Sales by category</h2>
          {byCategory.length === 0 ? (
            <p className="py-10 text-center text-sm text-slate-400">No sales match these filters.</p>
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byCategory} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" />
                  <XAxis dataKey="name" stroke={AXIS} fontSize={12} />
                  <YAxis stroke={AXIS} fontSize={12} width={60} tickFormatter={(v) => `₱${v}`} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatPeso(Number(v)), 'Revenue']} />
                  <Bar dataKey="value" fill="#8fc9a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl bg-slate-800 p-4">
          <h2 className="mb-2 font-semibold">Product sales</h2>
          <div className="max-h-80 overflow-auto">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-800 text-slate-400">
                <tr>
                  <th className="py-2 pr-2">{sortBtn('name', 'Product')}</th>
                  <th className="py-2 pr-2">{sortBtn('qty', 'Units')}</th>
                  <th className="py-2">{sortBtn('revenue', 'Revenue')}</th>
                </tr>
              </thead>
              <tbody>
                {productRows.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-400">
                      No sales match these filters.
                    </td>
                  </tr>
                ) : (
                  productRows.map((p) => (
                    <tr key={p.id} className="border-t border-slate-700">
                      <td className="py-2 pr-2">
                        {p.name} <span className="text-xs text-slate-500">{p.sku}</span>
                      </td>
                      <td className="py-2 pr-2">{p.qty}</td>
                      <td className="py-2">{formatPeso(p.revenue)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-xl bg-slate-800 p-4">
          <h2 className="mb-2 font-semibold">Stock alerts</h2>
          <div className="max-h-80 overflow-auto">
            {outOfStock.length + lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-400">No low or out-of-stock products.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-800 text-slate-400">
                  <tr>
                    <th className="py-2 pr-2">Product</th>
                    <th className="py-2 pr-2">Category</th>
                    <th className="py-2 pr-2">Stock</th>
                    <th className="py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {[...outOfStock, ...lowStock].map((p) => (
                    <tr key={p.id} className="border-t border-slate-700">
                      <td className="py-2 pr-2">{p.name}</td>
                      <td className="py-2 pr-2 text-slate-400">{categoryName(p.category_id)}</td>
                      <td className="py-2 pr-2">{p.stock_qty}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            p.stock_qty <= 0 ? 'bg-red-500/90 text-white' : 'bg-gold text-slate-deep'
                          }`}
                        >
                          {p.stock_qty <= 0 ? 'Out of stock' : 'Low stock'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}