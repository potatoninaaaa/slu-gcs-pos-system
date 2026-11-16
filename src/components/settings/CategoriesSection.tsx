import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { db } from '../../db/db'
import { useAuth } from '../../hooks/useAuth'
import { useOnline } from '../../hooks/useOnline'
import { logActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'
import { inputCls } from '../../lib/ui'
import { syncNow } from '../../sync/engine'
import type { Category, Product } from '../../types'
import Msg, { type Notice } from '../Msg'

export default function CategoriesSection() {
  const { session } = useAuth()
  const online = useOnline()
  const userId = session?.user.id ?? ''
  const categories = useLiveQuery(() => db.categories.orderBy('name').toArray(), [], [] as Category[])
  const products = useLiveQuery(() => db.products.toArray(), [], [] as Product[])
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<Notice | null>(null)

  const count = (id: string) => products.filter((p) => p.category_id === id).length
  const needOnline = () => {
    if (online) return false
    setMsg({ ok: false, text: 'Managing categories needs an internet connection.' })
    return true
  }
  const fail = (e: { code?: string; message?: string }) =>
    setMsg({ ok: false, text: e.code === '23505' ? 'That category name already exists.' : (e.message ?? 'Failed.') })

  const add = async () => {
    if (needOnline() || !name.trim()) return
    const { data, error } = await supabase.from('categories').insert({ name: name.trim() }).select().single()
    if (error) return fail(error)
    await db.categories.put(data as Category)
    await logActivity(userId, 'category_created', 'category', (data as Category).id, { name: name.trim() })
    setName('')
    setMsg({ ok: true, text: 'Category added.' })
    void syncNow()
  }

  const rename = async (c: Category) => {
    if (needOnline()) return
    const next = window.prompt('Rename category', c.name)?.trim()
    if (!next || next === c.name) return
    const { data, error } = await supabase.from('categories').update({ name: next }).eq('id', c.id).select().single()
    if (error) return fail(error)
    await db.categories.put(data as Category)
    await logActivity(userId, 'category_renamed', 'category', c.id, { from: c.name, to: next })
    setMsg({ ok: true, text: 'Category renamed.' })
  }

  const toggleArchive = async (c: Category) => {
    if (needOnline()) return
    const { data, error } = await supabase
      .from('categories')
      .update({ is_archived: !c.is_archived })
      .eq('id', c.id)
      .select()
      .single()
    if (error) return fail(error)
    await db.categories.put(data as Category)
    await logActivity(userId, c.is_archived ? 'category_restored' : 'category_archived', 'category', c.id, {
      name: c.name,
    })
  }

  const remove = async (c: Category) => {
    if (needOnline()) return
    if (count(c.id) > 0) {
      return setMsg({ ok: false, text: `${c.name} still has products. Move them first, or archive the category.` })
    }
    if (!window.confirm(`Delete the category "${c.name}"?`)) return
    const { error } = await supabase.from('categories').delete().eq('id', c.id)
    if (error) return fail(error)
    await db.categories.delete(c.id)
    await logActivity(userId, 'category_deleted', 'category', c.id, { name: c.name })
    setMsg({ ok: true, text: 'Category deleted.' })
  }

  const btn = 'rounded-lg bg-slate-700 px-2.5 py-1 text-xs font-semibold hover:bg-slate-600'

  return (
    <div className="rounded-xl bg-slate-800 p-4">
      <h2 className="mb-3 font-semibold text-gold">Product categories</h2>
      <div className="mb-4 flex gap-2">
        <input
          className={inputCls}
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void add()}
        />
        <button onClick={() => void add()} className="rounded-lg bg-gold px-4 font-bold text-slate-deep">
          Add
        </button>
      </div>
      <ul className="divide-y divide-slate-700">
        {categories.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span className={c.is_archived ? 'text-slate-500 line-through' : ''}>
              {c.name} <span className="text-xs text-slate-500">({count(c.id)} products)</span>
            </span>
            <span className="flex gap-1.5">
              <button className={btn} onClick={() => void rename(c)}>
                Rename
              </button>
              <button className={btn} onClick={() => void toggleArchive(c)}>
                {c.is_archived ? 'Restore' : 'Archive'}
              </button>
              <button className={`${btn} text-red-300`} onClick={() => void remove(c)}>
                Delete
              </button>
            </span>
          </li>
        ))}
      </ul>
      <Msg n={msg} />
    </div>
  )
}