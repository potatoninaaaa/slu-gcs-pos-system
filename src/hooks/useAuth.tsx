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

    // getSession reads the saved session from the browser, so it works offline
    supabase.auth.getSession().then(async ({ data }) => {
      if (cancelled) return
      setSession(data.session)
      if (data.session) setProfile(await loadProfile(data.session.user.id))
      if (!cancelled) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
      if (!newSession) {
        setProfile(null)
        return
      }
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
    await supabase.auth.signOut({ scope: 'local' })
    await db.kv.delete('profile')
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