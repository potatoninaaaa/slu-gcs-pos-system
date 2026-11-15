import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'

interface ProfileLite {
  id: string
  email: string
  full_name: string | null
}

// Returns a function that turns a user id into a readable name
export function useProfileNames() {
  const list = useLiveQuery(
    async () => ((await db.kv.get('profiles'))?.value as ProfileLite[] | undefined) ?? [],
    [],
    [] as ProfileLite[],
  )
  return (id: string | null | undefined): string => {
    if (!id) return 'System'
    const p = list.find((x) => x.id === id)
    return p ? p.full_name || p.email : 'Unknown user'
  }
}