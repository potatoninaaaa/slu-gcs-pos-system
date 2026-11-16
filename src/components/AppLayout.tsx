import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { LogoRow } from './Logo'
import SyncBadge from './SyncBadge'

const link = ({ isActive }: { isActive: boolean }) =>
  `whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
    isActive ? 'bg-gold text-slate-deep' : 'text-slate-300 hover:bg-slate-800'
  }`

export default function AppLayout() {
  const { profile, signOut } = useAuth()
  const admin = profile?.role === 'admin'

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      <header className="sticky top-0 z-40 border-b border-slate-800 bg-slate-deep">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2">
          <div className="hidden items-center gap-2 md:flex">
            <LogoRow className="h-7" />
            <span className="font-bold text-gold">GCS POS</span>
          </div>
          <nav className="flex flex-1 gap-1 overflow-x-auto">
            <NavLink to="/" end className={link}>
              Cashier
            </NavLink>
            <NavLink to="/history" className={link}>
              History
            </NavLink>
            {admin && (
              <>
                <NavLink to="/dashboard" className={link}>
                  Dashboard
                </NavLink>
                <NavLink to="/products" className={link}>
                  Products
                </NavLink>
                <NavLink to="/activity" className={link}>
                  Activity
                </NavLink>
                <NavLink to="/settings" className={link}>
                  Settings
                </NavLink>
              </>
            )}
            <NavLink to="/status" className={link}>
              Status
            </NavLink>
          </nav>
          <SyncBadge />
          <button
            onClick={signOut}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Sign out
          </button>
        </div>
      </header>
      <Outlet />
    </div>
  )
}