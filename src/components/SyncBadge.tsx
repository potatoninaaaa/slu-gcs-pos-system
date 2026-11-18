import { useOnline } from '../hooks/useOnline'
import { useSync } from '../hooks/useSync'

export default function SyncBadge({ className = '' }: { className?: string }) {
  const online = useOnline()
  const { running, pending, failed, lastError, syncNow } = useSync()

  let label = 'All synced'
  let color = 'bg-gold/10 text-slate-50 ring-gold/40'
  let dot = 'bg-gold'

  if (!online) {
    label = pending > 0 ? `Offline: ${pending} saved locally` : 'Offline'
    color = 'bg-amber-50 text-amber-800 ring-amber-300'
    dot = 'bg-amber-500'
  } else if (running) {
    label = 'Syncing...'
    color = 'bg-sky-50 text-sky-800 ring-sky-300'
    dot = 'bg-sky-500 animate-pulse'
  } else if (failed > 0) {
    label = `${failed} need attention`
    color = 'bg-red-50 text-red-700 ring-red-300'
    dot = 'bg-red-500'
  } else if (pending > 0) {
    label = `${pending} waiting to sync`
    color = 'bg-amber-50 text-amber-800 ring-amber-300'
    dot = 'bg-amber-500'
  } else if (lastError) {
    label = 'Sync problem'
    color = 'bg-red-50 text-red-700 ring-red-300'
    dot = 'bg-red-500'
  }

  return (
    <button
      onClick={() => void syncNow()}
      title={lastError ?? 'Click to sync now'}
      className={`flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-2 text-xs font-semibold ring-1 ${color} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${dot}`} />
      {label}
    </button>
  )
}