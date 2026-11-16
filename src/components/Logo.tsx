import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { useSettings } from '../hooks/useSettings'
import { brandingKey, brandingUrl } from '../sync/images'

export type LogoSlot = 'slu' | 'gcs' | 'samcis'

export const logoNames: Record<LogoSlot, string> = {
  slu: 'Saint Louis University',
  gcs: 'Green Core Society',
  samcis: 'SAMCIS',
}

export default function Logo({ slot, className = 'h-10' }: { slot: LogoSlot; className?: string }) {
  const settings = useSettings()
  const path = settings.logos?.[slot]
  const cached = useLiveQuery(() => (path ? db.images.get(brandingKey(path)) : undefined), [path])
  const [blobUrl, setBlobUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!cached?.blob) {
      setBlobUrl(null)
      return undefined
    }
    const url = URL.createObjectURL(cached.blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [cached])

  const src = blobUrl ?? (path && navigator.onLine ? brandingUrl(path) : null)
  if (!src) return null
  // Shown as uploaded: original colors and proportions
  return <img src={src} alt={logoNames[slot]} className={`w-auto object-contain ${className}`} />
}

export function LogoRow({ className = 'h-10' }: { className?: string }) {
  return (
    <div className="flex items-center justify-center gap-3">
      <Logo slot="slu" className={className} />
      <Logo slot="gcs" className={className} />
      <Logo slot="samcis" className={className} />
    </div>
  )
}