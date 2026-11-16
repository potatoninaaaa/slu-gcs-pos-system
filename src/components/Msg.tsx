export interface Notice {
  ok: boolean
  text: string
}

export default function Msg({ n }: { n: Notice | null }) {
  if (!n) return null
  return (
    <p
      className={`mt-3 rounded-lg px-3 py-2 text-sm ${
        n.ok ? 'bg-emerald-900/60 text-emerald-300' : 'bg-red-900/50 text-red-200'
      }`}
    >
      {n.text}
    </p>
  )
}