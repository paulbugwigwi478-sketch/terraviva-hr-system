'use client'

import Link from 'next/link'
import { useParams } from 'next/navigation'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { errMsg, fmtDate, fullName, money, pretty, todayIso } from '@/lib/format'
import { CONTRACT_STATUSES, CONTRACT_TYPES, DOC_CATEGORIES, EMPLOYEE_STATUSES, EMPLOYMENT_TYPES, MAX_UPLOAD_BYTES } from '@/lib/hr'

type Msg = { kind: 'error' | 'success'; text: string } | null
const clean = (v: any) => (typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v)

export default function EmployeePage() {
  const { id } = useParams<{ id: string }>()
  const { profile, org } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const [emp, setEmp] = useState<any | null | undefined>(undefined)
  const [depts, setDepts] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [msg, setMsg] = useState<Msg>(null)

  const isSelf = emp?.id === profile.employee_id
  const seesSensitive = isHr || can(profile.role, ['director']) || isSelf
  const seesSalary = isHr || can(profile.role, ['director'])
  const seesContracts = seesSensitive || can(profile.role, ['auditor'])

  const load = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('employees').select('*, departments(name), positions(title), manager:employees!manager_id(id,first_name,last_name)').eq('id', id).maybeSingle()
    setEmp(data ?? null)
    if (isHr) {
      const [d, p, e] = await Promise.all([
        sb.from('departments').select('id,name').order('name'), sb.from('positions').select('id,title').order('title'),
        sb.from('employees').select('id,first_name,last_name').order('last_name'),
      ])
      setDepts(d.data ?? []); setPositions(p.data ?? []); setPeople(e.data ?? [])
    }
  }, [id, isHr])
  useEffect(() => { load() }, [load])

  if (emp === undefined) return <p className="empty">Loading…</p>
  if (emp === null) return <div className="module-page"><div className="panel"><p className="empty">This employee record was not found, or you do not have access to it. <Link href="/">Back to dashboard</Link></p></div></div>

  const initials = `${emp.first_name?.[0] ?? ''}${emp.last_name?.[0] ?? ''}`.toUpperCase()
  return (
    <div className="module-page">
      <div className="profile-head">
        <div className="big">{initials}</div>
        <div><h1 style={{ margin: 0, fontSize: 23 }}>{fullName(emp)}</h1>
          <p className="muted">{emp.employee_no} · {emp.positions?.title ?? 'No position'} · {emp.departments?.name ?? 'No department'} · <span className={`status ${emp.status}`}>{pretty(emp.status)}</span></p></div>
      </div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}

      <ProfileSection emp={emp} isHr={isHr} depts={depts} positions={positions} people={people} setMsg={setMsg} reload={load} />
      {seesSensitive && <PrivateSection emp={emp} orgId={org.id} isHr={isHr} setMsg={setMsg} />}
      {seesSalary && <CompensationSection emp={emp} orgId={org.id} isHr={isHr} setMsg={setMsg} />}
      {seesContracts && <ContractsSection emp={emp} orgId={org.id} isHr={isHr} setMsg={setMsg} />}
      {seesSensitive && <DocumentsSection emp={emp} orgId={org.id} isHr={isHr} setMsg={setMsg} />}
      <LeaveSection emp={emp} />
    </div>
  )
}

