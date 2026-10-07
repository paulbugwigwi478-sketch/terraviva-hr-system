'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { errMsg, fmtDate, fullName, money, pretty } from '@/lib/format'

type Msg = { kind: 'error' | 'success'; text: string } | null
const STATUSES = ['planned', 'ongoing', 'completed', 'cancelled']
const PSTATUS = ['registered', 'attended', 'completed', 'absent']
const clean = (v: string) => (v.trim() === '' ? null : v.trim())

export default function TrainingPage() {
  const { profile, isManager } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const canCatalogue = can(profile.role, ['hr_admin', 'director', 'auditor']) || isManager
  const [tab, setTab] = useState<'mine' | 'catalogue'>(profile.employee_id ? 'mine' : 'catalogue')
  const [msg, setMsg] = useState<Msg>(null)

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Training</h1><p className="muted">Courses, workshops and the people who attend them.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      <div className="tabs">
        {profile.employee_id && <button className={`tab${tab === 'mine' ? ' on' : ''}`} onClick={() => setTab('mine')}>My training</button>}
        {canCatalogue && <button className={`tab${tab === 'catalogue' ? ' on' : ''}`} onClick={() => setTab('catalogue')}>{isHr || can(profile.role, ['director', 'auditor']) ? 'All trainings' : 'My team’s trainings'}</button>}
      </div>
      {tab === 'mine' && profile.employee_id && <Mine empId={profile.employee_id} setMsg={setMsg} />}
      {tab === 'catalogue' && canCatalogue && <Catalogue isHr={isHr} canViewCert={can(profile.role, ['hr_admin', 'director'])} setMsg={setMsg} />}
    </div>
  )
}

/* ---------------- My training ---------------- */
function Mine({ empId, setMsg }: any) {
  const [rows, setRows] = useState<any[] | null>(null)
  useEffect(() => {
    createClient().from('training_participants').select('*, trainings(title,provider,location,start_date,end_date,status)').eq('employee_id', empId)
      .then(({ data, error }) => { if (error) setMsg({ kind: 'error', text: error.message }); setRows(data ?? []) })
  }, [empId, setMsg])

  async function viewCert(path: string) {
    const { data, error } = await createClient().storage.from('hr-documents').createSignedUrl(path, 120)
    if (error || !data) setMsg({ kind: 'error', text: error?.message ?? 'Could not open the certificate.' }); else window.open(data.signedUrl, '_blank', 'noopener')
  }
  const sorted = [...(rows ?? [])].sort((a, b) => String(b.trainings?.start_date).localeCompare(String(a.trainings?.start_date)))
  return (
    <div className="panel">
      {rows === null ? <p className="empty">Loading…</p> : sorted.length === 0 ? <p className="empty">You have not been registered for any training yet.</p> : (
        <table><thead><tr><th>Training</th><th>Dates</th><th>Where</th><th>My status</th><th /></tr></thead><tbody>
          {sorted.map(r => <tr key={r.id}><td><strong>{r.trainings?.title}</strong>{r.trainings?.provider && <><br /><span className="muted">{r.trainings.provider}</span></>}</td>
            <td>{fmtDate(r.trainings?.start_date)}{r.trainings?.end_date !== r.trainings?.start_date && <> – {fmtDate(r.trainings?.end_date)}</>}</td><td>{r.trainings?.location ?? '—'}</td>
            <td><span className={`status ${r.status === 'completed' ? 'active' : r.status === 'absent' ? 'rejected' : 'pending'}`}>{pretty(r.status)}</span></td>
            <td style={{ textAlign: 'right' }}>{r.certificate_path && <button className="mini" onClick={() => viewCert(r.certificate_path)}>Certificate</button>}</td></tr>)}
        </tbody></table>)}
    </div>
  )
}

