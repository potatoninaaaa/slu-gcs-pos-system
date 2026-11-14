import { useLiveQuery } from 'dexie-react-hooks'
import SyncBadge from '../components/SyncBadge'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import { useSync } from '../hooks/useSync'
import { formatDateTime } from '../lib/format'

export default function Home() {
  const { profile, session, signOut } = useAuth()
  const online = useOnline()
  const { lastSyncAt, lastError, pending } = useSync()
  const products = useLiveQuery(() => db.products.count(), [], 0)
  const categories = useLiveQuery(() => db.categories.count(), [], 0)
  const images = useLiveQuery(() => db.images.count(), [], 0)

  return (
    <div className="min-h-screen bg-slate-deep p-6 text-white">
      <div className="mx-auto max-w-md space-y-3 rounded-2xl bg-slate-800 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-gold">GCS POS: setup check</h1>
          <SyncBadge />
        </div>
        <p>Signed in as: {session?.user.email}</p>
        <p>Role: {profile ? profile.role : 'not loaded'}</p>
        <p>Network: {online ? 'Online' : 'Offline'}</p>
        <p>
          Last sync: {lastSyncAt ? formatDateTime(lastSyncAt) : 'not yet'}
        </p>
        {lastError && <p className="text-red-300">Sync error: {lastError}</p>}
        <p>Local categories: {categories}</p>
        <p>Local products: {products}</p>
        <p>Cached images: {images}</p>
        <p>Waiting to sync: {pending}</p>
        <button
          onClick={signOut}
          className="mt-2 rounded-lg bg-gold px-4 py-2 font-semibold text-slate-deep"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}