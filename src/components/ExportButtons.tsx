import { useState } from 'react'
import { exportPdf, exportXlsx, type TableDoc } from '../lib/exporter'

interface Props {
  label?: string
  build: () => TableDoc | Promise<TableDoc>
  disabled?: boolean
}

type Kind = 'xlsx' | 'pdf'

export default function ExportButtons({ label, build, disabled }: Props) {
  const [busy, setBusy] = useState<Kind | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = async (kind: Kind) => {
    setBusy(kind)
    setError(null)
    try {
      const doc = await build()
      if (kind === 'xlsx') await exportXlsx(doc)
      else await exportPdf(doc)
    } catch (e) {
      setError((e as Error).message || 'Export failed.')
    } finally {
      setBusy(null)
    }
  }

  const btn =
    'rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-semibold hover:bg-slate-600 disabled:opacity-40'

  return (
    <div>
      <div className="flex items-center gap-2">
        {label && <span className="text-sm text-slate-400">{label}:</span>}
        <button className={btn} disabled={disabled || busy !== null} onClick={() => void run('xlsx')}>
          {busy === 'xlsx' ? 'Preparing...' : 'Excel'}
        </button>
        <button className={btn} disabled={disabled || busy !== null} onClick={() => void run('pdf')}>
          {busy === 'pdf' ? 'Preparing...' : 'PDF'}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-300">{error}</p>}
    </div>
  )
}