/* ---------------- All trainings ---------------- */
function Catalogue({ isHr, canViewCert, setMsg }: any) {
  const { org } = useApp()
  const [trainings, setTrainings] = useState<any[] | null>(null)
  const [parts, setParts] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [form, setForm] = useState<any | null>(null)

  const load = useCallback(async () => {
    const sb = createClient()
    const [t, p, e] = await Promise.all([
      sb.from('trainings').select('*').order('start_date', { ascending: false }),
      sb.from('training_participants').select('*'),
      sb.from('employees').select('id,first_name,middle_name,last_name,employee_no').eq('status', 'active').order('last_name'),
    ])
    if (t.error) setMsg({ kind: 'error', text: t.error.message })
    setTrainings(t.data ?? []); setParts(p.data ?? []); setPeople(e.data ?? [])
  }, [setMsg])
  useEffect(() => { load() }, [load])

  const year = String(new Date().getFullYear())
  const thisYear = (trainings ?? []).filter(t => String(t.start_date).startsWith(year) && t.status !== 'cancelled')
  const costTzs = thisYear.filter(t => t.currency_code === 'TZS').reduce((a, t) => a + Number(t.cost), 0)
  const trainedIds = new Set(parts.filter(p => thisYear.some(t => t.id === p.training_id) && ['attended', 'completed'].includes(p.status)).map(p => p.employee_id))
  const training = trainings?.find(t => t.id === sel) ?? null

  async function save(e: FormEvent) {
    e.preventDefault()
    const payload = { title: form.title.trim(), provider: clean(form.provider), location: clean(form.location), description: clean(form.description), start_date: form.start, end_date: form.end,
      cost: Number(form.cost || 0), currency_code: form.currency, capacity: form.capacity ? Number(form.capacity) : null, status: form.status }
    const sb = createClient()
    const { error } = form.id ? await sb.from('trainings').update(payload).eq('id', form.id) : await sb.from('trainings').insert({ ...payload, organization_id: org.id })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setForm(null); setMsg({ kind: 'success', text: 'Training saved.' }); load()
  }
  async function remove(t: any) {
    if (!window.confirm(`Delete “${t.title}” and its list of participants?`)) return
    const { error } = await createClient().from('trainings').delete().eq('id', t.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else { setSel(null); load() }
  }

  return (
    <>
      <div className="cards">
        <div className="card"><span>Trainings in {year}</span><strong>{thisYear.length}</strong><small>Not counting cancelled ones</small></div>
        <div className="card"><span>Staff trained in {year}</span><strong>{trainedIds.size}</strong><small>Attended or completed</small></div>
        <div className="card"><span>Training cost in {year}</span><strong>{money(costTzs, 'TZS')}</strong><small>TZS trainings only</small></div>
        <div className="card"><span>Coming up</span><strong>{(trainings ?? []).filter(t => t.status === 'planned' && t.start_date >= new Date().toISOString().slice(0, 10)).length}</strong><small>Planned</small></div>
      </div>

      <div className="page-head" style={{ marginTop: 18 }}><h2 style={{ margin: 0 }}>Trainings</h2>
        {isHr && !form && <button className="primary" onClick={() => setForm({ id: null, title: '', provider: '', location: '', description: '', start: '', end: '', cost: '', currency: 'TZS', capacity: '', status: 'planned' })}>Add training</button>}</div>
      {form && (
        <form className="form-grid" onSubmit={save}>
          <label>Title *<input required value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></label>
          <label>Provider / trainer<input value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })} /></label>
          <label>Location<input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} /></label>
          <label>Starts *<input type="date" required value={form.start} onChange={e => setForm({ ...form, start: e.target.value, end: form.end && form.end >= e.target.value ? form.end : e.target.value })} /></label>
          <label>Ends *<input type="date" required min={form.start} value={form.end} onChange={e => setForm({ ...form, end: e.target.value })} /></label>
          <label>Cost<input type="number" min="0" step="0.01" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></label>
          <label>Currency<select value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}><option>TZS</option><option>USD</option></select></label>
          <label>Places (empty = no limit)<input type="number" min="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} /></label>
          <label>Status<select value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>{STATUSES.map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
          <label>Description<textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></label>
          <div className="actions"><button className="primary">Save</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setForm(null)}>Cancel</button></div>
        </form>)}

      <div className="panel">
        {trainings === null ? <p className="empty">Loading…</p> : trainings.length === 0 ? <p className="empty">No trainings yet.</p> : (
          <table><thead><tr><th>Training</th><th>Dates</th><th className="num">People</th><th className="num">Cost</th><th>Status</th><th /></tr></thead><tbody>
            {trainings.map(t => { const n = parts.filter(p => p.training_id === t.id).length; return (
              <tr key={t.id} style={t.id === sel ? { background: '#f3f8f6' } : undefined}>
                <td><strong>{t.title}</strong><br /><span className="muted">{[t.provider, t.location].filter(Boolean).join(' · ')}</span></td>
                <td>{fmtDate(t.start_date)}{t.end_date !== t.start_date && <> – {fmtDate(t.end_date)}</>}</td>
                <td className="num">{n}{t.capacity ? ` / ${t.capacity}` : ''}</td>
                <td className="num">{Number(t.cost) > 0 ? money(t.cost, t.currency_code) : '—'}{Number(t.cost) > 0 && n > 0 && <><br /><span className="muted">{money(Number(t.cost) / n)} each</span></>}</td>
                <td><span className={`status ${t.status === 'completed' ? 'active' : t.status === 'cancelled' ? 'rejected' : 'pending'}`}>{pretty(t.status)}</span></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="mini" onClick={() => setSel(t.id === sel ? null : t.id)}>{t.id === sel ? 'Hide people' : 'People'}</button>
                  {isHr && <><button className="mini" onClick={() => setForm({ id: t.id, title: t.title, provider: t.provider ?? '', location: t.location ?? '', description: t.description ?? '', start: t.start_date, end: t.end_date, cost: String(t.cost), currency: t.currency_code, capacity: t.capacity ? String(t.capacity) : '', status: t.status })}>Edit</button>
                    <button className="mini danger" onClick={() => remove(t)}>Delete</button></>}</td></tr>) })}
          </tbody></table>)}
      </div>

      {training && <Participants training={training} parts={parts.filter(p => p.training_id === training.id)} people={people} isHr={isHr} canViewCert={canViewCert} orgId={org.id} setMsg={setMsg} reload={load} />}
    </>
  )
}

