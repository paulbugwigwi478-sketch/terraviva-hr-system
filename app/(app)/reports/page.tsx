'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { downloadCsv, errMsg, fetchAll, fullName, pretty } from '@/lib/format'

type Tab = 'headcount' | 'leave'

export default function ReportsPage() {
  const [tab, setTab] = useState<Tab>('headcount')
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [emps, setEmps] = useState<any[] | null>(null)
  const [leave, setLeave] = useState<any[]>([])
  const [error, setError] = useState('')

  useEffect(() => {
    createClient().from('employees').select('id,employee_no,first_name,middle_name,last_name,gender,status,employment_type,hire_date,departments(name),positions(title)')
      .order('last_name').then(({ data, error }) => { if (error) setError(error.message); setEmps(data ?? []) })
  }, [])
  useEffect(() => {
    const sb = createClient()
    fetchAll<any>((a, b) => sb.from('leave_requests').select('employee_id,days,leave_types(name)').eq('status', 'approved')
      .gte('start_date', `${year}-01-01`).lte('start_date', `${year}-12-31`).range(a, b) as any).then(setLeave).catch(e => setError(errMsg(e)))
  }, [year])

  const active = useMemo(() => (emps ?? []).filter(e => e.status === 'active'), [emps])
  const count = (key: (e: any) => string) => {
    const m: Record<string, number> = {}
    active.forEach(e => { const k = key(e) || '—'; m[k] = (m[k] ?? 0) + 1 })
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }
  const byDept = count(e => e.departments?.name), byType = count(e => pretty(e.employment_type)), byGender = count(e => pretty(e.gender))

  const types = useMemo(() => Array.from(new Set(leave.map(l => l.leave_types?.name as string))).sort(), [leave])
  const perEmp = useMemo(() => {
    const m = new Map<string, Record<string, number>>()
    leave.forEach(l => { const r = m.get(l.employee_id) ?? {}; r[l.leave_types?.name] = (r[l.leave_types?.name] ?? 0) + Number(l.days); m.set(l.employee_id, r) })
    return m
  }, [leave])

  function exportCsv() {
    if (tab === 'headcount') downloadCsv('terraviva-employees.csv', [['No.', 'Name', 'Gender', 'Department', 'Position', 'Type', 'Status', 'Hire date'],
      ...(emps ?? []).map(e => [e.employee_no, fullName(e), pretty(e.gender), e.departments?.name ?? '', e.positions?.title ?? '', pretty(e.employment_type), pretty(e.status), e.hire_date ?? ''])])
    else downloadCsv(`terraviva-leave-${year}.csv`, [['No.', 'Name', ...types, 'Total'],
      ...(emps ?? []).filter(e => perEmp.has(e.id)).map(e => { const r = perEmp.get(e.id)!; return [e.employee_no, fullName(e), ...types.map(t => r[t] ?? 0), (Object.values(r) as number[]).reduce((a, b) => a + b, 0)] })])
  }

  const block = (title: string, rows: [string, number][]) => (
    <div className="panel"><h2>{title}</h2>{rows.length === 0 ? <p className="empty">No data.</p> : rows.map(([k, v]) => <div className="row" key={k}><span>{k}</span><b>{v}</b></div>)}</div>)

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Reports</h1><p className="muted">Headcount counts active employees only.</p></div>
        <button className="primary" onClick={exportCsv} disabled={!emps}>Export to Excel (CSV)</button></div>
      <div className="tabs">{([['headcount', 'Headcount'], ['leave', 'Leave taken']] as [Tab, string][]).map(([k, l]) => <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => setTab(k)}>{l}</button>)}</div>
      {error && <p className="error msg">{error}</p>}
      {emps === null ? <p className="empty">Loading…</p> : tab === 'headcount' ? (
        <><div className="cards three"><div className="card"><span>Active employees</span><strong>{active.length}</strong><small>of {emps.length} records</small></div></div>
          <div className="split" style={{ marginTop: 16 }}>{block('By department', byDept)}{block('By employment type', byType)}</div>
          {block('By gender', byGender)}</>
      ) : (
        <>
          <div className="filters"><label>Year<input type="number" min="2000" max="2100" value={year} onChange={e => setYear(e.target.value)} style={{ width: 100 }} /></label></div>
          <div className="panel">
            {perEmp.size === 0 ? <p className="empty">No approved leave in {year}.</p> : (
              <table><thead><tr><th>Employee</th>{types.map(t => <th key={t} className="num">{t}</th>)}<th className="num">Total</th></tr></thead><tbody>
                {emps.filter(e => perEmp.has(e.id)).map(e => { const r = perEmp.get(e.id)!; return (
                  <tr key={e.id}><td><strong>{fullName(e)}</strong></td>{types.map(t => <td key={t} className="num">{r[t] ?? 0}</td>)}<td className="num"><strong>{(Object.values(r) as number[]).reduce((a, b) => a + b, 0)}</strong></td></tr>) })}
              </tbody></table>)}
          </div>
        </>
      )}
    </div>
  )
}
