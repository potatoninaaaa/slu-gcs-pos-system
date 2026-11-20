export interface Notice {
  ok: boolean
  text: string
}

export default function Msg({ n }: { n: Notice | null }) {
  if (!n) return null
  return (
    <p
      className={`mt-3 rounded-xl px-4 py-2.5 text-sm font-medium ring-1 ${
        n.ok
          ? 'bg-gold/10 text-slate-50 ring-gold/30'
          : 'bg-red-50 text-red-700 ring-red-200'
      }`}
    >
      {n.text}
    </p>
  )
}