function Participants({ training, parts, people, isHr, canViewCert, orgId, setMsg, reload }: any) {
  const [q, setQ] = useState('')
  const [pick, setPick] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const taken = new Set(parts.map((p: any) => p.employee_id))
  const nameOf = (id: string) => fullName(people.find((p: any) => p.id === id))
  const free = useMemo(() => people.filter((p: any) => !taken.has(p.id) && fullName(p).toLowerCase().includes(q.toLowerCase())), [people, parts, q]) // eslint-disable-line react-hooks/exhaustive-deps

  async function register() {
    if (pick.size === 0) return
    setBusy(true)
    const { error } = await createClient().from('training_participants').insert(Array.from(pick).map(id => ({ organization_id: orgId, training_id: training.id, employee_id: id })))
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setPick(new Set()); setMsg({ kind: 'success', text: `${pick.size} registered. They have been notified.` }); reload()
  }
  async function setStatus(p: any, status: string) {
    const { error } = await createClient().from('training_participants').update({ status }).eq('id', p.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else reload()
  }
  async function remove(p: any) {
    if (!window.confirm(`Remove ${nameOf(p.employee_id)} from this training?`)) return
    const { error } = await createClient().from('training_participants').delete().eq('id', p.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else reload()
  }
  async function uploadCert(p: any, files: FileList | null) {
    const file = files?.[0]; if (!file) return
    if (file.size > 25 * 1024 * 1024) return setMsg({ kind: 'error', text: 'The file is larger than 25 MB.' })
    const sb = createClient(), path = `${orgId}/${p.employee_id}/cert-${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`
    const up = await sb.storage.from('hr-documents').upload(path, file, { contentType: file.type || undefined })
    if (up.error) return setMsg({ kind: 'error', text: up.error.message })
    const doc = await sb.from('documents').insert({ organization_id: orgId, employee_id: p.employee_id, name: `Certificate: ${training.title}`, category: 'certificate', storage_path: path, mime_type: file.type || null, file_size: file.size })
    const upd = await sb.from('training_participants').update({ certificate_path: path, status: 'completed' }).eq('id', p.id)
    if (doc.error || upd.error) setMsg({ kind: 'error', text: errMsg(doc.error ?? upd.error) }); else { setMsg({ kind: 'success', text: 'Certificate saved. It also appears in the employee’s documents.' }); reload() }
  }
  async function viewCert(path: string) {
    const { data, error } = await createClient().storage.from('hr-documents').createSignedUrl(path, 120)
    if (error || !data) setMsg({ kind: 'error', text: error?.message ?? 'Could not open the certificate.' }); else window.open(data.signedUrl, '_blank', 'noopener')
  }

  return (
    <div className="panel" style={{ borderColor: 'var(--teal)' }}>
      <h2>People in “{training.title}”</h2>
      {parts.length === 0 ? <p className="empty">Nobody registered yet.</p> : (
        <table><thead><tr><th>Employee</th><th>Status</th><th>Certificate</th>{isHr && <th />}</tr></thead><tbody>
          {parts.map((p: any) => <tr key={p.id}><td><strong>{nameOf(p.employee_id)}</strong></td>
            <td>{isHr ? <select value={p.status} onChange={e => setStatus(p, e.target.value)} style={{ width: 'auto' }}>{PSTATUS.map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select> : <span className={`status ${p.status === 'completed' ? 'active' : 'pending'}`}>{pretty(p.status)}</span>}</td>
            <td>{p.certificate_path ? (canViewCert ? <button className="mini" onClick={() => viewCert(p.certificate_path)}>View</button> : 'Yes') : '—'}
              {isHr && <label className="mini" style={{ cursor: 'pointer', marginLeft: 6 }}>{p.certificate_path ? 'Replace' : 'Upload'}<input type="file" hidden accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" onChange={e => { uploadCert(p, e.target.files); e.target.value = '' }} /></label>}</td>
            {isHr && <td style={{ textAlign: 'right' }}><button className="mini danger" onClick={() => remove(p)}>Remove</button></td>}</tr>)}
        </tbody></table>)}

      {isHr && (
        <div style={{ marginTop: 16 }}>
          <h2>Register people</h2>
          <input placeholder="Search by name" value={q} onChange={e => setQ(e.target.value)} style={{ marginBottom: 8, maxWidth: 280 }} />
          <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line)', borderRadius: 8, padding: 6 }}>
            {free.length === 0 ? <p className="empty">Everyone is already registered, or nobody matches.</p> : free.map((p: any) => (
              <label key={p.id} className="check" style={{ padding: '4px 6px' }}><input type="checkbox" checked={pick.has(p.id)} onChange={e => setPick(prev => { const n = new Set(prev); e.target.checked ? n.add(p.id) : n.delete(p.id); return n })} />{fullName(p)} <span className="muted">{p.employee_no}</span></label>))}
          </div>
          <div style={{ marginTop: 8 }}><button className="primary" disabled={busy || pick.size === 0} onClick={register}>{busy ? 'Registering…' : `Register ${pick.size || ''} selected`}</button></div>
        </div>)}
    </div>
  )
}
