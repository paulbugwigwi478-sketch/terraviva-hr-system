'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { errMsg, fetchAll, fmtDate, fullName, pretty, todayIso } from '@/lib/format'
import { EMPLOYMENT_TYPES } from '@/lib/hr'

type Msg = { kind: 'error' | 'success'; text: string } | null
const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected']
const SOURCES = ['referral', 'website', 'social_media', 'agency', 'walk_in', 'other']
const clean = (v: string) => (v.trim() === '' ? null : v.trim())

export default function RecruitmentPage() {
  const { profile, org } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const [jobs, setJobs] = useState<any[] | null>(null)
  const [cands, setCands] = useState<any[]>([])
  const [depts, setDepts] = useState<any[]>([])
  const [positions, setPositions] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [selJob, setSelJob] = useState<string | null>(null)
  const [selCand, setSelCand] = useState<string | null>(null)
  const [showJob, setShowJob] = useState(false)
  const [showCand, setShowCand] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const sb = createClient()
    try {
      const [j, c, d, p, e] = await Promise.all([
        sb.from('job_openings').select('*, departments(name)').order('created_at', { ascending: false }),
        fetchAll<any>((a, b) => sb.from('candidates').select('*').order('created_at', { ascending: false }).range(a, b) as any),
        sb.from('departments').select('id,name').order('name'), sb.from('positions').select('id,title').order('title'),
        sb.from('employees').select('id,first_name,middle_name,last_name').eq('status', 'active').order('last_name'),
      ])
      if (j.error) setMsg({ kind: 'error', text: j.error.message })
      setJobs(j.data ?? []); setCands(c); setDepts(d.data ?? []); setPositions(p.data ?? []); setPeople(e.data ?? [])
    } catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); setJobs([]) }
  }, [])
  useEffect(() => { load() }, [load])

  const job = jobs?.find(j => j.id === selJob) ?? null
  const jobCands = useMemo(() => cands.filter(c => c.job_id === selJob), [cands, selJob])
  const cand = cands.find(c => c.id === selCand) ?? null

  async function addJob(e: FormEvent, f: any) {
    e.preventDefault()
    const { data, error } = await createClient().from('job_openings').insert({
      organization_id: org.id, title: f.title.trim(), department_id: clean(f.department), position_id: clean(f.position), employment_type: f.type,
      vacancies: Number(f.vacancies), closes_on: clean(f.closes), description: clean(f.description), requirements: clean(f.requirements), status: f.status }).select('id').single()
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setShowJob(false); setMsg({ kind: 'success', text: 'Job opening saved.' }); await load(); setSelJob(data.id)
  }
  async function setJobStatus(id: string, status: string) {
    const { error } = await createClient().from('job_openings').update({ status }).eq('id', id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }
  async function deleteJob() {
    if (!job || !window.confirm(`Delete “${job.title}” and all its candidates?`)) return
    const { error } = await createClient().from('job_openings').delete().eq('id', job.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else { setSelJob(null); setSelCand(null); load() }
  }
  async function addCandidate(e: FormEvent, f: any) {
    e.preventDefault()
    const { data, error } = await createClient().from('candidates').insert({ organization_id: org.id, job_id: selJob, full_name: f.name.trim(), email: clean(f.email)?.toLowerCase() ?? null, phone: clean(f.phone), source: clean(f.source) }).select('id').single()
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setShowCand(false); setMsg({ kind: 'success', text: 'Candidate added.' }); await load(); setSelCand(data.id)
  }

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Recruitment</h1><p className="muted">Job openings, candidates and hiring. Only HR and the Director can see this page.</p></div>
        {isHr && !showJob && <button className="primary" onClick={() => setShowJob(true)}>New job opening</button>}</div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}

      {showJob && <JobForm depts={depts} positions={positions} onSubmit={addJob} onCancel={() => setShowJob(false)} />}

      <div className="panel"><h2>Job openings</h2>
        {jobs === null ? <p className="empty">Loading…</p> : jobs.length === 0 ? <p className="empty">No job openings yet.</p> : (
          <table><thead><tr><th>Job</th><th>Department</th><th className="num">Vacancies</th><th className="num">Candidates</th><th>Closes</th><th>Status</th><th /></tr></thead><tbody>
            {jobs.map(j => (
              <tr key={j.id} style={j.id === selJob ? { background: '#f3f8f6' } : undefined}>
                <td><strong>{j.title}</strong><br /><span className="muted">{pretty(j.employment_type)}</span></td><td>{j.departments?.name ?? '—'}</td>
                <td className="num">{j.vacancies}</td><td className="num">{cands.filter(c => c.job_id === j.id).length}</td><td>{fmtDate(j.closes_on)}</td>
                <td>{isHr ? <select value={j.status} onChange={e => setJobStatus(j.id, e.target.value)} style={{ width: 'auto' }}>{['draft', 'open', 'closed', 'filled'].map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select>
                  : <span className={`status ${j.status === 'open' ? 'active' : 'closed'}`}>{pretty(j.status)}</span>}</td>
                <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => { setSelJob(j.id); setSelCand(null); setShowCand(false) }}>{j.id === selJob ? 'Opened' : 'Open pipeline'}</button></td></tr>))}
          </tbody></table>)}
      </div>

      {job && (
        <>
          <div className="page-head" style={{ marginTop: 6 }}>
            <div><h2 style={{ margin: 0 }}>{job.title}</h2><p className="muted">{jobCands.length} candidate{jobCands.length === 1 ? '' : 's'} · {job.vacancies} vacanc{job.vacancies === 1 ? 'y' : 'ies'}</p></div>
            <div style={{ display: 'flex', gap: 8 }}>{isHr && !showCand && <button className="primary" onClick={() => setShowCand(true)}>Add candidate</button>}{isHr && <button className="mini danger" onClick={deleteJob}>Delete job</button>}</div>
          </div>
          {showCand && <CandidateForm onSubmit={addCandidate} onCancel={() => setShowCand(false)} />}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 18 }}>
            {STAGES.map(s => {
              const col = jobCands.filter(c => c.stage === s)
              return (
                <div key={s} className="panel" style={{ padding: 10, marginBottom: 0, background: s === 'rejected' ? '#fbf3f2' : s === 'hired' ? '#f0f8f1' : undefined }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}><strong style={{ fontSize: 12 }}>{pretty(s)}</strong><span className="muted">{col.length}</span></div>
                  {col.map(c => (
                    <button key={c.id} onClick={() => setSelCand(c.id)} style={{ display: 'block', width: '100%', textAlign: 'left', border: c.id === selCand ? '2px solid var(--teal)' : '1px solid var(--line)', borderRadius: 8, background: '#fff', padding: '7px 9px', marginBottom: 6, cursor: 'pointer' }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{c.full_name}</div>
                      <div className="muted" style={{ fontSize: 11 }}>{c.rating ? '★'.repeat(c.rating) : 'Not rated'}{c.source ? ` · ${pretty(c.source)}` : ''}</div>
                    </button>))}
                </div>)
            })}
          </div>

          {cand && <CandidatePanel key={cand.id} cand={cand} job={job} isHr={isHr} orgId={org.id} depts={depts} positions={positions} people={people} setMsg={setMsg} reload={load} />}
        </>
      )}
    </div>
  )
}

