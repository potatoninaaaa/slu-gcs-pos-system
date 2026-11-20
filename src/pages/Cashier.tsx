import { useLiveQuery } from 'dexie-react-hooks'
import { useMemo, useRef, useState } from 'react'
import ProductImage from '../components/ProductImage'
import Receipt from '../components/Receipt'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { formatPeso } from '../lib/format'
import { roundMoney } from '../lib/money'
import { recordSale, SaleError } from '../lib/sales'
import { syncNow } from '../sync/engine'
import type { LocalTransaction, PaymentMethod, Product } from '../types'

function stockBadge(p: Product, left: number) {
  if (!p.is_available) return { text: 'Unavailable', cls: 'bg-slate-600 text-slate-200' }
  if (p.stock_qty <= 0) return { text: 'Out of stock', cls: 'bg-red-500/90 text-white' }
  if (p.stock_qty <= p.low_stock_threshold)
    return { text: `Low: ${left} left`, cls: 'bg-gold text-slate-deep' }
  return { text: `${left} in stock`, cls: 'bg-emerald-600 text-white' }
}

export default function Cashier() {
  const { session } = useAuth()
  const products = useLiveQuery(
    () => db.products.orderBy('name').filter((p) => !p.is_archived).toArray(),
    [],
    [] as Product[],
  )
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [], [])

  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [cart, setCart] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paymentReference, setPaymentReference] = useState('')
  const [gcashConfirmed, setGcashConfirmed] = useState(false)
  const [cash, setCash] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [receipt, setReceipt] = useState<LocalTransaction | null>(null)
  const cartRef = useRef<HTMLDivElement>(null)

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return products.filter(
      (p) =>
        (categoryId === 'all' || p.category_id === categoryId) &&
        (!q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)),
    )
  }, [products, search, categoryId])

  const lines = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, quantity]) => ({ product: byId.get(id), quantity }))
        .filter((l): l is { product: Product; quantity: number } => !!l.product),
    [cart, byId],
  )

  const total = roundMoney(lines.reduce((s, l) => s + Number(l.product.price) * l.quantity, 0))
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0)
  const cashNum = cash === '' ? 0 : Number(cash)
  const shortBy = roundMoney(total - cashNum)
  const change = roundMoney(cashNum - total)
  const canPay =
    lines.length > 0 &&
    (paymentMethod === 'cash' ? cashNum >= total : gcashConfirmed) &&
    !busy

  const setQty = (p: Product, qty: number) => {
    setError(null)
    if (qty <= 0) {
      setCart(({ [p.id]: _removed, ...rest }) => {
        void _removed
        return rest
      })
      return
    }
    if (qty > p.stock_qty) {
      setError(`Only ${p.stock_qty} of ${p.name} in stock.`)
      qty = p.stock_qty
    }
    setCart((c) => ({ ...c, [p.id]: qty }))
  }

  const addToCart = (p: Product) => {
    if (!p.is_available || p.stock_qty <= 0) return
    setQty(p, (cart[p.id] ?? 0) + 1)
  }

  const reset = () => {
    setCart({})
    setPaymentMethod('cash')
    setPaymentReference('')
    setGcashConfirmed(false)
    setCash('')
    setError(null)
  }

  const complete = async () => {
    setBusy(true)
    setError(null)
    try {
      const tx = await recordSale(
        lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        'completed',
        paymentMethod,
        paymentMethod === 'cash' ? cashNum : 0,
        session?.user.id ?? null,
        paymentReference.trim() || null,
      )
      reset()
      setReceipt(tx)
      void syncNow()
    } catch (e) {
      setError(e instanceof SaleError ? e.message : 'Could not save the sale. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const cancel = async () => {
    if (lines.length === 0) return
    if (!window.confirm('Cancel this sale? It will be recorded as cancelled.')) return
    setBusy(true)
    try {
      await recordSale(
        lines.map((l) => ({ product_id: l.product.id, quantity: l.quantity })),
        'cancelled',
        'cash',
        0,
        session?.user.id ?? null,
      )
      reset()
      void syncNow()
    } catch (e) {
      setError(e instanceof SaleError ? e.message : 'Could not cancel the sale.')
    } finally {
      setBusy(false)
    }
  }

  const quick = [50, 100, 500, 1000]

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-3 pb-24 lg:grid-cols-[1fr_380px] lg:pb-3">
      {/* Products */}
      <section>
        <div className="mb-3 flex flex-col gap-2 sm:flex-row">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or SKU"
            className="flex-1 rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-slate-50 placeholder:text-slate-500 outline-none focus:border-gold"
          />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="rounded-xl border border-slate-600 bg-slate-800 px-3 py-2 text-slate-50 outline-none focus:border-gold"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {products.length === 0 ? (
          <p className="rounded-xl bg-slate-800 p-6 text-center text-slate-400">
            No products yet. An admin can add products on the Products page.
          </p>
        ) : visible.length === 0 ? (
          <p className="rounded-xl bg-slate-800 p-6 text-center text-slate-400">
            No products match your search.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {visible.map((p) => {
              const inCart = cart[p.id] ?? 0
              const left = p.stock_qty - inCart
              const badge = stockBadge(p, left)
              const disabled = !p.is_available || left <= 0
              return (
                <button
                  key={p.id}
                  onClick={() => addToCart(p)}
                  disabled={disabled}
                  className="relative overflow-hidden rounded-2xl bg-slate-800 text-left shadow-lg ring-1 ring-slate-600/50 transition enabled:hover:ring-2 enabled:hover:ring-gold enabled:active:scale-[0.98] disabled:opacity-50"
                >
                  <ProductImage path={p.image_path} name={p.name} className="h-28 w-full sm:h-32" />
                  <span
                    className={`absolute left-2 top-2 rounded-full px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}
                  >
                    {badge.text}
                  </span>
                  {inCart > 0 && (
                    <span className="absolute right-2 top-2 rounded-full bg-gold px-2 py-0.5 text-xs font-bold text-slate-deep">
                      x{inCart}
                    </span>
                  )}
                  <div className="p-2.5">
                    <p className="line-clamp-2 text-sm font-medium leading-tight">{p.name}</p>
                    <p className="mt-1 font-bold text-gold">{formatPeso(Number(p.price))}</p>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Cart */}
      <section ref={cartRef} className="h-fit rounded-xl bg-slate-800 p-4 lg:sticky lg:top-16">
        <h2 className="mb-3 text-lg font-bold text-gold">Current sale</h2>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">Tap a product to add it.</p>
        ) : (
          <ul className="mb-3 max-h-72 space-y-2 overflow-y-auto">
            {lines.map(({ product: p, quantity }) => (
              <li key={p.id} className="rounded-lg bg-slate-900 p-2.5">
                <div className="flex justify-between gap-2 text-sm">
                  <span className="font-medium">{p.name}</span>
                  <span className="font-semibold">
                    {formatPeso(roundMoney(Number(p.price) * quantity))}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(p, quantity - 1)}
                      className="h-8 w-8 rounded-lg bg-slate-700 text-lg font-bold hover:bg-slate-600"
                      aria-label={`Decrease ${p.name}`}
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-semibold">{quantity}</span>
                    <button
                      onClick={() => setQty(p, quantity + 1)}
                      disabled={quantity >= p.stock_qty}
                      className="h-8 w-8 rounded-lg bg-slate-700 text-lg font-bold hover:bg-slate-600 disabled:opacity-40"
                      aria-label={`Increase ${p.name}`}
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => setQty(p, 0)}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1 border-t border-slate-700 pt-3 text-sm">
          <p className="flex justify-between text-slate-300">
            <span>Items</span>
            <span>{itemCount}</span>
          </p>
          <p className="flex justify-between text-xl font-bold">
            <span>Total</span>
            <span className="text-gold">{formatPeso(total)}</span>
          </p>
        </div>

        <label className="mt-3 block text-sm text-slate-300" htmlFor="payment-method">
          Payment method
        </label>
        <select
          id="payment-method"
          value={paymentMethod}
          onChange={(e) => {
            setPaymentMethod(e.target.value as PaymentMethod)
            setGcashConfirmed(false)
          }}
          className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-black outline-none focus:border-gold"
        >
          <option value="cash">Cash</option>
          <option value="gcash">GCash</option>
        </select>

        {paymentMethod === 'cash' ? (
          <>
            <label className="mt-3 block text-sm text-slate-300" htmlFor="cash">
              Cash received
            </label>
            <input
              id="cash"
              inputMode="decimal"
              value={cash}
              onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ''))}
              placeholder="0.00"
              className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-lg text-black outline-none focus:border-gold"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                onClick={() => setCash(String(total))}
                disabled={total === 0}
                className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600 disabled:opacity-40"
              >
                Exact
              </button>
              {quick.map((v) => (
                <button
                  key={v}
                  onClick={() => setCash(String(v))}
                  className="rounded-lg bg-slate-700 px-3 py-1 text-sm hover:bg-slate-600"
                >
                  {formatPeso(v)}
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="mt-3 space-y-3">
            <p className="rounded-lg bg-amber-900/40 px-3 py-2 text-sm text-black">
              Confirm the payment in the GCash app before completing this sale. This POS does not
              verify GCash payments automatically.
            </p>
            <label className="block text-sm text-black" htmlFor="payment-reference">
              GCash reference number (optional)
            </label>
            <input
              id="payment-reference"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-black outline-none focus:border-gold"
            />
            <label className="flex items-start gap-2 text-sm text-black">
              <input
                type="checkbox"
                checked={gcashConfirmed}
                onChange={(e) => setGcashConfirmed(e.target.checked)}
                className="mt-1 accent-amber-400"
              />
              I confirmed the GCash payment was received.
            </label>
          </div>
        )}

        {lines.length > 0 && paymentMethod === 'cash' && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-center font-semibold ${
              cashNum >= total ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
            }`}
          >
            {cashNum >= total
              ? `Change: ${formatPeso(change)}`
              : `Insufficient: short by ${formatPeso(shortBy)}`}
          </p>
        )}
        {lines.length > 0 && paymentMethod === 'gcash' && (
          <p className="mt-3 rounded-lg bg-emerald-900/60 px-3 py-2 text-center font-semibold text-black">
            GCash payment due: {formatPeso(total)} · Change: {formatPeso(0)}
          </p>
        )}

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <button
          onClick={complete}
          disabled={!canPay}
          className="mt-3 w-full rounded-lg bg-gold py-3 text-lg font-bold text-slate-deep transition enabled:hover:brightness-110 disabled:opacity-40"
        >
          {busy ? 'Saving...' : paymentMethod === 'gcash' ? 'Confirm GCash sale' : 'Complete sale'}
        </button>
        <button
          onClick={cancel}
          disabled={lines.length === 0 || busy}
          className="mt-2 w-full rounded-lg border border-slate-600 py-2 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-40"
        >
          Cancel sale
        </button>
      </section>

      {/* Mobile quick-jump bar */}
      {lines.length > 0 && (
        <button
          onClick={() => cartRef.current?.scrollIntoView({ behavior: 'smooth' })}
          className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-xl bg-gold px-4 py-3 font-bold text-slate-deep shadow-lg lg:hidden"
        >
          <span>View cart ({itemCount})</span>
          <span>{formatPeso(total)}</span>
        </button>
      )}

      {receipt && <Receipt tx={receipt} onClose={() => setReceipt(null)} />}
    </div>
  )
}