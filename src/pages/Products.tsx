import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useState } from 'react'
import ProductFormModal from '../components/ProductFormModal'
import ProductImage from '../components/ProductImage'
import StockModal from '../components/StockModal'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import { logActivity } from '../lib/activity'
import { formatDate, formatPeso } from '../lib/format'
import { putProductKeepingStock } from '../lib/inventory'
import { supabase } from '../lib/supabase'
import { inputCls } from '../lib/ui'
import { syncNow } from '../sync/engine'
import type { Category, Product } from '../types'

type StatusFilter = 'all' | 'in' | 'low' | 'out' | 'unavailable' | 'archived'
type SortKey = 'name' | 'price' | 'stock' | 'created'

function statusOf(p: Product) {
  if (p.is_archived) return { text: 'Archived', cls: 'bg-slate-600 text-slate-200' }
  if (!p.is_available) return { text: 'Unavailable', cls: 'bg-slate-600 text-slate-200' }
  if (p.stock_qty <= 0) return { text: 'Out of stock', cls: 'bg-red-500/90 text-white' }
  if (p.stock_qty <= p.low_stock_threshold) return { text: 'Low stock', cls: 'bg-gold text-slate-deep' }
  return { text: 'In stock', cls: 'bg-emerald-600 text-white' }
}

const btn = 'rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-semibold hover:bg-slate-600'

