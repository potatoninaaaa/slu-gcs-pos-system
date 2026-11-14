const TZ = 'Asia/Manila'

const peso = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' })
export const formatPeso = (n: number) => peso.format(n)

const dateTime = new Intl.DateTimeFormat('en-PH', {
  timeZone: TZ,
  dateStyle: 'medium',
  timeStyle: 'short',
})
export const formatDateTime = (iso: string) => dateTime.format(new Date(iso))

const dateOnly = new Intl.DateTimeFormat('en-PH', { timeZone: TZ, dateStyle: 'medium' })
export const formatDate = (iso: string) => dateOnly.format(new Date(iso))

// "YYYY-MM-DD" in Manila time, handy for grouping sales by day
const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TZ })
export const manilaDayKey = (iso: string) => dayKey.format(new Date(iso))