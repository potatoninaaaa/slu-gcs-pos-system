import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState } from 'react'
import { db } from '../db/db'
import { imageUrl } from '../sync/images'

interface Props {
  path: string | null
  name: string
  className?: string
}

export default function ProductImage({ path, name, className = '' }: Props) {
  const cached = useLiveQuery(() => (path ? db.images.get(path) : undefined), [path])
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

  const src = blobUrl ?? (navigator.onLine ? imageUrl(path) : null)

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center bg-slate-700 text-2xl font-bold text-slate-400 ${className}`}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    )
  }
  return <img src={src} alt={name} loading="lazy" className={`object-cover ${className}`} />
}