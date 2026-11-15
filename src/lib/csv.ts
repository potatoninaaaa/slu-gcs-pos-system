type Cell = string | number | null | undefined

function esc(c: Cell): string {
  if (c === null || c === undefined) return ''
  let s = String(c)
  // Stops spreadsheet apps from running text that starts like a formula
  if (typeof c === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function downloadCsv(filename: string, rows: Cell[][]) {
  const text = '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}