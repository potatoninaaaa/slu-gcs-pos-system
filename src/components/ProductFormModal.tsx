import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import { logActivity } from '../lib/activity'
import { newId } from '../lib/id'
import { resizeImage } from '../lib/image'
import { putProductKeepingStock } from '../lib/inventory'
import { supabase } from '../lib/supabase'
import { inputCls } from '../lib/ui'
import { syncNow } from '../sync/engine'
import type { Category, Product } from '../types'
import Modal from './Modal'
import ProductImage from './ProductImage'

interface Props {
  product: Product | null // null = create
  onClose: () => void
  onSaved: (text: string) => void
}

export default function ProductFormModal({ product, onClose, onSaved }: Props) {
  const { session } = useAuth()
  const online = useOnline()
  const userId = session?.user.id ?? ''
  const categories = useLiveQuery(
    () => db.categories.orderBy('name').filter((c) => !c.is_archived).toArray(),
    [],
    [] as Category[],
  )

  const [name, setName] = useState(product?.name ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [stock, setStock] = useState('0')
  const [low, setLow] = useState(String(product?.low_stock_threshold ?? 5))
  const [available, setAvailable] = useState(product?.is_available ?? true)
  const [description, setDescription] = useState(product?.description ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!online) return setError('Saving a product needs an internet connection.')

    const priceNum = Number(price)
    const stockNum = Number(stock)
    const lowNum = Number(low)
    if (!name.trim() || !sku.trim()) return setError('Name and SKU are required.')
    if (price === '' || !(priceNum >= 0)) return setError('Enter a valid price.')
    if (!product && (!Number.isInteger(stockNum) || stockNum < 0))
      return setError('Stock must be a whole number, 0 or more.')
    if (!Number.isInteger(lowNum) || lowNum < 0)
      return setError('Low-stock threshold must be a whole number.')

    setBusy(true)
    let uploadedPath: string | null = null
    let blob: Blob | null = null
    try {
      if (file) {
        blob = await resizeImage(file)
        uploadedPath = `${newId()}.jpg`
        const up = await supabase.storage
          .from('product-images')
          .upload(uploadedPath, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
      }
      const discardUpload = async () => {
        if (uploadedPath) await supabase.storage.from('product-images').remove([uploadedPath])
      }

      const fields = {
        name: name.trim(),
        sku: sku.trim(),
        description: description.trim() || null,
        category_id: categoryId || null,
        price: priceNum,
        low_stock_threshold: lowNum,
        is_available: available,
      }

      if (product) {
        const changes: Record<string, { from: unknown; to: unknown }> = {}
        for (const k of Object.keys(fields) as (keyof typeof fields)[]) {
          const before = k === 'price' ? Number(product[k]) : product[k]
          if (before !== fields[k]) changes[k] = { from: before, to: fields[k] }
        }
        if (uploadedPath) changes.image = { from: product.image_path, to: uploadedPath }
        if (Object.keys(changes).length === 0) {
          onClose()
          return
        }

        const { data, error: err } = await supabase
          .from('products')
          .update({ ...fields, image_path: uploadedPath ?? product.image_path })
          .eq('id', product.id)
          .select()
          .single()
        if (err) {
          await discardUpload()
          throw err
        }
        await putProductKeepingStock(data as Product)
        if (uploadedPath && blob) {
          await db.images.put({ path: uploadedPath, blob, cached_at: new Date().toISOString() })
          if (product.image_path) {
            await supabase.storage.from('product-images').remove([product.image_path])
          }
        }
        await logActivity(userId, 'product_updated', 'product', product.id, {
          name: fields.name,
          sku: fields.sku,
          changes,
        })
        void syncNow()
        onSaved(`${fields.name} updated.`)
      } else {
        const { data, error: err } = await supabase
          .from('products')
          .insert({
            ...fields,
            stock_qty: stockNum,
            image_path: uploadedPath,
            created_by: userId,
          })
          .select()
          .single()
        if (err) {
          await discardUpload()
          throw err
        }
        await db.products.put(data as Product)
        if (uploadedPath && blob) {
          await db.images.put({ path: uploadedPath, blob, cached_at: new Date().toISOString() })
        }
        await logActivity(userId, 'product_created', 'product', (data as Product).id, {
          name: fields.name,
          sku: fields.sku,
          price: priceNum,
          stock: stockNum,
        })
        void syncNow()
        onSaved(`${fields.name} added.`)
      }
    } catch (err) {
      const e2 = err as { code?: string; message?: string }
      setError(
        e2.code === '23505' ? 'That SKU is already used.' : (e2.message ?? 'Could not save the product.'),
      )
    } finally {
      setBusy(false)
    }
  }

  const pickBtn =
    'cursor-pointer rounded-lg bg-slate-700 px-3 py-2 text-sm font-semibold hover:bg-slate-600'

  return (
    <Modal title={product ? 'Edit product' : 'Add product'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="mb-1 block text-sm text-slate-300">Photo</label>
          <div className="mb-2">
            {preview ? (
              <img src={preview} alt="Preview" className="h-32 w-32 rounded-lg object-cover" />
            ) : product ? (
              <ProductImage path={product.image_path} name={product.name} className="h-32 w-32 rounded-lg" />
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            <label className={pickBtn}>
              Take photo
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className={pickBtn}>
              {product ? 'Replace from gallery' : 'Choose from gallery'}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">Name</label>
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">SKU / product code</label>
          <input className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Category</label>
          <select className={inputCls} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-sm text-slate-300">Price</label>
            <input
              className={inputCls}
              inputMode="decimal"
              value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))}
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Stock</label>
            {product ? (
              <p className="px-1 py-2 text-slate-300">{product.stock_qty}</p>
            ) : (
              <input
                className={inputCls}
                inputMode="numeric"
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))}
                required
              />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Low at</label>
            <input
              className={inputCls}
              inputMode="numeric"
              value={low}
              onChange={(e) => setLow(e.target.value.replace(/\D/g, ''))}
              required
            />
          </div>
        </div>
        {product && (
          <p className="text-xs text-slate-400">Change stock with the Stock button, so it is recorded with a reason.</p>
        )}
        <label className="flex items-center gap-2 text-sm text-slate-200">
          <input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />
          Available for sale
        </label>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Description (optional)</label>
          <textarea
            className={inputCls}
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="rounded-lg bg-red-900/50 px-3 py-2 text-sm text-red-200">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-gold py-2.5 font-bold text-slate-deep disabled:opacity-50"
        >
          {busy ? 'Saving...' : product ? 'Save changes' : 'Add product'}
        </button>
      </form>
    </Modal>
  )
}