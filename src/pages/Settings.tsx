import { useState } from 'react'
import BackupSection from '../components/settings/BackupSection'
import CategoriesSection from '../components/settings/CategoriesSection'
import GeneralSection from '../components/settings/GeneralSection'
import LogosSection from '../components/settings/LogosSection'
import SyncSection from '../components/settings/SyncSection'
import UsersSection from '../components/settings/UsersSection'
import { useAuth } from '../hooks/useAuth'

const tabs = [
  ['general', 'General'],
  ['logos', 'Logos'],
  ['categories', 'Categories'],
  ['users', 'Users'],
  ['backup', 'Backup and restore'],
  ['sync', 'Synchronization'],
] as const

type Tab = (typeof tabs)[number][0]

export default function Settings() {
  const { profile } = useAuth()
  const [tab, setTab] = useState<Tab>('general')

  if (profile?.role !== 'admin') {
    return <p className="p-6 text-center text-slate-400">Only administrators can change settings.</p>
  }

  return (
    <div className="mx-auto max-w-4xl p-3">
      <h1 className="mb-3 text-xl font-bold text-gold">Settings</h1>
      <div className="mb-4 flex gap-1 overflow-x-auto">
        {tabs.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === k ? 'bg-gold text-slate-deep' : 'bg-slate-800 text-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'general' && <GeneralSection />}
      {tab === 'logos' && <LogosSection />}
      {tab === 'categories' && <CategoriesSection />}
      {tab === 'users' && <UsersSection />}
      {tab === 'backup' && <BackupSection />}
      {tab === 'sync' && <SyncSection />}
    </div>
  )
}