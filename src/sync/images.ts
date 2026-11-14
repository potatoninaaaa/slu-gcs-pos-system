import { db } from '../db/db'
import { supabase } from '../lib/supabase'

export function imageUrl(path: string | null): string | null {
  if (!path) return null
  return supabase.storage.from('product-images').getPublicUrl(path).data.publicUrl
}

// Downloads any product image we don't already have, and removes unused ones.
export async function cacheProductImages(): Promise<void> {
  const products = await db.products.toArray()
  const wanted = new Set(products.map((p) => p.image_path).filter(Boolean) as string[])

  for (const path of wanted) {
    const existing = await db.images.get(path)
    if (existing) continue
    try {
      const res = await fetch(imageUrl(path)!)
      if (!res.ok) continue
      await db.images.put({ path, blob: await res.blob(), cached_at: new Date().toISOString() })
    } catch {
      // offline or failed: try again on the next sync
    }
  }

  const cached = await db.images.toCollection().primaryKeys()
  for (const path of cached) {
    if (!wanted.has(path as string)) await db.images.delete(path as string)
  }
}