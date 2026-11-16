import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { useOnline } from '../../hooks/useOnline'
import { logActivity } from '../../lib/activity'
import { supabase } from '../../lib/supabase'
import type { Role } from '../../types'
import Msg, { type Notice } from '../Msg'

interface Row {
  id: string
  email: string
  full_name: string | null
  role: Role
  active: boolean
}

export default function UsersSection() {
  const { session } = useAuth()
  const online = useOnline()
  const me = session?.user.id ?? ''
  const [rows, setRows] = useState<Row[]>([])
  const [msg, setMsg] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, full_name, role, active')
      .order('email')
    if (error) setMsg({ ok: false, text: error.message })
    else setRows(data as Row[])
  }, [])

  useEffect(() => {
    if (online) void load()
  }, [online, load])

  const update = async (r: Row, patch: Partial<Pick<Row, 'role' | 'active'>>, action: string) => {
    if (!online) return setMsg({ ok: false, text: 'Managing users needs an internet connection.' })
    if (r.id === me) return setMsg({ ok: false, text: 'You cannot change your own account here.' })
    const { error } = await supabase.from('profiles').update(patch).eq('id', r.id)
    if (error) return setMsg({ ok: false, text: error.message })
    setRows((list) => list.map((x) => (x.id === r.id ? { ...x, ...patch } : x)))
    await logActivity(me, action, 'user', r.id, { email: r.email, ...patch })
    setMsg({ ok: true, text: 'User updated.' })
  }

  return (
    <div className="rounded-xl bg-slate-800 p-4">
      <h2 className="mb-1 font-semibold text-gold">User accounts</h2>
      <p className="mb-4 text-sm text-slate-400">
        To add someone, open Supabase, then Authentication, Users, Add user. They appear here as a cashier,
        and you can promote them. New accounts are created in Supabase because creating logins from the app
        would need a secret key that must never be placed in frontend code.
      </p>
      {!online && <p className="mb-3 text-sm text-amber-300">Connect to the internet to load users.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="text-slate-400">
            <tr>
              <th className="py-2 pr-2">Email</th>
              <th className="py-2 pr-2">Role</th>
              <th className="py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-slate-700">
                <td className="py-2 pr-2">
                  {r.email} {r.id === me && <span className="text-xs text-slate-500">(you)</span>}
                </td>
                <td className="py-2 pr-2">
                  <select
                    value={r.role}
                    disabled={r.id === me}
                    onChange={(e) => void update(r, { role: e.target.value as Role }, 'user_role_changed')}
                    className="rounded-lg border border-slate-700 bg-slate-900 px-2 py-1 disabled:opacity-50"
                  >
                    <option value="cashier">Cashier</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={r.active}
                    disabled={r.id === me}
                    onChange={(e) =>
                      void update(r, { active: e.target.checked }, e.target.checked ? 'user_activated' : 'user_deactivated')
                    }
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">
        A deactivated user can no longer read or save data. Role changes apply the next time they sign in or sync.
      </p>
      <Msg n={msg} />
    </div>
  )
}