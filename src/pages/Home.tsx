import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import type { AppSettings } from '../hooks/useSettings'
import { useSync } from '../hooks/useSync'
import { formatDateTime } from '../lib/format'
import { brandingKey } from '../sync/images'

interface Facts {
  profileCached: boolean
  products: number
  photosWanted: number
  photosCached: number
  logosWanted: number
  logosCached: number
  sales: number
}
const EMPTY: Facts = {
  profileCached: false,
  products: 0,
  photosWanted: 0,
  photosCached: 0,
  logosWanted: 0,
  logosCached: 0,
  sales: 0,
}

function Row({ ok, label, detail }: { ok: boolean | null; label: string; detail?: string }) {
  const mark = ok === null ? '…' : ok ? '✓' : '✗'
  const cls = ok === null ? 'text-slate-400' : ok ? 'text-emerald-600' : 'text-red-600'
  return (
    <li className="flex items-start gap-3 py-2">
      <span className={`w-5 text-center text-lg font-bold ${cls}`}>{mark}</span>
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {detail && <span className="block text-xs text-slate-400">{detail}</span>}
      </span>
    </li>
  )
}

export default function Home() {
  const { profile, session } = useAuth()
  const online = useOnline()
  const { lastSyncAt, lastError, pending } = useSync()
  const [sw, setSw] = useState<boolean | null>(null)
  const [persisted, setPersisted] = useState<boolean | null>(null)

  const facts = useLiveQuery(
    async (): Promise<Facts> => {
      const products = await db.products.filter((p) => !p.is_archived).toArray()
      const withPhoto = products.filter((p) => p.image_path)
      let photosCached = 0
      for (const p of withPhoto) if (await db.images.get(p.image_path as string)) photosCached++

      const settings = (await db.kv.get('settings'))?.value as AppSettings | undefined
      const logoPaths = Object.values(settings?.logos ?? {}).filter(Boolean) as string[]
      let logosCached = 0
      for (const l of logoPaths) if (await db.images.get(brandingKey(l))) logosCached++

      return {
        profileCached: !!(await db.kv.get('profile')),
        products: products.length,
        photosWanted: withPhoto.length,
        photosCached,
        logosWanted: logoPaths.length,
        logosCached,
        sales: await db.transactions.count(),
      }
    },
    [],
    EMPTY,
  )

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .getRegistration()
        .then((r) => setSw(!!r?.active))
        .catch(() => setSw(false))
    } else {
      setSw(false)
    }
    if (navigator.storage?.persisted) {
      navigator.storage
        .persisted()
        .then(setPersisted)
        .catch(() => setPersisted(false))
    } else {
      setPersisted(false)
    }
  }, [])

  const photosOk = facts.photosCached >= facts.photosWanted
  const logosOk = facts.logosCached >= facts.logosWanted
  const ready =
    sw === true && facts.profileCached && facts.products > 0 && photosOk && logosOk && pending === 0

  return (
    <div className="mx-auto max-w-lg space-y-4 p-3">
      <div
        className={`rounded-xl p-4 font-semibold ${
          ready ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'
        }`}
      >
        {ready
          ? 'This device is ready to work offline.'
          : 'Not fully ready for offline use yet. Check the items below.'}
      </div>

      <div className="rounded-xl bg-slate-800 p-4">
        <h1 className="mb-1 text-lg font-bold text-gold">Offline readiness</h1>
        <ul className="divide-y divide-slate-700">
          <Row
            ok={sw}
            label="App saved for offline opening"
            detail={sw === false ? 'Only works on the deployed or preview build, not npm run dev.' : undefined}
          />
          <Row ok={facts.profileCached} label="Sign-in details saved on this device" />
          <Row
            ok={facts.products > 0}
            label={`Products downloaded (${facts.products})`}
            detail={facts.products === 0 ? 'Connect to the internet and wait for sync.' : undefined}
          />
          <Row ok={photosOk} label={`Product photos saved (${facts.photosCached} of ${facts.photosWanted})`} />
          <Row ok={logosOk} label={`Logos saved (${facts.logosCached} of ${facts.logosWanted})`} />
          <Row
            ok={persisted}
            label="Storage protected from automatic cleanup"
            detail={
              persisted === false
                ? 'Install the app (Add to Home screen) to improve the odds that the browser keeps it.'
                : undefined
            }
          />
          <Row ok={pending === 0} label={`Nothing waiting to upload (${pending})`} />
        </ul>
      </div>

      <div className="space-y-1 rounded-xl bg-slate-800 p-4 text-sm text-slate-300">
        <p>Signed in as: {session?.user.email}</p>
        <p>Role: {profile ? profile.role : 'not loaded'}</p>
        <p>Network: {online ? 'Online' : 'Offline'}</p>
        <p>Last sync: {lastSyncAt ? formatDateTime(lastSyncAt) : 'not yet this session'}</p>
        <p>Sales saved on this device: {facts.sales}</p>
        {lastError && <p className="text-red-600">Sync error: {lastError}</p>}
      </div>
    </div>
  )
}