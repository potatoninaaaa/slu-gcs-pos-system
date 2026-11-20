import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import Logo, { LogoRow } from './Logo'
import SyncBadge from './SyncBadge'

const Icon = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5 shrink-0"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
)

const icons = {
  cashier: (
    <Icon>
      <circle cx="9" cy="20" r="1.4" />
      <circle cx="18" cy="20" r="1.4" />
      <path d="M3 4h2.5l2.2 10.2a1 1 0 0 0 1 .8h8.6a1 1 0 0 0 1-.76L20 8H6.4" />
    </Icon>
  ),
  history: (
    <Icon>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Icon>
  ),
  dashboard: (
    <Icon>
      <rect x="3.5" y="3.5" width="7" height="8" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="5" rx="2" />
      <rect x="13.5" y="11.5" width="7" height="9" rx="2" />
      <rect x="3.5" y="14.5" width="7" height="6" rx="2" />
    </Icon>
  ),
  products: (
    <Icon>
      <path d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5z" />
      <path d="M3.5 7.5 12 12l8.5-4.5M12 12v9" />
    </Icon>
  ),
  activity: (
    <Icon>
      <path d="M3 12h4l2.5-6 4 12 2.5-6H21" />
    </Icon>
  ),
  settings: (
    <Icon>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V20a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3h0a1.6 1.6 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8v0a1.6 1.6 0 0 0 1.5 1H20a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
    </Icon>
  ),
  status: (
    <Icon>
      <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
    </Icon>
  ),
}

interface Item {
  to: string
  label: string
  icon: keyof typeof icons
  end?: boolean
  admin?: boolean
}

const items: Item[] = [
  { to: '/', label: 'Cashier', icon: 'cashier', end: true },
  { to: '/history', label: 'History', icon: 'history' },
  { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', admin: true },
  { to: '/products', label: 'Products', icon: 'products', admin: true },
  { to: '/activity', label: 'Activity', icon: 'activity', admin: true },
  { to: '/settings', label: 'Settings', icon: 'settings', admin: true },
  { to: '/status', label: 'Status', icon: 'status' },
]

const sideLink = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold ${
    isActive
      ? 'bg-gold text-white shadow-lg shadow-emerald-900/20'
      : 'text-slate-300 hover:bg-slate-700 hover:text-slate-50'
  }`

const pillLink = ({ isActive }: { isActive: boolean }) =>
  `flex items-center gap-2 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold ${
    isActive ? 'bg-gold text-white shadow-md shadow-emerald-900/20' : 'text-slate-300 hover:bg-slate-700'
  }`

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const admin = profile?.role === 'admin'
  const visible = items.filter((i) => !i.admin || admin)

  return (
    <div className="min-h-screen text-slate-100">
      {/* Desktop / tablet: floating side rail */}
      <aside className="fixed inset-y-3 left-3 z-40 hidden w-56 flex-col rounded-3xl bg-slate-800 p-4 shadow-xl ring-1 ring-slate-600/50 md:flex">
        <div className="mb-5 flex flex-col items-center gap-2 px-1 pt-1 text-center">
          <Logo slot="gcs" className="h-12" />
          <div className="leading-tight">
            <p className="font-bold text-slate-50">Green Core Society</p>
            <p className="text-xs text-slate-400">POS System</p>
          </div>
        </div>
        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
          {visible.map((i) => (
            <NavLink key={i.to} to={i.to} end={i.end} className={sideLink}>
              {icons[i.icon]}
              {i.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-2">
          <SyncBadge className="w-full justify-center" />
          <button
            onClick={signOut}
            className="rounded-full border border-slate-600 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Phones: top bar with scrolling tabs */}
      <header className="sticky top-0 z-40 px-3 pt-3 md:hidden">
        <div className="rounded-3xl bg-slate-800/95 p-2 shadow-xl ring-1 ring-slate-600/50 backdrop-blur">
          <div className="flex items-center gap-2 px-1 pb-2">
            <LogoRow className="h-7" />
            <div className="flex-1" />
            <SyncBadge />
            <button
              onClick={signOut}
              className="rounded-full border border-slate-600 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
            >
              Sign out
            </button>
          </div>
          <nav className="flex gap-1 overflow-x-auto rounded-full bg-slate-900 p-1">
            {visible.map((i) => (
              <NavLink key={i.to} to={i.to} end={i.end} className={pillLink}>
                {i.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="md:pl-[15.5rem]">
        <Outlet />
      </main>
    </div>
  )
}