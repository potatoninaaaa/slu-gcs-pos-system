import { useState, type FormEvent } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useOnline } from '../hooks/useOnline'

export default function Login() {
  const { signIn } = useAuth()
  const online = useOnline()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!online) {
      setError('You need an internet connection for the first sign-in on this device.')
      return
    }
    setBusy(true)
    const err = await signIn(email.trim(), password)
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-emerald-deep p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          {/* Logo slots (SLU, GCS, SAMCIS) are added in the settings phase */}
          <h1 className="text-2xl font-bold text-emerald-deep">Green Core Society</h1>
          <p className="text-sm text-slate-500">POS and Inventory System</p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-deep focus:ring-2 focus:ring-emerald-deep/20"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-emerald-deep focus:ring-2 focus:ring-emerald-deep/20"
            />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-emerald-deep py-2.5 font-semibold text-white transition hover:bg-emerald-900 disabled:opacity-60"
          >
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400">
          {online ? 'Online' : 'Offline'}
        </p>
      </div>
    </div>
  )
}