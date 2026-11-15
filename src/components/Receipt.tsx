import { formatDateTime, formatPeso } from '../lib/format'
import type { LocalTransaction } from '../types'

interface Props {
  tx: LocalTransaction
  onClose: () => void
}

export default function Receipt({ tx, onClose }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 text-slate-900 shadow-xl">
        <div className="print-area bg-white p-2 font-mono text-sm">
          <div className="text-center">
            <p className="text-base font-bold">Green Core Society</p>
            <p>Saint Louis University</p>
            <p className="mt-1">Official Receipt</p>
          </div>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p>Receipt: {tx.receipt_no}</p>
          <p>Date: {formatDateTime(tx.created_at)}</p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          {tx.items.map((i) => (
            <div key={i.product_id} className="mb-1">
              <p>{i.product_name}</p>
              <p className="flex justify-between">
                <span>
                  {i.quantity} x {formatPeso(i.unit_price)}
                </span>
                <span>{formatPeso(i.line_total)}</span>
              </p>
            </div>
          ))}
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="flex justify-between font-bold">
            <span>TOTAL</span>
            <span>{formatPeso(tx.total_amount)}</span>
          </p>
          <p className="flex justify-between">
            <span>Cash</span>
            <span>{formatPeso(tx.cash_received)}</span>
          </p>
          <p className="flex justify-between">
            <span>Change</span>
            <span>{formatPeso(tx.change_given)}</span>
          </p>
          <div className="my-2 border-t border-dashed border-slate-400" />
          <p className="text-center">Thank you for supporting GCS!</p>
        </div>

        <p className="mt-3 text-center text-xs text-slate-500">
          Saved on this device. It uploads to the cloud automatically when online.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-lg bg-slate-deep py-2.5 font-semibold text-white"
          >
            Print receipt
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg bg-gold py-2.5 font-semibold text-slate-deep"
          >
            New sale
          </button>
        </div>
      </div>
    </div>
  )
}