/* ---------------- Profile ---------------- */
function ProfileSection({ emp, isHr, depts, positions, people, setMsg, reload }: any) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState<any>({})
  const [busy, setBusy] = useState(false)
  const start = () => { setF({ ...emp }); setEdit(true); setMsg(null) }
  const set = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }))

  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true)
    const keys = ['first_name', 'middle_name', 'last_name', 'gender', 'date_of_birth', 'marital_status', 'phone', 'work_email', 'personal_email', 'department_id', 'position_id', 'manager_id',
      'employment_type', 'status', 'hire_date', 'probation_end_date', 'termination_date', 'termination_reason']
    const payload: any = {}
    for (const k of keys) payload[k] = clean(f[k])
    if (payload.work_email) payload.work_email = payload.work_email.toLowerCase()
    const { error } = await createClient().from('employees').update(payload).eq('id', emp.id)
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setMsg({ kind: 'success', text: 'Employee updated.' }); setEdit(false); reload()
  }

  const T = (k: string, label: string, type = 'text') => <label>{label}<input type={type} value={f[k] ?? ''} onChange={e => set(k, e.target.value)} /></label>
  const S = (k: string, label: string, opts: { v: string; l: string }[]) =>
    <label>{label}<select value={f[k] ?? ''} onChange={e => set(k, e.target.value)}><option value="">—</option>{opts.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}</select></label>

  return (
    <div className="panel">
      <div className="page-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Employment details</h2>
        {isHr && !edit && <button className="mini" onClick={start}>Edit</button>}</div>
      {!edit ? (
        <dl className="kv">
          <div><dt>Gender</dt><dd>{pretty(emp.gender) || '—'}</dd></div>
          <div><dt>Date of birth</dt><dd>{fmtDate(emp.date_of_birth)}</dd></div>
          <div><dt>Marital status</dt><dd>{emp.marital_status ?? '—'}</dd></div>
          <div><dt>Phone</dt><dd>{emp.phone ?? '—'}</dd></div>
          <div><dt>Work email</dt><dd>{emp.work_email ?? '—'}</dd></div>
          <div><dt>Personal email</dt><dd>{emp.personal_email ?? '—'}</dd></div>
          <div><dt>Manager</dt><dd>{emp.manager ? <Link href={`/employees/${emp.manager.id}`}>{fullName(emp.manager)}</Link> : '—'}</dd></div>
          <div><dt>Employment type</dt><dd>{pretty(emp.employment_type)}</dd></div>
          <div><dt>Hire date</dt><dd>{fmtDate(emp.hire_date)}</dd></div>
          <div><dt>Probation ends</dt><dd>{fmtDate(emp.probation_end_date)}</dd></div>
          {emp.termination_date && <div><dt>Left on</dt><dd>{fmtDate(emp.termination_date)}</dd></div>}
          {emp.termination_reason && <div><dt>Reason</dt><dd>{emp.termination_reason}</dd></div>}
          <div><dt>Login linked</dt><dd>{emp.user_id ? 'Yes' : 'Not yet'}</dd></div>
        </dl>
      ) : (
        <form className="form-grid" onSubmit={save} style={{ border: 0, padding: 0 }}>
          {T('first_name', 'First name')}{T('middle_name', 'Middle name')}{T('last_name', 'Last name')}
          {S('gender', 'Gender', [{ v: 'female', l: 'Female' }, { v: 'male', l: 'Male' }])}
          {T('date_of_birth', 'Date of birth', 'date')}{T('marital_status', 'Marital status')}{T('phone', 'Phone')}
          {T('work_email', 'Work email', 'email')}{T('personal_email', 'Personal email', 'email')}
          {S('department_id', 'Department', depts.map((d: any) => ({ v: d.id, l: d.name })))}
          {S('position_id', 'Position', positions.map((d: any) => ({ v: d.id, l: d.title })))}
          {S('manager_id', 'Manager', people.filter((p: any) => p.id !== emp.id).map((p: any) => ({ v: p.id, l: fullName(p) })))}
          {S('employment_type', 'Employment type', EMPLOYMENT_TYPES.map(t => ({ v: t, l: pretty(t) })))}
          {S('status', 'Status', EMPLOYEE_STATUSES.map(t => ({ v: t, l: pretty(t) })))}
          {T('hire_date', 'Hire date', 'date')}{T('probation_end_date', 'Probation ends', 'date')}
          {T('termination_date', 'Left on', 'date')}{T('termination_reason', 'Reason for leaving')}
          <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setEdit(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  )
}

/* ---------------- Personal & bank details ---------------- */
function PrivateSection({ emp, orgId, isHr, setMsg }: any) {
  const [d, setD] = useState<any | null | undefined>(undefined)
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState<any>({})
  const FIELDS: [string, string][] = [['national_id', 'National ID (NIDA)'], ['tin', 'TIN'], ['nssf_number', 'NSSF number'], ['bank_name', 'Bank'], ['bank_account', 'Bank account number'],
    ['home_address', 'Home address'], ['emergency_contact_name', 'Emergency contact'], ['emergency_contact_phone', 'Emergency phone'], ['emergency_contact_relation', 'Relationship']]
  const load = useCallback(async () => {
    const { data } = await createClient().from('employee_private').select('*').eq('employee_id', emp.id).maybeSingle()
    setD(data ?? null)
  }, [emp.id])
  useEffect(() => { load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    const payload: any = { employee_id: emp.id, organization_id: orgId, updated_at: new Date().toISOString() }
    FIELDS.forEach(([k]) => { payload[k] = clean(f[k]) })
    const { error } = await createClient().from('employee_private').upsert(payload, { onConflict: 'employee_id' })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setMsg({ kind: 'success', text: 'Personal details saved.' }); setEdit(false); load()
  }

  return (
    <div className="panel">
      <div className="page-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Personal, tax and bank details</h2>
        {isHr && !edit && <button className="mini" onClick={() => { setF({ ...(d ?? {}) }); setEdit(true) }}>Edit</button>}</div>
      {d === undefined ? <p className="empty">Loading…</p> : !edit ? (
        d === null ? <p className="empty">No details recorded yet.</p> :
          <dl className="kv">{FIELDS.map(([k, l]) => <div key={k}><dt>{l}</dt><dd>{d[k] ?? '—'}</dd></div>)}</dl>
      ) : (
        <form className="form-grid" onSubmit={save} style={{ border: 0, padding: 0 }}>
          {FIELDS.map(([k, l]) => <label key={k}>{l}<input value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>)}
          <div className="actions"><button className="primary">Save</button>
            <button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setEdit(false)}>Cancel</button></div>
        </form>
      )}
    </div>
  )
}

/* ---------------- Salary (HR and Director only) ---------------- */
function CompensationSection({ emp, orgId, isHr, setMsg }: any) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [f, setF] = useState<any | null>(null)
  const load = useCallback(async () => {
    const { data } = await createClient().from('employee_compensation').select('*').eq('employee_id', emp.id).order('effective_date', { ascending: false })
    setRows(data ?? [])
  }, [emp.id])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('employee_compensation').insert({
      organization_id: orgId, employee_id: emp.id, base_salary: Number(f.base_salary), currency_code: f.currency_code, effective_date: f.effective_date, note: clean(f.note) })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setF(null); setMsg({ kind: 'success', text: 'Salary record added.' }); load()
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this salary record?')) return
    const { error } = await createClient().from('employee_compensation').delete().eq('id', id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }

  return (
    <div className="panel">
      <div className="page-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Salary history <span className="muted" style={{ fontWeight: 400 }}>(HR and Director only)</span></h2>
        {isHr && !f && <button className="mini" onClick={() => setF({ base_salary: '', currency_code: 'TZS', effective_date: todayIso(), note: '' })}>Add salary</button>}</div>
      {f && (
        <form className="form-grid" onSubmit={add} style={{ border: 0, padding: 0 }}>
          <label>Monthly base salary *<input type="number" min="0" step="0.01" required value={f.base_salary} onChange={e => setF({ ...f, base_salary: e.target.value })} /></label>
          <label>Currency<select value={f.currency_code} onChange={e => setF({ ...f, currency_code: e.target.value })}><option>TZS</option><option>USD</option></select></label>
          <label>Effective from *<input type="date" required value={f.effective_date} onChange={e => setF({ ...f, effective_date: e.target.value })} /></label>
          <label>Note<input value={f.note} onChange={e => setF({ ...f, note: e.target.value })} placeholder="e.g. Annual increment" /></label>
          <div className="actions"><button className="primary">Save</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setF(null)}>Cancel</button></div>
        </form>)}
      {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No salary recorded.</p> : (
        <table><thead><tr><th>Effective from</th><th className="num">Base salary</th><th>Note</th>{isHr && <th />}</tr></thead><tbody>
          {rows.map((r, i) => <tr key={r.id}><td>{fmtDate(r.effective_date)}{i === 0 && <> <span className="status active">Current</span></>}</td>
            <td className="num">{money(r.base_salary, r.currency_code)}</td><td>{r.note ?? '—'}</td>
            {isHr && <td style={{ textAlign: 'right' }}><button className="mini danger" onClick={() => remove(r.id)}>Delete</button></td>}</tr>)}
        </tbody></table>)}
    </div>
  )
}

