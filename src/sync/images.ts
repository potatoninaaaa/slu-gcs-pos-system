import { db } from '../db/db'
import { supabase } from '../lib/supabase'

export function imageUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

export function brandingUrl(path: string): string {
  return supabase.storage.from('branding').getPublicUrl(path).data.publicUrl
}

// Logos are stored in the same local table, under a "branding/" prefix
export const brandingKey = (path: string) => `branding/${path}`

async function download(key: string, url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) return
    await db.images.put({ path: key, blob: await res.blob(), cached_at: new Date().toISOString() })
  } catch {
    // offline or failed: try again on the next sync
  }
}

export async function cacheProductImages(): Promise<void> {
  const products = await db.products.toArray()
  const wanted = new Set(products.map((p) => p.image_path).filter(Boolean) as string[])

  for (const path of wanted) {
    if (await db.images.get(path)) continue
    await download(path, imageUrl(path)!)
  }

  const cached = (await db.images.toCollection().primaryKeys()) as string[]
  for (const key of cached) {
    if (key.startsWith('branding/')) continue
    if (!wanted.has(key)) await db.images.delete(key)
  }
}

export async function cacheBrandingImages(): Promise<void> {
  const row = await db.kv.get('settings')
  const logos = ((row?.value as { logos?: Record<string, string> } | undefined)?.logos ?? {}) as Record<
    string,
    string
  >
  const wanted = new Set(Object.values(logos).filter(Boolean).map(brandingKey))

  for (const key of wanted) {
    if (await db.images.get(key)) continue
    await download(key, brandingUrl(key.slice('branding/'.length)))
  }

  const cached = (await db.images.toCollection().primaryKeys()) as string[]
  for (const key of cached) {
    if (key.startsWith('branding/') && !wanted.has(key)) await db.images.delete(key)
  }
}