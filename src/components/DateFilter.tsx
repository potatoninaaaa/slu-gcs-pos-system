import type { DateFilterValue, Preset } from '../lib/dates'
import { inputCls } from '../lib/ui'

interface Props {
  value: DateFilterValue
  onChange: (v: DateFilterValue) => void
}

const options: { value: Preset; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'custom', label: 'Custom range' },
  { value: 'all', label: 'All time' },
]

export default function DateFilter({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value as Preset })}
        className={`${inputCls} w-auto`}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {value.preset === 'custom' && (
        <>
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={`${inputCls} w-auto`}
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={`${inputCls} w-auto`}
          />
        </>
      )}
    </div>
  )
}