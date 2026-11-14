import { useOnline } from '../hooks/useOnline'
import { useSync } from '../hooks/useSync'

export default function SyncBadge() {
  const online = useOnline()
  const { running, pending, failed, lastError, syncNow } = useSync()

  let label = 'All synced'
  let color = 'bg-emerald-100 text-emerald-800'

  if (!online) {
    label = pending > 0 ? `Offline: ${pending} saved locally` : 'Offline'
    color = 'bg-amber-100 text-amber-800'
  } else if (running) {
    label = 'Syncing...'
    color = 'bg-sky-100 text-sky-800'
  } else if (failed > 0) {
    label = `${failed} need attention`
    color = 'bg-red-100 text-red-800'
  } else if (pending > 0) {
    label = `${pending} waiting to sync`
    color = 'bg-amber-100 text-amber-800'
  } else if (lastError) {
    label = 'Sync problem'
    color = 'bg-red-100 text-red-800'
  }

  return (
    <button
      onClick={() => void syncNow()}
      title={lastError ?? 'Click to sync now'}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${color}`}
    >
      {label}
    </button>
  )
}