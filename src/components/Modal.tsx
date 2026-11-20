import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function Modal({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#0f3d2e]/35 p-3 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl bg-slate-800 p-6 text-slate-50 shadow-xl ring-1 ring-slate-600/60">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-50">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-700 text-xl text-slate-300 hover:bg-slate-600"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}