export function fmtDate(d?: string | null): string {
  if (!d) return '—'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function pretty(s?: string | null): string {
  if (!s) return ''
  const t = s.replace(/_/g, ' ')
  return t.charAt(0).toUpperCase() + t.slice(1)
}

export function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message)
  return 'Something went wrong'
}

export function fullName(e?: { first_name?: string | null; middle_name?: string | null; last_name?: string | null } | null): string {
  if (!e) return '—'
  return [e.first_name, e.middle_name, e.last_name].filter(Boolean).join(' ') || '—'
}

export const todayIso = () => new Date().toISOString().slice(0, 10)

export function money(n: number | string | null | undefined, cur = ''): string {
  const s = Number(n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return cur ? `${cur} ${s}` : s
}

export function downloadCsv(filename: string, rows: (string | number)[][]) {
  const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(esc).join(',')).join('\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

/** PostgREST returns at most 1000 rows per request; this pages through all of them. */
export async function fetchAll<T = any>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw error
    out.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Working days between two dates (Mon-Fri), excluding the given holiday dates (yyyy-mm-dd). */
export function workingDays(start: string, end: string, holidays: Set<string>): number {
  if (!start || !end || end < start) return 0
  let n = 0
  const d = new Date(start + 'T00:00:00Z'), last = new Date(end + 'T00:00:00Z')
  while (d <= last) {
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6 && !holidays.has(d.toISOString().slice(0, 10))) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}
