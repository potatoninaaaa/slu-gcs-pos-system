import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import { supabase } from '../lib/supabase'

export default function Home() {
  const { profile, session, signOut } = useAuth()
  const online = useOnline()
  const [cloud, setCloud] = useState<string>('Checking...')
  const localProducts = useLiveQuery(() => db.products.count(), [], 0)

  useEffect(() => {
    if (!online) {
      setCloud('Offline (cloud not reachable)')
      return
    }
    supabase
      .from('categories')
      .select('*', { count: 'exact', head: true })
      .then(({ count, error }) => {
        setCloud(error ? `Error: ${error.message}` : `Connected. ${count} categories found`)
      })
  }, [online])

  return (
    <div className="min-h-screen bg-slate-deep p-6 text-white">
      <div className="mx-auto max-w-md space-y-3 rounded-2xl bg-slate-800 p-6">
        <h1 className="text-xl font-bold text-gold">GCS POS: setup check</h1>
        <p>Signed in as: {session?.user.email}</p>
        <p>Role: {profile ? profile.role : 'not loaded'}</p>
        <p>Network: {online ? 'Online' : 'Offline'}</p>
        <p>Cloud database: {cloud}</p>
        <p>Local database: {localProducts} products stored</p>
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