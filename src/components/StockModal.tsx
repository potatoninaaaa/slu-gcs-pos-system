import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { adjustStockLocal, InventoryError } from '../lib/inventory'
import { inputCls } from '../lib/ui'
import { syncNow } from '../sync/engine'
import type { Product } from '../types'
import Modal from './Modal'

interface Props {
  product: Product
  onClose: () => void
  onDone: (text: string) => void
}

type Mode = 'add' | 'deduct' | 'set'

export default function StockModal({ product, onClose, onDone }: Props) {
  const { session } = useAuth()
  const [mode, setMode] = useState<Mode>('add')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const n = qty === '' ? NaN : Number(qty)
  const after = Number.isFinite(n)
    ? mode === 'add'
      ? product.stock_qty + n
      : mode === 'deduct'
        ? product.stock_qty - n
        : n
    : null

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await adjustStockLocal({
        productId: product.id,
        mode,
        quantity: n,
        reason,
        userId: session?.user.id ?? '',
      })
      void syncNow()
      onDone(`Stock updated for ${product.name}.`)
    } catch (err) {
      setError(err instanceof InventoryError ? err.message : 'Could not save the adjustment.')
    } finally {
      setBusy(false)
    }
  }

  const tab = (m: Mode, label: string) => (
    <button
      type="button"
      onClick={() => setMode(m)}
      className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
        mode === m ? 'bg-gold text-white' : 'bg-slate-700 text-slate-200'
      }`}
    >
      {label}
    </button>
  )

  return (
    <Modal title="Adjust stock" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-sm text-slate-300">
          {product.name}: currently <strong>{product.stock_qty}</strong> in stock
        </p>
        <div className="flex gap-2">
          {tab('add', 'Add')}
          {tab('deduct', 'Deduct')}
          {tab('set', 'Set to')}
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">
            {mode === 'set' ? 'New stock count' : 'Quantity'}
          </label>
          <input
            className={inputCls}
            inputMode="numeric"
            value={qty}
            onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Reason (required)</label>
          <input
            className={inputCls}
            list="stock-reasons"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
          />
          <datalist id="stock-reasons">
            <option value="New delivery" />
            <option value="Damaged" />
            <option value="Expired" />
            <option value="Counting correction" />
            <option value="Returned" />
            <option value="Donation" />
          </datalist>
        </div>
        {after !== null && (
          <p className={`text-sm ${after < 0 ? 'text-red-600' : 'text-slate-300'}`}>
            New stock will be: <strong>{after}</strong>
          </p>
        )}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-gold py-2.5 font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Save adjustment'}
        </button>
        <p className="text-center text-xs text-slate-400">Works offline. It uploads when online.</p>
      </form>
    </Modal>
  )
}