import { db } from '../db/db'
import type { AppSettings } from '../hooks/useSettings'
import { formatDateTime } from './format'

export type Cell = string | number | null | undefined

export interface Col {
  header: string
  kind?: 'text' | 'money' | 'int'
  width?: number // Excel column width
  pdf?: boolean // false = leave this column out of the PDF
}

export interface TableDoc {
  title: string
  subtitle?: string
  summary?: [string, string][]
  fileBase: string
  columns: Col[]
  rows: Cell[][]
}

async function orgName(): Promise<string> {
  const s = (await db.kv.get('settings'))?.value as AppSettings | undefined
  return s?.organization?.name || 'Green Core Society'
}

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// Built-in PDF fonts cannot draw every character
const latin = (s: string) =>
  s.replace(/₱/g, 'PHP ').replace(/→/g, '->').replace(/[^\u0020-\u00FF]/g, '?')

const generated = () => `Generated ${formatDateTime(new Date().toISOString())} (Philippine time)`

export async function exportXlsx(doc: TableDoc): Promise<void> {
  const mod = await import('exceljs')
  const ExcelJS = ((mod as unknown as { default?: typeof mod }).default ?? mod) as typeof mod

  const wb = new ExcelJS.Workbook()
  wb.creator = await orgName()
  wb.created = new Date()
  const ws = wb.addWorksheet(doc.title.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '))

  ws.addRow([doc.title]).font = { bold: true, size: 14 }
  if (doc.subtitle) ws.addRow([doc.subtitle])
  ws.addRow([generated()])
  for (const [k, v] of doc.summary ?? []) {
    const r = ws.addRow([k, v])
    r.getCell(1).font = { bold: true }
  }
  ws.addRow([])

  const head = ws.addRow(doc.columns.map((c) => c.header))
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  head.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF064E3B' } }
  })
  const headRow = head.number
  ws.views = [{ state: 'frozen', ySplit: headRow }]
  doc.columns.forEach((c, i) => {
    ws.getColumn(i + 1).width = c.width ?? 16
  })

  for (const r of doc.rows) {
    const row = ws.addRow(r.map((v) => v ?? ''))
    doc.columns.forEach((c, i) => {
      const cell = row.getCell(i + 1)
      if (c.kind === 'money') cell.numFmt = '"₱"#,##0.00'
      if (c.kind === 'int') cell.numFmt = '0'
    })
  }

  ws.autoFilter = {
    from: { row: headRow, column: 1 },
    to: { row: headRow, column: doc.columns.length },
  }

  const buffer = await wb.xlsx.writeBuffer()
  saveBlob(
    `${doc.fileBase}.xlsx`,
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  )
}

export async function exportPdf(doc: TableDoc): Promise<void> {
  const [{ jsPDF }, autoTableMod] = await Promise.all([import('jspdf'), import('jspdf-autotable')])
  const autoTable = autoTableMod.default

  const cols = doc.columns.map((c, i) => ({ c, i })).filter(({ c }) => c.pdf !== false)
  const pdf = new jsPDF({
    orientation: cols.length > 6 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  })
  const org = latin(await orgName())
  const pageW = pdf.internal.pageSize.getWidth()
  const pageH = pdf.internal.pageSize.getHeight()

  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(10)
  pdf.setTextColor(6, 78, 59)
  pdf.text(org, 40, 32)
  pdf.setFontSize(16)
  pdf.setTextColor(15, 23, 42)
  pdf.text(latin(doc.title), 40, 54)

  let y = 70
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(71, 85, 105)
  if (doc.subtitle) {
    pdf.text(latin(doc.subtitle), 40, y)
    y += 13
  }
  pdf.text(generated(), 40, y)
  y += 13
  for (const [k, v] of doc.summary ?? []) {
    pdf.text(latin(`${k}: ${v}`), 40, y)
    y += 12
  }

  const money = new Intl.NumberFormat('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const show = (c: Col, v: Cell) =>
    v === null || v === undefined
      ? ''
      : c.kind === 'money' && typeof v === 'number'
        ? money.format(v)
        : latin(String(v))

  const columnStyles: Record<number, { halign: 'right' }> = {}
  cols.forEach(({ c }, j) => {
    if (c.kind === 'money' || c.kind === 'int') columnStyles[j] = { halign: 'right' }
  })

  autoTable(pdf, {
    startY: y + 6,
    head: [cols.map(({ c }) => latin(c.kind === 'money' ? `${c.header} (PHP)` : c.header))],
    body: doc.rows.map((r) => cols.map(({ c, i }) => show(c, r[i]))),
    styles: { fontSize: 8, cellPadding: 3, overflow: 'linebreak' },
    headStyles: { fillColor: [6, 78, 59], textColor: 255 },
    alternateRowStyles: { fillColor: [241, 245, 249] },
    columnStyles,
    margin: { left: 40, right: 40, bottom: 40 },
  })

  const pages = pdf.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    pdf.setPage(p)
    pdf.setFontSize(8)
    pdf.setTextColor(100, 116, 139)
    pdf.text(`${org} POS`, 40, pageH - 20)
    pdf.text(`Page ${p} of ${pages}`, pageW - 40, pageH - 20, { align: 'right' })
  }

  pdf.save(`${doc.fileBase}.pdf`)
}