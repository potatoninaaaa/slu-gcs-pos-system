export const newId = (): string => crypto.randomUUID()

// Human-friendly receipt number: GCS-YYMMDD-XXXX (Manila date + random suffix)
export function newReceiptNo(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  })
    .format(date)
    .replace(/-/g, '')
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 4).toUpperCase()
  return `GCS-${parts}-${suffix}`
}