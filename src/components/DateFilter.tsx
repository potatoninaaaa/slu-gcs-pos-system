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

// Renders straight into the page's filter grid, so it lines up with the other filters.
export default function DateFilter({ value, onChange }: Props) {
  return (
    <>
      <select
        value={value.preset}
        onChange={(e) => onChange({ ...value, preset: e.target.value as Preset })}
        className={inputCls}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {value.preset === 'custom' && (
        <div className="flex items-center gap-2 sm:col-span-2">
          <input
            type="date"
            value={value.from}
            onChange={(e) => onChange({ ...value, from: e.target.value })}
            className={inputCls}
          />
          <span className="text-sm text-slate-400">to</span>
          <input
            type="date"
            value={value.to}
            onChange={(e) => onChange({ ...value, to: e.target.value })}
            className={inputCls}
          />
        </div>
      )}
    </>
  )
}