export default function Products() {
  const { profile, session } = useAuth()
  const online = useOnline()
  const userId = session?.user.id ?? ''
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [], [] as Category[])

  const [view, setView] = useState<'grid' | 'table'>('grid')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [asc, setAsc] = useState(true)
  const [editing, setEditing] = useState<Product | 'new' | null>(null)
  const [stockFor, setStockFor] = useState<Product | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)

  const catName = (id: string | null) => categories.find((c) => c.id === id)?.name ?? 'Uncategorized'

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const min = minPrice === '' ? null : Number(minPrice)
    const max = maxPrice === '' ? null : Number(maxPrice)
    const list = products.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q) && !p.sku.toLowerCase().includes(q)) return false
      if (categoryId !== 'all' && p.category_id !== categoryId) return false
      const price = Number(p.price)
      if (min !== null && price < min) return false
      if (max !== null && price > max) return false
      switch (status) {
        case 'archived':
          return p.is_archived
        case 'all':
          return !p.is_archived
        case 'unavailable':
          return !p.is_archived && !p.is_available
        case 'out':
          return !p.is_archived && p.stock_qty <= 0
        case 'low':
          return !p.is_archived && p.stock_qty > 0 && p.stock_qty <= p.low_stock_threshold
        case 'in':
          return !p.is_archived && p.stock_qty > p.low_stock_threshold
        default:
          return true
      }
    })
    const dir = asc ? 1 : -1
    list.sort((a, b) => {
      let c = 0
      if (sortKey === 'name') c = a.name.localeCompare(b.name)
      else if (sortKey === 'price') c = Number(a.price) - Number(b.price)
      else if (sortKey === 'stock') c = a.stock_qty - b.stock_qty
      else c = a.created_at.localeCompare(b.created_at)
      return c * dir
    })
    return list
  }, [products, search, categoryId, status, minPrice, maxPrice, sortKey, asc])

  const inventoryValue = products
    .filter((p) => !p.is_archived)
    .reduce((s, p) => s + Number(p.price) * p.stock_qty, 0)

  if (profile?.role !== 'admin') {
    return <p className="p-6 text-center text-slate-400">Only administrators can manage products.</p>
  }

  const flash = (ok: boolean, text: string) => setNotice({ ok, text })

  const toggleArchive = async (p: Product) => {
    if (!online) return flash(false, 'Archiving needs an internet connection.')
    const archive = !p.is_archived
    if (archive && !window.confirm(`Archive "${p.name}"? It will be hidden from the cashier.`)) return
    const { data, error } = await supabase
      .from('products')
      .update({ is_archived: archive })
      .eq('id', p.id)
      .select()
      .single()
    if (error) return flash(false, error.message)
    await putProductKeepingStock(data as Product)
    await logActivity(userId, archive ? 'product_archived' : 'product_restored', 'product', p.id, {
      name: p.name,
      sku: p.sku,
    })
    void syncNow()
    flash(true, archive ? `${p.name} archived.` : `${p.name} restored.`)
  }

  const remove = async (p: Product) => {
    if (!online) return flash(false, 'Deleting needs an internet connection.')
    if (!window.confirm(`Permanently delete "${p.name}"? This cannot be undone.`)) return
    const { error } = await supabase.from('products').delete().eq('id', p.id)
    if (error) {
      return flash(
        false,
        error.code === '23503'
          ? `${p.name} has stock or sales history and cannot be deleted. Archive it instead.`
          : error.message,
      )
    }
    await db.products.delete(p.id)
    if (p.image_path) await supabase.storage.from('product-images').remove([p.image_path])
    await logActivity(userId, 'product_deleted', 'product', p.id, { name: p.name, sku: p.sku })
    void syncNow()
    flash(true, `${p.name} deleted.`)
  }

  const actions = (p: Product) => (
    <div className="flex flex-wrap gap-1.5">
      <button className={btn} onClick={() => setEditing(p)}>
        Edit
      </button>
      <button className={btn} onClick={() => setStockFor(p)}>
        Stock
      </button>
      <button className={btn} onClick={() => void toggleArchive(p)}>
        {p.is_archived ? 'Restore' : 'Archive'}
      </button>
      <button className={`${btn} text-red-300`} onClick={() => void remove(p)}>
        Delete
      </button>
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-gold">Products</h1>
          <p className="text-sm text-slate-400">
            {rows.length} shown, inventory value {formatPeso(inventoryValue)}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-700">
            {(['grid', 'table'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-sm capitalize ${
                  view === v ? 'bg-gold text-slate-deep' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            onClick={() => setEditing('new')}
            className="rounded-lg bg-gold px-4 py-1.5 text-sm font-bold text-slate-deep"
          >
            Add product
          </button>
        </div>
      </div>

      {notice && (
        <p
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${
            notice.ok ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/50 text-red-200'
          }`}
        >
          {notice.text}
        </p>
      )}

      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <input
          className={`${inputCls} lg:col-span-2`}
          placeholder="Search by name or SKU"
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
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
          <option value="all">All active</option>
          <option value="in">In stock</option>
          <option value="low">Low stock</option>
          <option value="out">Out of stock</option>
          <option value="unavailable">Unavailable</option>
          <option value="archived">Archived</option>
        </select>
        <div className="flex gap-2">
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="Min ₱"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          />
          <input
            className={inputCls}
            inputMode="decimal"
            placeholder="Max ₱"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^0-9.]/g, ''))}
          />
        </div>
        <div className="flex gap-2">
          <select className={inputCls} value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
            <option value="name">Sort: Name</option>
            <option value="price">Sort: Price</option>
            <option value="stock">Sort: Stock</option>
            <option value="created">Sort: Date added</option>
          </select>
          <button
            onClick={() => setAsc((a) => !a)}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 text-sm"
            aria-label="Toggle sort direction"
          >
            {asc ? 'A→Z' : 'Z→A'}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl bg-slate-800 p-6 text-center text-slate-400">No products match.</p>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((p) => {
            const st = statusOf(p)
            return (
              <div key={p.id} className="overflow-hidden rounded-xl bg-slate-800">
                <div className="relative">
                  <ProductImage path={p.image_path} name={p.name} className="h-40 w-full" />
                  <span className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>
                    {st.text}
                  </span>
                </div>
                <div className="space-y-1 p-3">
                  <p className="font-medium leading-tight">{p.name}</p>
                  <p className="text-xs text-slate-400">
                    {catName(p.category_id)} · {p.sku}
                  </p>
                  <p className="flex items-center justify-between">
                    <span className="font-bold text-gold">{formatPeso(Number(p.price))}</span>
                    <span className="text-sm text-slate-300">Stock: {p.stock_qty}</span>
                  </p>
                  <div className="pt-1">{actions(p)}</div>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-slate-800 p-3">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-2"></th>
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">SKU</th>
                <th className="py-2 pr-2">Category</th>
                <th className="py-2 pr-2">Price</th>
                <th className="py-2 pr-2">Stock</th>
                <th className="py-2 pr-2">Status</th>
                <th className="py-2 pr-2">Added</th>
                <th className="py-2 pr-2">Updated</th>
                <th className="py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const st = statusOf(p)
                return (
                  <tr key={p.id} className="border-t border-slate-700 align-middle">
                    <td className="py-2 pr-2">
                      <ProductImage path={p.image_path} name={p.name} className="h-10 w-10 rounded-lg" />
                    </td>
                    <td className="py-2 pr-2 font-medium">{p.name}</td>
                    <td className="py-2 pr-2 text-slate-400">{p.sku}</td>
                    <td className="py-2 pr-2">{catName(p.category_id)}</td>
                    <td className="py-2 pr-2">{formatPeso(Number(p.price))}</td>
                    <td className="py-2 pr-2">
                      {p.stock_qty} <span className="text-xs text-slate-500">(low at {p.low_stock_threshold})</span>
                    </td>
                    <td className="py-2 pr-2">
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.text}</span>
                    </td>
                    <td className="py-2 pr-2 text-slate-400">{formatDate(p.created_at)}</td>
                    <td className="py-2 pr-2 text-slate-400">{formatDate(p.updated_at)}</td>
                    <td className="py-2">{actions(p)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <ProductFormModal
          product={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(text) => {
            setEditing(null)
            flash(true, text)
          }}
        />
      )}
      {stockFor && (
        <StockModal
          product={stockFor}
          onClose={() => setStockFor(null)}
          onDone={(text) => {
            setStockFor(null)
            flash(true, text)
          }}
        />
      )}
    </div>
  )
}