/* ---------------- Contracts ---------------- */
function ContractsSection({ emp, orgId, isHr, setMsg }: any) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [f, setF] = useState<any | null>(null)
  const load = useCallback(async () => {
    const { data } = await createClient().from('contracts').select('*').eq('employee_id', emp.id).order('start_date', { ascending: false })
    setRows(data ?? [])
  }, [emp.id])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('contracts').insert({
      organization_id: orgId, employee_id: emp.id, contract_type: f.contract_type, start_date: f.start_date, end_date: clean(f.end_date), status: f.status, notes: clean(f.notes) })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setF(null); setMsg({ kind: 'success', text: 'Contract added.' }); load()
  }
  async function setStatus(id: string, status: string) {
    const { error } = await createClient().from('contracts').update({ status }).eq('id', id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }
  async function remove(id: string) {
    if (!window.confirm('Delete this contract record?')) return
    const { error } = await createClient().from('contracts').delete().eq('id', id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }

  return (
    <div className="panel">
      <div className="page-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>Contracts</h2>
        {isHr && !f && <button className="mini" onClick={() => setF({ contract_type: 'fixed_term', start_date: todayIso(), end_date: '', status: 'active', notes: '' })}>Add contract</button>}</div>
      {f && (
        <form className="form-grid" onSubmit={add} style={{ border: 0, padding: 0 }}>
          <label>Type<select value={f.contract_type} onChange={e => setF({ ...f, contract_type: e.target.value })}>{CONTRACT_TYPES.map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select></label>
          <label>Start date *<input type="date" required value={f.start_date} onChange={e => setF({ ...f, start_date: e.target.value })} /></label>
          <label>End date (empty if permanent)<input type="date" value={f.end_date} onChange={e => setF({ ...f, end_date: e.target.value })} /></label>
          <label>Status<select value={f.status} onChange={e => setF({ ...f, status: e.target.value })}>{CONTRACT_STATUSES.map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select></label>
          <label>Notes<input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></label>
          <div className="actions"><button className="primary">Save</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setF(null)}>Cancel</button></div>
        </form>)}
      {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No contracts recorded.</p> : (
        <table><thead><tr><th>Type</th><th>Start</th><th>End</th><th>Status</th><th>Notes</th>{isHr && <th />}</tr></thead><tbody>
          {rows.map(r => <tr key={r.id}><td>{pretty(r.contract_type)}</td><td>{fmtDate(r.start_date)}</td><td>{r.end_date ? fmtDate(r.end_date) : 'Open-ended'}</td>
            <td>{isHr ? <select value={r.status} onChange={e => setStatus(r.id, e.target.value)} style={{ width: 'auto' }}>{CONTRACT_STATUSES.map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select>
              : <span className={`status ${r.status}`}>{pretty(r.status)}</span>}</td><td>{r.notes ?? '—'}</td>
            {isHr && <td style={{ textAlign: 'right' }}><button className="mini danger" onClick={() => remove(r.id)}>Delete</button></td>}</tr>)}
        </tbody></table>)}
    </div>
  )
}

/* ---------------- Documents (private storage) ---------------- */
function DocumentsSection({ emp, orgId, isHr, setMsg }: any) {
  const [rows, setRows] = useState<any[] | null>(null)
  const [category, setCategory] = useState('contract')
  const [expires, setExpires] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const { data } = await createClient().from('documents').select('*').eq('employee_id', emp.id).order('uploaded_at', { ascending: false })
    setRows(data ?? [])
  }, [emp.id])
  useEffect(() => { load() }, [load])

  async function upload(files: FileList | null) {
    if (!files?.length) return
    setBusy(true); setMsg(null)
    const sb = createClient(); let ok = 0
    for (const file of Array.from(files)) {
      if (file.size > MAX_UPLOAD_BYTES) { setMsg({ kind: 'error', text: `${file.name} is larger than 25 MB.` }); continue }
      const path = `${orgId}/${emp.id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`
      const up = await sb.storage.from('hr-documents').upload(path, file, { contentType: file.type || undefined })
      if (up.error) { setMsg({ kind: 'error', text: `${file.name}: ${up.error.message}` }); continue }
      const ins = await sb.from('documents').insert({ organization_id: orgId, employee_id: emp.id, name: file.name, category, storage_path: path, mime_type: file.type || null, file_size: file.size, expires_on: expires || null })
      if (ins.error) { await sb.storage.from('hr-documents').remove([path]); setMsg({ kind: 'error', text: errMsg(ins.error) }); continue }
      ok++
    }
    setBusy(false)
    if (ok) { setMsg({ kind: 'success', text: `${ok} file${ok === 1 ? '' : 's'} uploaded.` }); load() }
  }
  async function open(d: any) {
    const { data, error } = await createClient().storage.from('hr-documents').createSignedUrl(d.storage_path, 120)
    if (error || !data) setMsg({ kind: 'error', text: error?.message ?? 'Could not open the file.' }); else window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function remove(d: any) {
    if (!window.confirm(`Delete “${d.name}”?`)) return
    const sb = createClient()
    const { error } = await sb.from('documents').delete().eq('id', d.id)
    if (error) return setMsg({ kind: 'error', text: error.message })
    await sb.storage.from('hr-documents').remove([d.storage_path]); load()
  }

  return (
    <div className="panel">
      <h2>Documents <span className="muted" style={{ fontWeight: 400 }}>(private)</span></h2>
      {isHr && (
        <div className="filters" style={{ alignItems: 'end' }}>
          <label>Type<select value={category} onChange={e => setCategory(e.target.value)}>{DOC_CATEGORIES.map(c => <option key={c} value={c}>{pretty(c)}</option>)}</select></label>
          <label>Expires on (optional)<input type="date" value={expires} onChange={e => setExpires(e.target.value)} /></label>
          <label>Choose files (PDF, image, Word, Excel · max 25 MB)<input type="file" multiple disabled={busy} accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx,.xls,.xlsx" onChange={e => { upload(e.target.files); e.target.value = '' }} /></label>
          {busy && <span className="muted">Uploading…</span>}
        </div>)}
      {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No documents.</p> : (
        <table><thead><tr><th>File</th><th>Type</th><th>Expires</th><th>Added</th><th /></tr></thead><tbody>
          {rows.map(d => <tr key={d.id}><td><strong>{d.name}</strong></td><td>{pretty(d.category)}</td>
            <td>{d.expires_on ? <span className={d.expires_on < todayIso() ? 'status rejected' : ''}>{fmtDate(d.expires_on)}</span> : '—'}</td><td>{fmtDate(d.uploaded_at)}</td>
            <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="mini" onClick={() => open(d)}>View</button>{isHr && <button className="mini danger" onClick={() => remove(d)}>Delete</button>}</td></tr>)}
        </tbody></table>)}
    </div>
  )
}

/* ---------------- Leave balances ---------------- */
function LeaveSection({ emp }: any) {
  const year = new Date().getFullYear()
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    createClient().rpc('leave_balances_for', { p_employee_id: emp.id, p_year: year }).then(({ data }) => setRows((data as any[]) ?? []))
  }, [emp.id, year])
  return (
    <div className="panel"><h2>Leave balances, {year}</h2>
      {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">Not available.</p> : (
        <table><thead><tr><th>Leave type</th><th className="num">Entitled</th><th className="num">Carried over</th><th className="num">Used</th><th className="num">Pending</th><th className="num">Remaining</th></tr></thead><tbody>
          {rows.map((r: any) => <tr key={r.leave_type_id}><td><strong>{r.name}</strong></td><td className="num">{r.entitled ?? '∞'}</td><td className="num">{r.carried_over}</td>
            <td className="num">{r.used}</td><td className="num">{r.pending}</td><td className="num"><strong>{r.remaining ?? '∞'}</strong></td></tr>)}
        </tbody></table>)}
    </div>
  )
}
