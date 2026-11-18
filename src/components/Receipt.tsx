import { useSettings } from '../hooks/useSettings'
import { formatDateTime, formatPeso } from '../lib/format'
import type { LocalTransaction } from '../types'
import { LogoRow } from './Logo'

interface Props {
  tx: LocalTransaction
  onClose: () => void
  closeLabel?: string
}

export default function Receipt({ tx, onClose, closeLabel = 'New sale' }: Props) {
  const settings = useSettings()
  const org = settings.organization ?? {}

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto bg-[#0f3d2e]/35 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-3xl bg-slate-800 p-4 text-[#12372a] shadow-xl ring-1 ring-slate-600/60">
        <div className="print-area rounded-2xl bg-white p-3 font-mono text-sm text-[#12372a] ring-1 ring-slate-600/50">
          <div className="text-center">
            <LogoRow className="mb-2 h-10" />
            <p className="text-base font-bold">{org.name || 'Green Core Society'}</p>
            <p>{org.school || 'Saint Louis University'}</p>
            <p className="mt-1 font-semibold">
              {tx.status === 'cancelled' ? 'CANCELLED SALE' : 'Official Receipt'}
            </p>
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
          <p className="flex justify-between text-base font-bold">
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
          <p className="text-center">{org.receipt_footer || 'Thank you for supporting GCS!'}</p>
        </div>

        <p className="mt-3 text-center text-xs text-slate-400">
          {tx.sync_status === 'synced'
            ? 'Synced to the cloud.'
            : 'Saved on this device. It uploads to the cloud automatically when online.'}
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 rounded-full bg-slate-700 py-3 font-semibold text-slate-50 hover:bg-slate-600"
          >
            Print receipt
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-full bg-gold py-3 font-bold text-white hover:brightness-110"
          >
            {closeLabel}
          </button>
        </div>
      </div>
    </div>
  )
}