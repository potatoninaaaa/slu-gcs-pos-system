import type { ReactNode } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export default function Modal({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-3 sm:items-center">
      <div className="w-full max-w-md rounded-xl bg-slate-800 p-4 text-white shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gold">{title}</h2>
          <button onClick={onClose} aria-label="Close" className="px-2 text-2xl text-slate-400 hover:text-white">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}