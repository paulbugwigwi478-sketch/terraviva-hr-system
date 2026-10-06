'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { fmtDate, todayIso } from '@/lib/format'

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export default function CalendarPage() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [dept, setDept] = useState('')
  const [rows, setRows] = useState<any[] | null>(null)
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [error, setError] = useState('')

  const first = iso(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const last = iso(year, month, daysInMonth)

  useEffect(() => {
    setRows(null)
    const sb = createClient()
    ;(async () => {
      const [l, h] = await Promise.all([
        sb.rpc('team_leave_calendar', { p_from: first, p_to: last }),
        sb.from('holidays').select('holiday_date,name').gte('holiday_date', first).lte('holiday_date', last),
      ])
      if (l.error) setError(l.error.message)
      setRows((l.data as any[]) ?? [])
      setHolidays(Object.fromEntries((h.data ?? []).map((x: any) => [x.holiday_date, x.name])))
    })()
  }, [first, last])

  const depts = useMemo(() => Array.from(new Set((rows ?? []).map(r => r.department).filter(Boolean))).sort() as string[], [rows])
  const shown = useMemo(() => (rows ?? []).filter(r => !dept || r.department === dept), [rows, dept])

  // Monday-first grid
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)
  const today = todayIso()

  function shift(n: number) {
    const d = new Date(year, month + n, 1)
    setYear(d.getFullYear()); setMonth(d.getMonth())
  }
  const title = new Date(year, month, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Team calendar</h1><p className="muted">Who is away. Only approved leave is shown, without the type or reason.</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="mini" onClick={() => shift(-1)}>‹ Previous</button>
          <strong style={{ minWidth: 130, textAlign: 'center' }}>{title}</strong>
          <button className="mini" onClick={() => shift(1)}>Next ›</button>
          <button className="mini" onClick={() => { setYear(now.getFullYear()); setMonth(now.getMonth()) }}>Today</button>
        </div></div>
      {error && <p className="error msg">{error}</p>}
      <div className="filters"><label>Department<select value={dept} onChange={e => setDept(e.target.value)}><option value="">All</option>{depts.map(d => <option key={d} value={d}>{d}</option>)}</select></label></div>

      <div className="panel" style={{ overflowX: 'auto' }}>
        {rows === null ? <p className="empty">Loading…</p> : (
          <div style={{ minWidth: 680 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
              {WEEK.map(w => <div key={w} className="muted" style={{ fontSize: 11, textAlign: 'center', fontWeight: 700 }}>{w}</div>)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
              {cells.map((d, i) => {
                if (d === null) return <div key={i} />
                const key = iso(year, month, d)
                const away = shown.filter(r => r.start_date <= key && r.end_date >= key)
                const weekend = i % 7 >= 5
                const holiday = holidays[key]
                return (
                  <div key={i} style={{ minHeight: 92, border: key === today ? '2px solid var(--teal)' : '1px solid var(--line)', borderRadius: 8, padding: 5, background: holiday ? '#fff4dc' : weekend ? '#f4f7f7' : '#fff', fontSize: 11 }}>
                    <div style={{ fontWeight: 700, color: key === today ? 'var(--teal)' : undefined }}>{d}</div>
                    {holiday && <div style={{ color: '#9a6b18', fontWeight: 600, marginBottom: 2 }}>{holiday}</div>}
                    {away.slice(0, 3).map(r => <div key={r.employee_id} title={r.employee_name} style={{ background: '#e3f3f1', color: '#0b5f61', borderRadius: 4, padding: '1px 4px', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.employee_name}</div>)}
                    {away.length > 3 && <div className="muted" style={{ marginTop: 2 }}>+{away.length - 3} more</div>}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <div className="panel"><h2>Away in {title}</h2>
        {rows === null ? <p className="empty">Loading…</p> : shown.length === 0 ? <p className="empty">Nobody is on approved leave this month.</p> : shown.map((r, i) => (
          <div className="row" key={r.employee_id + r.start_date + i}><span><strong>{r.employee_name}</strong>{r.department && <><br /><span className="muted">{r.department}</span></>}</span>
            <span className="muted">{fmtDate(r.start_date)} – {fmtDate(r.end_date)}</span></div>))}
      </div>
    </div>
  )
}
