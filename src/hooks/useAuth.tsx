import type { Session } from '@supabase/supabase-js'
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { db } from '../db/db'
import { logActivity } from '../lib/activity'
import { supabase } from '../lib/supabase'
import { startSync } from '../sync/engine'
import type { Profile } from '../types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const isAuthKey = (k: string | null): k is string =>
  !!k && k.startsWith('sb-') && k.endsWith('-auth-token')

// The login Supabase saved in the browser. It may be expired, which is fine for
// working offline: Supabase refreshes it automatically once the internet is back.
function storedSession(): Session | null {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!isAuthKey(k)) continue
      const s = JSON.parse(localStorage.getItem(k) ?? 'null')
      if (s?.user?.id && s.access_token) return s as Session
    }
  } catch {
    // ignore unreadable storage
  }
  return null
}

function clearStoredSession() {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (isAuthKey(k)) keys.push(k)
    }
    keys.forEach((k) => localStorage.removeItem(k))
  } catch {
    // ignore
  }
}

// Loads the role from Supabase when online, and falls back to the cached copy offline.
async function loadProfile(userId: string): Promise<Profile | null> {
  if (navigator.onLine) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, role, active')
        .eq('id', userId)
        .single()
      if (error) throw error
      await db.kv.put({ key: 'profile', value: data })
      return data as Profile
    } catch {
      // fall through to the cache
    }
  }
  const cached = await db.kv.get('profile')
  const p = cached?.value as Profile | undefined
  return p && p.id === userId ? p : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    void (async () => {
      let s: Session | null = null
      try {
        s = (await supabase.auth.getSession()).data.session
      } catch {
        s = null
      }
      // Offline with an expired login: keep working with the saved one
      s = s ?? storedSession()
      if (cancelled) return
      setSession(s)
      if (s) setProfile(await loadProfile(s.user.id))
      if (!cancelled) setLoading(false)
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (!newSession) {
        // Only an explicit sign-out ends the session. A failed refresh must not.
        if (event === 'SIGNED_OUT') {
          setSession(null)
          setProfile(null)
        }
        return
      }
      setSession(newSession)
      // deferred so we never call Supabase from inside its own auth callback
      setTimeout(async () => {
        setProfile(await loadProfile(newSession.user.id))
      }, 0)
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [])

  // Start background sync once someone is signed in
  useEffect(() => {
    if (session) startSync()
  }, [session])

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error && data.user) {
      void logActivity(data.user.id, 'user_signed_in', 'user', data.user.id, { email: data.user.email })
    }
    return error ? error.message : null
  }

  // Local sign-out only. We NEVER wipe the local database, because it may
  // hold sales that have not synced yet.
  const signOut = async () => {
    const waiting = await db.outbox.count()
    if (
      waiting > 0 &&
      !window.confirm(
        `${waiting} change(s) have not uploaded yet. Sign out anyway? They stay on this device and upload after the next sign-in.`,
      )
    ) {
      return
    }
    try {
      await supabase.auth.signOut({ scope: 'local' })
    } catch {
      // offline: clear it ourselves below
    }
    clearStoredSession()
    await db.kv.delete('profile')
    setSession(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}