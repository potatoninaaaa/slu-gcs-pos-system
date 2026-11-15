import { manilaDayKey } from './format'

export type Preset = 'all' | 'today' | 'yesterday' | 'week' | 'month' | 'custom'

export interface DateFilterValue {
  preset: Preset
  from: string // YYYY-MM-DD
  to: string
}

export const defaultDateFilter: DateFilterValue = { preset: 'today', from: '', to: '' }

export interface Range {
  start: number
  end: number // exclusive
}

const DAY = 86_400_000
const dayStart = (key: string) => new Date(`${key}T00:00:00+08:00`).getTime()

export function resolveRange(v: DateFilterValue, now = new Date()): Range | null {
  const todayKey = manilaDayKey(now.toISOString())
  const today = dayStart(todayKey)
  switch (v.preset) {
    case 'all':
      return null
    case 'today':
      return { start: today, end: today + DAY }
    case 'yesterday':
      return { start: today - DAY, end: today }
    case 'week': {
      const dow = (new Date(`${todayKey}T00:00:00Z`).getUTCDay() + 6) % 7 // Monday = 0
      return { start: today - dow * DAY, end: today + DAY }
    }
    case 'month':
      return { start: dayStart(`${todayKey.slice(0, 8)}01`), end: today + DAY }
    case 'custom': {
      if (!v.from && !v.to) return null
      let a = v.from || v.to
      let b = v.to || v.from
      if (a > b) [a, b] = [b, a]
      return {
        start: v.from ? dayStart(a) : -Infinity,
        end: v.to ? dayStart(b) + DAY : Infinity,
      }
    }
  }
}

export function inRange(iso: string, r: Range | null): boolean {
  if (!r) return true
  const t = new Date(iso).getTime()
  return t >= r.start && t < r.end
}