function JobForm({ depts, positions, onSubmit, onCancel }: any) {
  const [f, setF] = useState({ title: '', department: '', position: '', type: 'permanent', vacancies: '1', closes: '', description: '', requirements: '', status: 'open' })
  const S = (k: string, v: string) => setF(p => ({ ...p, [k]: v }))
  return (
    <form className="form-grid" onSubmit={e => onSubmit(e, f)}>
      <label>Job title *<input required value={f.title} onChange={e => S('title', e.target.value)} /></label>
      <label>Department<select value={f.department} onChange={e => S('department', e.target.value)}><option value="">—</option>{depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Position<select value={f.position} onChange={e => S('position', e.target.value)}><option value="">—</option>{positions.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
      <label>Employment type<select value={f.type} onChange={e => S('type', e.target.value)}>{EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select></label>
      <label>Vacancies<input type="number" min="1" required value={f.vacancies} onChange={e => S('vacancies', e.target.value)} /></label>
      <label>Applications close<input type="date" value={f.closes} onChange={e => S('closes', e.target.value)} /></label>
      <label>Status<select value={f.status} onChange={e => S('status', e.target.value)}><option value="draft">Draft</option><option value="open">Open</option></select></label>
      <label>Description<textarea rows={3} value={f.description} onChange={e => S('description', e.target.value)} /></label>
      <label>Requirements<textarea rows={3} value={f.requirements} onChange={e => S('requirements', e.target.value)} /></label>
      <div className="actions"><button className="primary">Save job</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

function CandidateForm({ onSubmit, onCancel }: any) {
  const [f, setF] = useState({ name: '', email: '', phone: '', source: '' })
  return (
    <form className="form-grid" onSubmit={e => onSubmit(e, f)}>
      <label>Full name (first and last name) *<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
      <label>Email<input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
      <label>Phone<input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
      <label>Where did they hear about the job?<select value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="">—</option>{SOURCES.map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
      <div className="actions"><button className="primary">Add candidate</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={onCancel}>Cancel</button></div>
    </form>
  )
}

function CandidatePanel({ cand, job, isHr, orgId, depts, positions, people, setMsg, reload }: any) {
  const [events, setEvents] = useState<any[]>([])
  const [f, setF] = useState({ name: cand.full_name, email: cand.email ?? '', phone: cand.phone ?? '', source: cand.source ?? '', rating: String(cand.rating ?? '') })
  const [note, setNote] = useState({ kind: 'note', text: '', at: '' })
  const [hire, setHire] = useState<any | null>(null)
  const [busy, setBusy] = useState(false)
  const locked = !!cand.employee_id

  const loadEvents = useCallback(async () => {
    const { data } = await createClient().from('candidate_events').select('*').eq('candidate_id', cand.id).order('created_at', { ascending: false })
    setEvents(data ?? [])
  }, [cand.id])
  useEffect(() => { loadEvents() }, [loadEvents])

  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('candidates').update({ full_name: f.name.trim(), email: clean(f.email)?.toLowerCase() ?? null, phone: clean(f.phone), source: clean(f.source), rating: f.rating ? Number(f.rating) : null, updated_at: new Date().toISOString() }).eq('id', cand.id)
    if (error) setMsg({ kind: 'error', text: errMsg(error) }); else { setMsg({ kind: 'success', text: 'Candidate saved.' }); reload() }
  }
  async function move(stage: string) {
    let reason: string | null = null
    if (stage === 'rejected') { reason = window.prompt('Reason for rejecting (required)'); if (!reason || !reason.trim()) return }
    const { error } = await createClient().rpc('move_candidate', { p_candidate_id: cand.id, p_stage: stage, p_note: reason })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: `Moved to ${pretty(stage)}.` }); reload(); loadEvents() }
  }
  async function addNote(e: FormEvent) {
    e.preventDefault()
    const body = note.kind === 'interview' && note.at ? `${note.text.trim()} (interview ${new Date(note.at).toLocaleString('en-GB')})` : note.text.trim()
    const { error } = await createClient().from('candidate_events').insert({ organization_id: orgId, candidate_id: cand.id, kind: note.kind, body, event_at: note.at ? new Date(note.at).toISOString() : null })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setNote({ kind: 'note', text: '', at: '' }); loadEvents()
  }
  async function uploadCv(files: FileList | null) {
    const file = files?.[0]; if (!file) return
    if (file.size > 15 * 1024 * 1024) return setMsg({ kind: 'error', text: 'The file is larger than 15 MB.' })
    setBusy(true)
    const sb = createClient(), path = `${orgId}/${cand.id}/${Date.now()}-${file.name.replace(/[^A-Za-z0-9._-]+/g, '_')}`
    const up = await sb.storage.from('recruitment-cvs').upload(path, file, { contentType: file.type || undefined })
    if (up.error) { setBusy(false); return setMsg({ kind: 'error', text: up.error.message }) }
    const { error } = await sb.from('candidates').update({ cv_path: path }).eq('id', cand.id)
    if (error) { await sb.storage.from('recruitment-cvs').remove([path]); setMsg({ kind: 'error', text: error.message }) }
    else { if (cand.cv_path) await sb.storage.from('recruitment-cvs').remove([cand.cv_path]); setMsg({ kind: 'success', text: 'CV uploaded.' }); reload() }
    setBusy(false)
  }
  async function viewCv() {
    const { data, error } = await createClient().storage.from('recruitment-cvs').createSignedUrl(cand.cv_path, 120)
    if (error || !data) setMsg({ kind: 'error', text: error?.message ?? 'Could not open the CV.' }); else window.open(data.signedUrl, '_blank', 'noopener')
  }
  async function doHire(e: FormEvent) {
    e.preventDefault(); setBusy(true)
    const { data, error } = await createClient().rpc('convert_candidate_to_employee', {
      p_candidate_id: cand.id, p_hire_date: hire.date, p_work_email: clean(hire.email), p_gender: clean(hire.gender), p_department_id: clean(hire.department),
      p_position_id: clean(hire.position), p_manager_id: clean(hire.manager), p_employment_type: clean(hire.type) })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setHire(null); setMsg({ kind: 'success', text: 'Hired. The employee record has been created, open it to add salary and contract details.' }); reload(); loadEvents()
    window.setTimeout(() => { window.location.href = `/employees/${data}` }, 1800)
  }

  const next = ['screening', 'interview', 'offer'].filter(s => s !== cand.stage)
  return (
    <div className="panel" style={{ borderColor: 'var(--teal)' }}>
      <div className="page-head" style={{ marginBottom: 10 }}>
        <div><h2 style={{ margin: 0 }}>{cand.full_name}</h2><p className="muted"><span className={`status ${cand.stage === 'hired' ? 'active' : cand.stage === 'rejected' ? 'rejected' : 'pending'}`}>{pretty(cand.stage)}</span>{cand.rejected_reason ? ` · ${cand.rejected_reason}` : ''}</p></div>
        {cand.employee_id && <Link href={`/employees/${cand.employee_id}`} className="mini">Open employee record</Link>}
      </div>

      {isHr && !locked && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {next.map(s => <button key={s} className="mini" onClick={() => move(s)}>Move to {pretty(s)}</button>)}
          {cand.stage !== 'rejected' && <button className="mini danger" onClick={() => move('rejected')}>Reject</button>}
          {cand.stage === 'rejected' && <button className="mini" onClick={() => move('applied')}>Reopen</button>}
          {cand.stage === 'offer' && !hire && <button className="primary" onClick={() => setHire({ date: todayIso(), email: '', gender: '', department: job.department_id ?? '', position: job.position_id ?? '', manager: '', type: job.employment_type })}>Hire as employee</button>}
        </div>)}

      {hire && (
        <form className="form-grid" onSubmit={doHire} style={{ marginBottom: 14 }}>
          <label>Hire date *<input type="date" required value={hire.date} onChange={e => setHire({ ...hire, date: e.target.value })} /></label>
          <label>Work email (for their login)<input type="email" value={hire.email} onChange={e => setHire({ ...hire, email: e.target.value })} /></label>
          <label>Gender<select value={hire.gender} onChange={e => setHire({ ...hire, gender: e.target.value })}><option value="">—</option><option value="female">Female</option><option value="male">Male</option></select></label>
          <label>Department<select value={hire.department} onChange={e => setHire({ ...hire, department: e.target.value })}><option value="">—</option>{depts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
          <label>Position<select value={hire.position} onChange={e => setHire({ ...hire, position: e.target.value })}><option value="">—</option>{positions.map((d: any) => <option key={d.id} value={d.id}>{d.title}</option>)}</select></label>
          <label>Manager<select value={hire.manager} onChange={e => setHire({ ...hire, manager: e.target.value })}><option value="">—</option>{people.map((d: any) => <option key={d.id} value={d.id}>{fullName(d)}</option>)}</select></label>
          <label>Employment type<select value={hire.type} onChange={e => setHire({ ...hire, type: e.target.value })}>{EMPLOYMENT_TYPES.map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select></label>
          <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Hiring…' : 'Confirm hire'}</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setHire(null)}>Cancel</button></div>
        </form>)}

      <div className="split">
        <div>
          <form className="form-grid" onSubmit={save} style={{ border: 0, padding: 0 }}>
            <label>Full name<input required disabled={!isHr || locked} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
            <label>Email<input type="email" disabled={!isHr || locked} value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
            <label>Phone<input disabled={!isHr || locked} value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></label>
            <label>Source<select disabled={!isHr || locked} value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="">—</option>{SOURCES.map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select></label>
            <label>Rating<select disabled={!isHr || locked} value={f.rating} onChange={e => setF({ ...f, rating: e.target.value })}><option value="">Not rated</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}</select></label>
            {isHr && !locked && <div className="actions"><button className="primary">Save</button></div>}
          </form>
          <div style={{ marginTop: 12 }}>
            <strong style={{ fontSize: 12 }}>CV</strong>{' '}
            {cand.cv_path ? <button className="mini" onClick={viewCv}>View CV</button> : <span className="muted">None uploaded</span>}
            {isHr && !locked && <label className="mini" style={{ cursor: 'pointer', marginLeft: 8 }}>{busy ? 'Uploading…' : cand.cv_path ? 'Replace' : 'Upload CV'}<input type="file" hidden accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" disabled={busy} onChange={e => { uploadCv(e.target.files); e.target.value = '' }} /></label>}
          </div>
        </div>
        <div>
          <h2>Notes and history</h2>
          {isHr && (
            <form onSubmit={addNote} style={{ display: 'grid', gap: 6, marginBottom: 10 }}>
              <select value={note.kind} onChange={e => setNote({ ...note, kind: e.target.value })}><option value="note">Note</option><option value="interview">Interview feedback</option></select>
              {note.kind === 'interview' && <input type="datetime-local" value={note.at} onChange={e => setNote({ ...note, at: e.target.value })} />}
              <textarea rows={2} required placeholder="Write a note…" value={note.text} onChange={e => setNote({ ...note, text: e.target.value })} />
              <div><button className="mini">Add</button></div>
            </form>)}
          {events.length === 0 ? <p className="empty">No history yet.</p> : events.map(ev => (
            <div className="row" key={ev.id} style={{ alignItems: 'flex-start' }}><span>{ev.kind === 'stage' ? <span className="muted">{ev.body}</span> : ev.body}{ev.kind === 'interview' && <> <span className="status pending">Interview</span></>}</span><span className="muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmtDate(ev.created_at)}</span></div>))}
        </div>
      </div>
    </div>
  )
}
