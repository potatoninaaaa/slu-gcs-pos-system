import { useState, type ChangeEvent } from 'react'
import { db } from '../../db/db'
import { useAuth } from '../../hooks/useAuth'
import { useOnline } from '../../hooks/useOnline'
import { useSettings } from '../../hooks/useSettings'
import { newId } from '../../lib/id'
import { saveSetting } from '../../lib/settings'
import { supabase } from '../../lib/supabase'
import { brandingKey } from '../../sync/images'
import Logo, { logoNames, type LogoSlot } from '../Logo'
import Msg, { type Notice } from '../Msg'

const slots: LogoSlot[] = ['slu', 'gcs', 'samcis']
const extFor: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export default function LogosSection() {
  const { session } = useAuth()
  const online = useOnline()
  const settings = useSettings()
  const userId = session?.user.id ?? ''
  const logos = (settings.logos ?? {}) as Record<string, string | undefined>
  const [busy, setBusy] = useState<LogoSlot | null>(null)
  const [msg, setMsg] = useState<Notice | null>(null)

  const upload = async (slot: LogoSlot, e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!online) return setMsg({ ok: false, text: 'Uploading a logo needs an internet connection.' })
    const ext = extFor[file.type]
    if (!ext) return setMsg({ ok: false, text: 'Use a PNG, JPG, or WebP file.' })
    if (file.size > 3 * 1024 * 1024) return setMsg({ ok: false, text: 'The file must be under 3 MB.' })

    setBusy(slot)
    setMsg(null)
    const path = `${slot}-${newId()}.${ext}`
    try {
      // Uploaded exactly as given, so colors, proportions, and quality are preserved
      const up = await supabase.storage
        .from('branding')
        .upload(path, file, { contentType: file.type, cacheControl: '31536000' })
      if (up.error) throw up.error
      await db.images.put({ path: brandingKey(path), blob: file, cached_at: new Date().toISOString() })
      await saveSetting('logos', { ...logos, [slot]: path }, userId)

      const old = logos[slot]
      if (old) {
        await supabase.storage.from('branding').remove([old])
        await db.images.delete(brandingKey(old))
      }
      setMsg({ ok: true, text: `${logoNames[slot]} logo saved.` })
    } catch (err) {
      await supabase.storage.from('branding').remove([path])
      setMsg({ ok: false, text: (err as Error).message })
    } finally {
      setBusy(null)
    }
  }

  const remove = async (slot: LogoSlot) => {
    const old = logos[slot]
    if (!old || !window.confirm(`Remove the ${logoNames[slot]} logo?`)) return
    if (!online) return setMsg({ ok: false, text: 'Removing a logo needs an internet connection.' })
    try {
      const next = { ...logos }
      delete next[slot]
      await saveSetting('logos', next, userId)
      await supabase.storage.from('branding').remove([old])
      await db.images.delete(brandingKey(old))
      setMsg({ ok: true, text: 'Logo removed.' })
    } catch (err) {
      setMsg({ ok: false, text: (err as Error).message })
    }
  }

  return (
    <div className="rounded-xl bg-slate-800 p-4">
      <h2 className="mb-1 font-semibold text-gold">Institutional logos</h2>
      <p className="mb-4 text-sm text-slate-400">
        Upload the official files. They appear on the login page, header, and receipts, and are saved for
        offline use. PNG, JPG, or WebP, up to 3 MB.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {slots.map((slot) => (
          <div key={slot} className="rounded-lg bg-slate-900 p-3">
            <p className="mb-2 text-sm font-medium">{logoNames[slot]}</p>
            <div className="mb-3 flex h-24 items-center justify-center rounded bg-white p-2">
              {logos[slot] ? (
                <Logo slot={slot} className="max-h-20" />
              ) : (
                <span className="text-xs text-slate-400">No logo uploaded</span>
              )}
            </div>
            <label className="block cursor-pointer rounded-lg bg-gold py-2 text-center text-sm font-bold text-slate-deep">
              {busy === slot ? 'Uploading...' : logos[slot] ? 'Replace' : 'Upload'}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                disabled={busy !== null}
                onChange={(e) => void upload(slot, e)}
              />
            </label>
            {logos[slot] && (
              <button onClick={() => void remove(slot)} className="mt-2 w-full text-xs text-red-300 hover:text-red-200">
                Remove
              </button>
            )}
          </div>
        ))}
      </div>
      <Msg n={msg} />
    </div>
  )
}