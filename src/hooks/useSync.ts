import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { getSyncState, subscribeSync, syncNow, type SyncState } from '../sync/engine'

export function useSync() {
  const [state, setState] = useState<SyncState>(getSyncState())
  useEffect(() => subscribeSync(setState), [])
  const pending = useLiveQuery(() => db.outbox.count(), [], 0)
  const failed = useLiveQuery(
    () => db.outbox.filter((o) => (o.attempts ?? 0) > 0).count(),
    [],
    0,
  )
  return { ...state, pending, failed, syncNow }
}