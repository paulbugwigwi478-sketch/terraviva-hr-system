'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { errMsg, fmtDate, fullName, pretty } from '@/lib/format'
import { EMPLOYEE_STATUSES, EMPLOYMENT_TYPES } from '@/lib/hr'

export default function EmployeesPage() {
  const { profile, org } = useApp()
  const router = useRouter()
  const isHr = can(profile.role, ['hr_admin'])
  const [rows, setRows] = useState<any[] | null>(null)
  const [depts, setDepts] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [q, setQ] = useState('')
  const [dept, setDept] = useState('')
  const [status, setStatus] = useState('active')
  const [adding, setAdding] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ first_name: '', middle_name: '', last_name: '', gender: '', date_of_birth: '', phone: '', work_email: '', department_id: '', position_id: '', manager_id: '', employment_type: 'permanent', hire_date: '', probation_end_date: '' })
  const set = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const sb = createClient()
    ;(async () => {
      const [e, d, p] = await Promise.all([
        sb.from('employees').select('*, departments!employees_department_id_fkey(name), positions(title), manager:employees!manager_id(first_name,last_name)').order('last_name'),
        sb.from('departments').select('id,name').order('name'),
        sb.from('positions').select('id,title').order('title'),
      ])
      if (e.error) setErr(e.error.message)
      setRows(e.data ?? []); setDepts(d.data ?? []); setPositions(p.data ?? [])
    })()
  }, [])

  const shown = useMemo(() => (rows ?? []).filter(r =>
    (!status || r.status === status) && (!dept || r.department_id === dept) &&
    (!q || `${fullName(r)} ${r.employee_no} ${r.work_email ?? ''}`.toLowerCase().includes(q.toLowerCase()))), [rows, q, dept, status])

  async function add(e: FormEvent) {
    e.preventDefault(); setBusy(true); setErr('')
    const clean = (v: string) => (v.trim() === '' ? null : v.trim())
    const { data, error } = await createClient().from('employees').insert({
      organization_id: org.id, first_name: f.first_name.trim(), middle_name: clean(f.middle_name), last_name: f.last_name.trim(),
      gender: clean(f.gender), date_of_birth: clean(f.date_of_birth), phone: clean(f.phone), work_email: clean(f.work_email)?.toLowerCase() ?? null,
      department_id: clean(f.department_id), position_id: clean(f.position_id), manager_id: clean(f.manager_id),
      employment_type: f.employment_type, hire_date: clean(f.hire_date), probation_end_date: clean(f.probation_end_date),
    }).select('id').single()
    setBusy(false)
    if (error) return setErr(errMsg(error))
    router.push(`/employees/${data.id}`)
  }

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Employees</h1>
        <p className="muted">{isHr ? 'All Terraviva staff records.' : can(profile.role, ['director', 'auditor']) ? 'All Terraviva staff.' : 'The members of your team.'}</p></div>
        {isHr && !adding && <button className="primary" onClick={() => setAdding(true)}>Add employee</button>}</div>
      {err && <p className="error msg">{err}</p>}

      {adding && (
        <form className="form-grid" onSubmit={add}>
          <label>First name *<input value={f.first_name} onChange={e => set('first_name', e.target.value)} required /></label>
          <label>Middle name<input value={f.middle_name} onChange={e => set('middle_name', e.target.value)} /></label>
          <label>Last name *<input value={f.last_name} onChange={e => set('last_name', e.target.value)} required /></label>
          <label>Gender<select value={f.gender} onChange={e => set('gender', e.target.value)}><option value="">—</option><option value="female">Female</option><option value="male">Male</option></select></label>
          <label>Date of birth<input type="date" value={f.date_of_birth} onChange={e => set('date_of_birth', e.target.value)} /></label>
          <label>Phone<input value={f.phone} onChange={e => set('phone', e.target.value)} /></label>
          <label>Work email (used to link their login)<input type="email" value={f.work_email} onChange={e => set('work_email', e.target.value)} /></label>
          <label>Department<select value={f.department_id} onChange={e => set('department_id', e.target.value)}><option value="">—</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Position<select value={f.position_id} onChange={e => set('position_id', e.target.value)}><option value="">—</option>{positions.map(d => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
          <label>Manager<select value={f.manager_id} onChange={e => set('manager_id', e.target.value)}><option value="">—</option>{(rows ?? []).filter(r => r.status === 'active').map(r => <option key={r.id} value={r.id}>{fullName(r)}</option>)}</select></label>
          <label>Employment type<select value={f.employment_type} onChange={e => set('employment_type', e.target.value)}>{EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select></label>
          <label>Hire date<input type="date" value={f.hire_date} onChange={e => set('hire_date', e.target.value)} /></label>
          <label>Probation ends<input type="date" value={f.probation_end_date} onChange={e => set('probation_end_date', e.target.value)} /></label>
          <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Add employee'}</button>
            <button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setAdding(false)}>Cancel</button></div>
        </form>
      )}

      <div className="filters">
        <label>Search<input value={q} onChange={e => setQ(e.target.value)} placeholder="Name, number or email" /></label>
        <label>Department<select value={dept} onChange={e => setDept(e.target.value)}><option value="">All</option>{depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <label>Status<select value={status} onChange={e => setStatus(e.target.value)}><option value="">All</option>{EMPLOYEE_STATUSES.map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
      </div>

      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : shown.length === 0 ? <p className="empty">No employees found.</p> : (
          <table><thead><tr><th>No.</th><th>Name</th><th>Position</th><th>Department</th><th>Type</th><th>Status</th><th>Hired</th></tr></thead><tbody>
            {shown.map(r => (
              <tr key={r.id}><td>{r.employee_no}</td>
                <td><Link href={`/employees/${r.id}`}><strong>{fullName(r)}</strong></Link>{r.work_email && <><br /><span className="muted">{r.work_email}</span></>}</td>
                <td>{r.positions?.title ?? '—'}</td><td>{r.departments?.name ?? '—'}</td><td>{pretty(r.employment_type)}</td>
                <td><span className={`status ${r.status}`}>{pretty(r.status)}</span></td><td>{fmtDate(r.hire_date)}</td></tr>))}
          </tbody></table>)}
      </div>
    </div>
  )
}
