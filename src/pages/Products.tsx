import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useState, type FormEvent } from 'react'
import ProductImage from '../components/ProductImage'
import { db } from '../db/db'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'
import { formatPeso } from '../lib/format'
import { newId } from '../lib/id'
import { resizeImage } from '../lib/image'
import { supabase } from '../lib/supabase'
import type { Product } from '../types'

const input =
  'w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white outline-none focus:border-gold'

export default function Products() {
  const { profile, session } = useAuth()
  const online = useOnline()
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [], [])
  const products = useLiveQuery(() => db.products.orderBy('name').toArray(), [], [] as Product[])

  const [name, setName] = useState('')
  const [sku, setSku] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [price, setPrice] = useState('')
  const [stock, setStock] = useState('0')
  const [low, setLow] = useState('5')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return undefined
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (profile?.role !== 'admin') {
    return <p className="p-6 text-center text-slate-400">Only administrators can manage products.</p>
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setMsg(null)
    if (!online) {
      setMsg({ ok: false, text: 'Adding a product needs an internet connection.' })
      return
    }
    const priceNum = Number(price)
    const stockNum = Number(stock)
    const lowNum = Number(low)
    if (!name.trim() || !sku.trim()) return setMsg({ ok: false, text: 'Name and SKU are required.' })
    if (!(priceNum >= 0) || price === '') return setMsg({ ok: false, text: 'Enter a valid price.' })
    if (!Number.isInteger(stockNum) || stockNum < 0)
      return setMsg({ ok: false, text: 'Stock must be a whole number, 0 or more.' })
    if (!Number.isInteger(lowNum) || lowNum < 0)
      return setMsg({ ok: false, text: 'Low-stock threshold must be a whole number.' })

    setBusy(true)
    let imagePath: string | null = null
    let blob: Blob | null = null
    try {
      if (file) {
        blob = await resizeImage(file)
        imagePath = `${newId()}.jpg`
        const up = await supabase.storage
          .from('product-images')
          .upload(imagePath, blob, { contentType: 'image/jpeg' })
        if (up.error) throw up.error
      }

      const { data, error } = await supabase
        .from('products')
        .insert({
          name: name.trim(),
          sku: sku.trim(),
          description: description.trim() || null,
          category_id: categoryId || null,
          price: priceNum,
          stock_qty: stockNum,
          low_stock_threshold: lowNum,
          image_path: imagePath,
          created_by: session?.user.id,
        })
        .select()
        .single()

      if (error) {
        if (imagePath) await supabase.storage.from('product-images').remove([imagePath])
        throw error
      }

      // Show it immediately on this device; the next sync confirms it
      await db.products.put(data as Product)
      if (imagePath && blob) {
        await db.images.put({ path: imagePath, blob, cached_at: new Date().toISOString() })
      }

      setName('')
      setSku('')
      setPrice('')
      setStock('0')
      setDescription('')
      setFile(null)
      setMsg({ ok: true, text: 'Product added.' })
    } catch (err) {
      const e2 = err as { code?: string; message?: string }
      setMsg({
        ok: false,
        text: e2.code === '23505' ? 'That SKU is already used.' : (e2.message ?? 'Could not add the product.'),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-3 lg:grid-cols-[380px_1fr]">
      <form onSubmit={onSubmit} className="h-fit space-y-3 rounded-xl bg-slate-800 p-4">
        <h2 className="text-lg font-bold text-gold">Add product</h2>

        <div>
          <label className="mb-1 block text-sm text-slate-300">Photo (camera or gallery)</label>
          {preview && (
            <img src={preview} alt="Preview" className="mb-2 h-32 w-32 rounded-lg object-cover" />
          )}
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-300 file:mr-3 file:rounded-lg file:border-0 file:bg-gold file:px-3 file:py-2 file:font-semibold file:text-slate-deep"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm text-slate-300">Name</label>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">SKU / product code</label>
          <input className={input} value={sku} onChange={(e) => setSku(e.target.value)} required />
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Category</label>
          <select className={input} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
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
            <input className={input} inputMode="decimal" value={price}
              onChange={(e) => setPrice(e.target.value.replace(/[^0-9.]/g, ''))} required />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Stock</label>
            <input className={input} inputMode="numeric" value={stock}
              onChange={(e) => setStock(e.target.value.replace(/\D/g, ''))} required />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-300">Low at</label>
            <input className={input} inputMode="numeric" value={low}
              onChange={(e) => setLow(e.target.value.replace(/\D/g, ''))} required />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm text-slate-300">Description (optional)</label>
          <textarea className={input} rows={2} value={description}
            onChange={(e) => setDescription(e.target.value)} />
        </div>

        {msg && (
          <p className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/50 text-red-200'}`}>
            {msg.text}
          </p>
        )}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-gold py-2.5 font-bold text-slate-deep disabled:opacity-50"
        >
          {busy ? 'Saving...' : 'Add product'}
        </button>
      </form>

      <section className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-3 text-lg font-bold text-gold">Products on this device ({products.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-slate-400">
              <tr>
                <th className="py-2 pr-2"></th>
                <th className="py-2 pr-2">Name</th>
                <th className="py-2 pr-2">SKU</th>
                <th className="py-2 pr-2">Price</th>
                <th className="py-2">Stock</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-700">
                  <td className="py-2 pr-2">
                    <ProductImage path={p.image_path} name={p.name} className="h-10 w-10 rounded-lg" />
                  </td>
                  <td className="py-2 pr-2">{p.name}</td>
                  <td className="py-2 pr-2 text-slate-400">{p.sku}</td>
                  <td className="py-2 pr-2">{formatPeso(Number(p.price))}</td>
                  <td className="py-2">{p.stock_qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}