'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { downloadCsv, errMsg, fmtDate, fullName } from '@/lib/format'
import { monthName } from '@/lib/payslip'

type Tab = 'me' | 'today' | 'report' | 'settings'
type Msg = { kind: 'error' | 'success'; text: string } | null
const DEFAULT_TZ = 'Africa/Dar_es_Salaam'

const timeIn = (iso: string | null, tz: string) => (iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: tz }) : '—')
const todayIn = (tz: string) => new Date().toLocaleDateString('en-CA', { timeZone: tz })
const mins = (hhmm: string) => { const [h, m] = hhmm.split(':'); return Number(h) * 60 + Number(m) }
const hoursBetween = (a: string | null, b: string | null) => (a && b ? (new Date(b).getTime() - new Date(a).getTime()) / 3600000 : null)
const isoDate = (y: number, m0: number, d: number) => `${y}-${String(m0 + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

export default function AttendancePage() {
  const { profile, org, isManager } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const canTeam = can(profile.role, ['hr_admin', 'director', 'auditor']) || isManager
  const [tab, setTab] = useState<Tab>('me')
  const [settings, setSettings] = useState<any | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const loadSettings = useCallback(async () => {
    const { data } = await createClient().from('attendance_settings').select('*').eq('organization_id', org.id).maybeSingle()
    setSettings(data ?? { work_start: '08:00:00', work_end: '17:00:00', grace_minutes: 15, timezone: DEFAULT_TZ })
  }, [org.id])
  useEffect(() => { loadSettings() }, [loadSettings])

  if (!settings) return <p className="empty">Loading…</p>
  const tz = settings.timezone || DEFAULT_TZ
  const start = String(settings.work_start).slice(0, 5)
  const grace = Number(settings.grace_minutes)

  const tabs: [Tab, string][] = [['me', 'My attendance']]
  if (canTeam) tabs.push(['today', 'Today'])
  tabs.push(['report', canTeam ? 'Monthly report' : 'My monthly summary'])
  if (isHr) tabs.push(['settings', 'Settings'])

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Attendance</h1><p className="muted">Working hours {start}–{String(settings.work_end).slice(0, 5)}. Arrival up to {grace} minutes after {start} is not counted as late.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setMsg(null) }}>{l}</button>)}</div>

      {tab === 'me' && profile.employee_id && <MyAttendance empId={profile.employee_id} tz={tz} start={start} grace={grace} setMsg={setMsg} />}
      {tab === 'today' && canTeam && <TodayTab tz={tz} start={start} grace={grace} isHr={isHr} setMsg={setMsg} />}
      {tab === 'report' && <ReportTab canTeam={canTeam} setMsg={setMsg} />}
      {tab === 'settings' && isHr && <SettingsTab settings={settings} orgId={org.id} setMsg={setMsg} reload={loadSettings} />}
    </div>
  )
}

/* ---------------- My attendance ---------------- */
function MyAttendance({ empId, tz, start, grace, setMsg }: any) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [today, setToday] = useState<any | null | undefined>(undefined)
  const [rows, setRows] = useState<any[]>([])
  const [holidays, setHolidays] = useState<Record<string, string>>({})
  const [leave, setLeave] = useState<any[]>([])
  const [sum, setSum] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)

  const first = isoDate(year, month, 1)
  const dim = new Date(year, month + 1, 0).getDate()
  const last = isoDate(year, month, dim)
  const todayStr = todayIn(tz)
  const isLate = (iso: string) => mins(timeIn(iso, tz)) > mins(start) + grace

  const load = useCallback(async () => {
    const sb = createClient()
    const [t, r, h, l, s] = await Promise.all([
      sb.from('attendance_records').select('*').eq('employee_id', empId).eq('work_date', todayStr).maybeSingle(),
      sb.from('attendance_records').select('*').eq('employee_id', empId).gte('work_date', first).lte('work_date', last),
      sb.from('holidays').select('holiday_date,name').gte('holiday_date', first).lte('holiday_date', last),
      sb.rpc('team_leave_calendar', { p_from: first, p_to: last }),
      sb.rpc('attendance_month_report', { p_year: year, p_month: month + 1 }),
    ])
    setToday(t.data ?? null); setRows(r.data ?? [])
    setHolidays(Object.fromEntries((h.data ?? []).map((x: any) => [x.holiday_date, x.name])))
    setLeave(((l.data as any[]) ?? []).filter(x => x.employee_id === empId))
    setSum(((s.data as any[]) ?? []).find(x => x.employee_id === empId) ?? null)
  }, [empId, first, last, year, month, todayStr])
  useEffect(() => { load() }, [load])

  async function punch(fn: 'check_in' | 'check_out') {
    setBusy(true); setMsg(null)
    const { error } = await createClient().rpc(fn)
    setBusy(false)
    if (error) setMsg({ kind: 'error', text: error.message })
    else { setMsg({ kind: 'success', text: fn === 'check_in' ? 'You are checked in. Have a good day.' : 'You are checked out. See you tomorrow.' }); load() }
  }

  const days = useMemo(() => Array.from({ length: dim }, (_, i) => {
    const d = i + 1, key = isoDate(year, month, d), wd = new Date(year, month, d).getDay()
    return { d, key, weekend: wd === 0 || wd === 6, holiday: holidays[key], rec: rows.find(r => r.work_date === key), onLeave: leave.some(x => x.start_date <= key && x.end_date >= key) }
  }), [dim, year, month, holidays, rows, leave])
  const shift = (n: number) => { const d = new Date(year, month + n, 1); setYear(d.getFullYear()); setMonth(d.getMonth()) }

  return (
    <>
      <div className="panel" style={{ textAlign: 'center', padding: 26 }}>
        <div className="muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: tz })}</div>
        {today === undefined ? <p className="empty">Loading…</p> : !today ? (
          <><p style={{ fontSize: 18, margin: '10px 0' }}>You have not checked in yet.</p><button className="primary" disabled={busy} onClick={() => punch('check_in')}>Check in</button></>
        ) : !today.check_out ? (
          <><p style={{ fontSize: 18, margin: '10px 0' }}>Checked in at <strong>{timeIn(today.check_in, tz)}</strong>{isLate(today.check_in) && <> <span className="status rejected">Late</span></>}</p>
            <button className="primary" disabled={busy} onClick={() => punch('check_out')}>Check out</button></>
        ) : (
          <p style={{ fontSize: 18, margin: '10px 0' }}>In <strong>{timeIn(today.check_in, tz)}</strong> · Out <strong>{timeIn(today.check_out, tz)}</strong> · {hoursBetween(today.check_in, today.check_out)?.toFixed(1)} hours. <span className="status active">Done for today</span></p>
        )}
        {today?.source === 'hr' && <p className="muted" style={{ marginTop: 6 }}>This record was entered by HR{today.note ? `: ${today.note}` : ''}.</p>}
      </div>

      <div className="page-head" style={{ marginTop: 6 }}>
        <h2 style={{ margin: 0 }}>{monthName(month + 1)} {year}</h2>
        <div style={{ display: 'flex', gap: 8 }}><button className="mini" onClick={() => shift(-1)}>‹ Previous</button><button className="mini" onClick={() => shift(1)}>Next ›</button></div>
      </div>
      {sum && <div className="cards">
        <div className="card"><span>Days present</span><strong>{sum.present_days}</strong><small>of {sum.working_days} working days</small></div>
        <div className="card"><span>Late arrivals</span><strong>{sum.late_days}</strong><small>after {start} + {grace} min</small></div>
        <div className="card"><span>Absent</span><strong>{sum.absent_days}</strong><small>without leave</small></div>
        <div className="card"><span>Hours worked</span><strong>{sum.hours_worked}</strong><small>{sum.leave_days} leave days</small></div>
      </div>}
      <div className="panel" style={{ marginTop: 18 }}>
        <table><thead><tr><th>Date</th><th>In</th><th>Out</th><th className="num">Hours</th><th>Status</th></tr></thead><tbody>
          {days.map(x => {
            const future = x.key > todayStr
            let status: ReactNode = ''
            if (x.rec) status = isLate(x.rec.check_in) ? <span className="status rejected">Late</span> : <span className="status active">On time</span>
            else if (x.onLeave) status = <span className="status pending">On leave</span>
            else if (x.holiday) status = <span className="muted">{x.holiday}</span>
            else if (x.weekend) status = <span className="muted">Weekend</span>
            else if (!future && x.key < todayStr) status = <span className="status rejected">Absent</span>
            const h = x.rec ? hoursBetween(x.rec.check_in, x.rec.check_out) : null
            return <tr key={x.key} style={x.weekend || x.holiday ? { background: '#f7f9f9' } : undefined}>
              <td>{fmtDate(x.key)}</td><td>{x.rec ? timeIn(x.rec.check_in, tz) : '—'}</td><td>{x.rec ? timeIn(x.rec.check_out, tz) : '—'}</td>
              <td className="num">{h != null ? h.toFixed(1) : '—'}</td><td>{status}{x.rec?.source === 'hr' && <span className="muted"> (HR)</span>}</td></tr>
          })}
        </tbody></table>
      </div>
    </>
  )
}

/* ---------------- Today (HR, Director, Auditor, managers) ---------------- */
function TodayTab({ tz, start, grace, isHr, setMsg }: any) {
  const todayStr = todayIn(tz)
  const [people, setPeople] = useState<any[]>([])
  const [recs, setRecs] = useState<any[]>([])
  const [away, setAway] = useState<any[]>([])
  const [f, setF] = useState({ employee: '', date: todayStr, cin: '08:00', cout: '', note: '' })
  const isLate = (iso: string) => mins(timeIn(iso, tz)) > mins(start) + grace

  const load = useCallback(async () => {
    const sb = createClient()
    const [e, r, l] = await Promise.all([
      sb.from('employees').select('id,first_name,middle_name,last_name,employee_no').eq('status', 'active').order('last_name'),
      sb.from('attendance_records').select('*').eq('work_date', todayStr),
      sb.rpc('team_leave_calendar', { p_from: todayStr, p_to: todayStr }),
    ])
    setPeople(e.data ?? []); setRecs(r.data ?? []); setAway((l.data as any[]) ?? [])
  }, [todayStr])
  useEffect(() => { load() }, [load])

  const name = (id: string) => fullName(people.find(p => p.id === id))
  const awayIds = new Set(away.map(a => a.employee_id))
  const checkedIds = new Set(recs.map(r => r.employee_id))
  const notIn = people.filter(p => !checkedIds.has(p.id) && !awayIds.has(p.id))

  async function save(e: FormEvent) {
    e.preventDefault(); setMsg(null)
    const { error } = await createClient().rpc('hr_set_attendance', { p_employee_id: f.employee, p_date: f.date, p_check_in: f.cin, p_check_out: f.cout || null, p_note: f.note.trim() || null })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: 'Attendance saved.' }); load() }
  }
  async function clear() {
    if (!f.employee || !window.confirm('Remove the attendance record for this employee and date?')) return
    const { error } = await createClient().rpc('hr_clear_attendance', { p_employee_id: f.employee, p_date: f.date })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: 'Record removed.' }); load() }
  }

  return (
    <>
      <div className="cards">
        <div className="card"><span>Checked in</span><strong>{recs.length}</strong><small>{recs.filter(r => isLate(r.check_in)).length} late</small></div>
        <div className="card"><span>On leave</span><strong>{away.length}</strong><small>Approved leave</small></div>
        <div className="card"><span>Not in yet</span><strong>{notIn.length}</strong><small>Not on leave</small></div>
        <div className="card"><span>Staff</span><strong>{people.length}</strong><small>Active</small></div>
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <div className="panel"><h2>Checked in today</h2>
          {recs.length === 0 ? <p className="empty">Nobody has checked in yet.</p> : (
            <table><thead><tr><th>Employee</th><th>In</th><th>Out</th></tr></thead><tbody>
              {[...recs].sort((a, b) => String(a.check_in).localeCompare(String(b.check_in))).map(r => <tr key={r.id}><td>{name(r.employee_id)}</td>
                <td>{timeIn(r.check_in, tz)}{isLate(r.check_in) && <> <span className="status rejected">Late</span></>}</td><td>{timeIn(r.check_out, tz)}</td></tr>)}
            </tbody></table>)}
        </div>
        <div className="panel"><h2>Not in yet</h2>
          {notIn.length === 0 ? <p className="empty">Everyone is accounted for.</p> : notIn.map(p => <div className="row" key={p.id}><span>{fullName(p)}</span><span className="muted">{p.employee_no}</span></div>)}
          {away.length > 0 && <><h2 style={{ marginTop: 14 }}>On leave</h2>{away.map(a => <div className="row" key={a.employee_id}><span>{a.employee_name}</span><span className="muted">until {fmtDate(a.end_date)}</span></div>)}</>}
        </div>
      </div>

      {isHr && (
        <>
          <h2 style={{ marginTop: 22 }}>Add or correct a day</h2>
          <form className="form-grid" onSubmit={save}>
            <label>Employee *<select required value={f.employee} onChange={e => setF({ ...f, employee: e.target.value })}><option value="">Select…</option>{people.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></label>
            <label>Date *<input type="date" required value={f.date} onChange={e => setF({ ...f, date: e.target.value })} /></label>
            <label>Check-in time *<input type="time" required value={f.cin} onChange={e => setF({ ...f, cin: e.target.value })} /></label>
            <label>Check-out time<input type="time" value={f.cout} onChange={e => setF({ ...f, cout: e.target.value })} /></label>
            <label>Reason (optional)<input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="e.g. forgot to check in" /></label>
            <div className="actions"><button className="primary">Save record</button><button type="button" className="mini danger" style={{ padding: '10px 14px' }} onClick={clear}>Remove this day’s record</button></div>
          </form>
        </>
      )}
    </>
  )
}

/* ---------------- Monthly report ---------------- */
function ReportTab({ canTeam, setMsg }: any) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [rows, setRows] = useState<any[] | null>(null)

  useEffect(() => {
    setRows(null)
    createClient().rpc('attendance_month_report', { p_year: year, p_month: month }).then(({ data, error }) => {
      if (error) setMsg({ kind: 'error', text: errMsg(error) })
      setRows((data as any[]) ?? [])
    })
  }, [year, month, setMsg])

  const t = (k: string) => (rows ?? []).reduce((a, r) => a + Number(r[k] ?? 0), 0)
  function exportCsv() {
    downloadCsv(`attendance-${year}-${String(month).padStart(2, '0')}.csv`, [['Employee no.', 'Name', 'Department', 'Working days', 'Leave days', 'Present', 'Late', 'Absent', 'Hours worked'],
      ...(rows ?? []).map(r => [r.employee_no, r.employee_name, r.department ?? '', r.working_days, r.leave_days, r.present_days, r.late_days, r.absent_days, r.hours_worked])])
  }

  return (
    <>
      <div className="filters" style={{ alignItems: 'end' }}>
        <label>Month<select value={month} onChange={e => setMonth(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}</select></label>
        <label>Year<input type="number" min="2000" max="2100" value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 100 }} /></label>
        {canTeam && <button className="mini" style={{ padding: '10px 14px' }} onClick={exportCsv} disabled={!rows}>Export to Excel (CSV)</button>}
      </div>
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No data for this month.</p> : (
          <table><thead><tr><th>Employee</th><th className="num">Working days</th><th className="num">Leave</th><th className="num">Present</th><th className="num">Late</th><th className="num">Absent</th><th className="num">Hours</th></tr></thead><tbody>
            {rows.map(r => <tr key={r.employee_id}><td><strong>{r.employee_name}</strong><br /><span className="muted">{r.employee_no}{r.department ? ` · ${r.department}` : ''}</span></td>
              <td className="num">{r.working_days}</td><td className="num">{r.leave_days}</td><td className="num">{r.present_days}</td>
              <td className="num">{r.late_days > 0 ? <span className="status rejected">{r.late_days}</span> : 0}</td>
              <td className="num">{r.absent_days > 0 ? <span className="status rejected">{r.absent_days}</span> : 0}</td><td className="num">{r.hours_worked}</td></tr>)}
          </tbody>
          {rows.length > 1 && <tfoot><tr><td>Total</td><td className="num">{t('working_days')}</td><td className="num">{t('leave_days')}</td><td className="num">{t('present_days')}</td><td className="num">{t('late_days')}</td><td className="num">{t('absent_days')}</td><td className="num">{t('hours_worked').toFixed(1)}</td></tr></tfoot>}
          </table>)}
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>Working days exclude weekends and public holidays. Absent means a working day with no check-in and no approved leave; today is not counted until the day ends.</p>
      </div>
    </>
  )
}

/* ---------------- Settings (HR admin) ---------------- */
function SettingsTab({ settings, orgId, setMsg, reload }: any) {
  const [f, setF] = useState({ start: String(settings.work_start).slice(0, 5), end: String(settings.work_end).slice(0, 5), grace: String(settings.grace_minutes), tz: settings.timezone })
  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('attendance_settings').update({ work_start: f.start, work_end: f.end, grace_minutes: Number(f.grace), timezone: f.tz.trim() }).eq('organization_id', orgId)
    if (error) setMsg({ kind: 'error', text: errMsg(error) }); else { setMsg({ kind: 'success', text: 'Settings saved.' }); reload() }
  }
  return (
    <form className="form-grid" onSubmit={save}>
      <label>Work starts<input type="time" required value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label>
      <label>Work ends<input type="time" required value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
      <label>Grace period (minutes)<input type="number" min="0" max="240" required value={f.grace} onChange={e => setF({ ...f, grace: e.target.value })} /></label>
      <label>Time zone<input required value={f.tz} onChange={e => setF({ ...f, tz: e.target.value })} /></label>
      <div className="actions"><button className="primary">Save settings</button></div>
    </form>
  )
}
