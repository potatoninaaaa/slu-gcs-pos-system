import { useEffect, useState } from 'react'
import { db } from '../../db/db'
import { useAuth } from '../../hooks/useAuth'
import { useOnline } from '../../hooks/useOnline'
import { useSettings } from '../../hooks/useSettings'
import { logActivity } from '../../lib/activity'
import { saveSetting } from '../../lib/settings'
import { supabase } from '../../lib/supabase'
import { inputCls } from '../../lib/ui'
import { syncNow } from '../../sync/engine'
import Msg, { type Notice } from '../Msg'

export default function GeneralSection() {
  const { session } = useAuth()
  const online = useOnline()
  const settings = useSettings()
  const userId = session?.user.id ?? ''
  const org = settings.organization ?? {}
  const savedLow = settings.inventory?.default_low_stock_threshold ?? 5

  const [name, setName] = useState('')
  const [school, setSchool] = useState('')
  const [department, setDepartment] = useState('')
  const [footer, setFooter] = useState('')
  const [low, setLow] = useState('5')
  const [orgMsg, setOrgMsg] = useState<Notice | null>(null)
  const [lowMsg, setLowMsg] = useState<Notice | null>(null)

  useEffect(() => {
    setName(org.name ?? '')
    setSchool(org.school ?? '')
    setDepartment(org.department ?? '')
    setFooter(org.receipt_footer ?? '')
  }, [org.name, org.school, org.department, org.receipt_footer])

  useEffect(() => setLow(String(savedLow)), [savedLow])

  const saveOrg = async () => {
    if (!online) return setOrgMsg({ ok: false, text: 'Saving settings needs an internet connection.' })
    try {
      await saveSetting(
        'organization',
        { name: name.trim(), school: school.trim(), department: department.trim(), receipt_footer: footer.trim() },
        userId,
      )
      setOrgMsg({ ok: true, text: 'Organization information saved.' })
    } catch (e) {
      setOrgMsg({ ok: false, text: (e as Error).message })
    }
  }

  const saveLow = async (applyAll: boolean) => {
    const n = Number(low)
    if (!Number.isInteger(n) || n < 0) return setLowMsg({ ok: false, text: 'Enter a whole number, 0 or more.' })
    if (!online) return setLowMsg({ ok: false, text: 'Saving settings needs an internet connection.' })
    if (applyAll && !window.confirm(`Set the low-stock threshold of EVERY product to ${n}?`)) return
    try {
      await saveSetting('inventory', { default_low_stock_threshold: n }, userId)
      if (applyAll) {
        const { error } = await supabase
          .from('products')
          .update({ low_stock_threshold: n })
          .gte('low_stock_threshold', 0)
        if (error) throw error
        await db.products.toCollection().modify({ low_stock_threshold: n })
        await logActivity(userId, 'low_stock_applied_all', 'setting', 'inventory', { threshold: n })
        void syncNow()
      }
      setLowMsg({ ok: true, text: applyAll ? 'Saved and applied to all products.' : 'Default saved.' })
    } catch (e) {
      setLowMsg({ ok: false, text: (e as Error).message })
    }
  }

  const label = 'mb-1 block text-sm text-slate-300'

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold text-gold">Organization</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={label}>Organization name</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={label}>School</label>
            <input className={inputCls} value={school} onChange={(e) => setSchool(e.target.value)} />
          </div>
          <div>
            <label className={label}>Department</label>
            <input className={inputCls} value={department} onChange={(e) => setDepartment(e.target.value)} />
          </div>
          <div>
            <label className={label}>Receipt footer message</label>
            <input
              className={inputCls}
              value={footer}
              placeholder="Thank you for supporting GCS!"
              onChange={(e) => setFooter(e.target.value)}
            />
          </div>
        </div>
        <button onClick={saveOrg} className="mt-3 rounded-lg bg-gold px-4 py-2 font-bold text-slate-deep">
          Save organization
        </button>
        <Msg n={orgMsg} />
      </div>

      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold text-gold">Low-stock threshold</h2>
        <p className="mb-2 text-sm text-slate-400">
          The default for new products. Each product can still have its own value.
        </p>
        <input
          className={`${inputCls} max-w-[10rem]`}
          inputMode="numeric"
          value={low}
          onChange={(e) => setLow(e.target.value.replace(/\D/g, ''))}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void saveLow(false)} className="rounded-lg bg-gold px-4 py-2 font-bold text-slate-deep">
            Save default
          </button>
          <button
            onClick={() => void saveLow(true)}
            className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-semibold hover:bg-slate-600"
          >
            Save and apply to all products
          </button>
        </div>
        <Msg n={lowMsg} />
      </div>

      <div className="rounded-xl bg-slate-800 p-4">
        <h2 className="mb-3 font-semibold text-gold">Currency and time zone</h2>
        <p className="text-sm text-slate-300">Currency: Philippine Peso (PHP, ₱)</p>
        <p className="text-sm text-slate-300">Time zone: Asia/Manila (Philippine Standard Time)</p>
        <p className="mt-2 text-xs text-slate-500">
          These are fixed for this system. Prices, receipts, history, logs, and analytics all use them.
        </p>
      </div>
    </div>
  )
}