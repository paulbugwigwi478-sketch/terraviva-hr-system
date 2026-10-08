'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { downloadCsv, errMsg, fmtDate, fullName, pretty } from '@/lib/format'

type Msg = { kind: 'error' | 'success'; text: string } | null
type Tab = 'mine' | 'team' | 'cycles' | 'criteria'
const LABELS = ['', 'Needs improvement', 'Below expectations', 'Meets expectations', 'Exceeds expectations', 'Outstanding']
const STATUS_TEXT: Record<string, string> = { pending_self: 'Waiting for self-assessment', pending_manager: 'Waiting for manager', pending_ack: 'Waiting for acknowledgement', completed: 'Completed' }
const overallLabel = (n: number | null | undefined) => (n ? LABELS[Math.min(5, Math.max(1, Math.round(Number(n))))] : '—')
const REVIEW_SELECT = 'id,status,overall_rating,employee_id,reviewer_id,cycle_id,review_cycles(name,status,end_date),employees!reviews_employee_id_fkey(first_name,middle_name,last_name,employee_no,departments!employees_department_id_fkey(name)),reviewer:employees!reviews_reviewer_id_fkey(first_name,last_name)'

export default function PerformancePage() {
  const { profile, isManager } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const sees = can(profile.role, ['hr_admin', 'director'])
  const tabs: [Tab, string][] = []
  if (profile.employee_id) tabs.push(['mine', 'My review'])
  if (sees || isManager) tabs.push(['team', sees ? 'All reviews' : 'My team'])
  if (sees) tabs.push(['cycles', 'Cycles and results'])
  if (isHr) tabs.push(['criteria', 'Criteria'])
  const [tab, setTab] = useState<Tab>(tabs[0]?.[0] ?? 'mine')
  const [msg, setMsg] = useState<Msg>(null)

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Performance</h1><p className="muted">Annual reviews: you assess yourself, your manager assesses you, and you see the result once your manager has finished.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      <div className="tabs">{tabs.map(([k, l]) => <button key={k} className={`tab${tab === k ? ' on' : ''}`} onClick={() => { setTab(k); setMsg(null) }}>{l}</button>)}</div>
      {(tab === 'mine' || tab === 'team') && <ReviewList scope={tab} setMsg={setMsg} />}
      {tab === 'cycles' && sees && <Cycles isHr={isHr} setMsg={setMsg} />}
      {tab === 'criteria' && isHr && <Criteria setMsg={setMsg} />}
    </div>
  )
}

/* ---------------- List of reviews ---------------- */
function ReviewList({ scope, setMsg }: { scope: 'mine' | 'team'; setMsg: (m: Msg) => void }) {
  const { profile } = useApp()
  const [rows, setRows] = useState<any[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const me = profile.employee_id

  const load = useCallback(async () => {
    const { data, error } = await createClient().from('reviews').select(REVIEW_SELECT).order('created_at', { ascending: false })
    if (error) setMsg({ kind: 'error', text: error.message })
    setRows(data ?? [])
  }, [setMsg])
  useEffect(() => { load() }, [load])

  const list = (rows ?? []).filter(r => (scope === 'mine' ? r.employee_id === me : r.employee_id !== me))
  const needsMe = (r: any) => r.review_cycles?.status === 'open' && (scope === 'mine' ? r.status === 'pending_self' || r.status === 'pending_ack'
    : r.status === 'pending_manager' && (r.reviewer_id === me || (!r.reviewer_id && can(profile.role, ['hr_admin', 'director']))))

  return (
    <>
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : list.length === 0 ? <p className="empty">{scope === 'mine' ? 'You have no review yet. HR will open a review cycle and you will be notified.' : 'No reviews to show.'}</p> : (
          <table><thead><tr>{scope === 'team' && <th>Employee</th>}<th>Cycle</th><th>Status</th><th className="num">Rating</th><th /></tr></thead><tbody>
            {list.map(r => (
              <tr key={r.id} style={r.id === sel ? { background: '#f3f8f6' } : undefined}>
                {scope === 'team' && <td><strong>{fullName(r.employees)}</strong><br /><span className="muted">{r.employees?.departments?.name ?? r.employees?.employee_no}</span></td>}
                <td>{r.review_cycles?.name}</td>
                <td><span className={`status ${r.status === 'completed' ? 'active' : 'pending'}`}>{STATUS_TEXT[r.status]}</span>{needsMe(r) && <> <span className="status rejected">Action needed</span></>}</td>
                <td className="num">{r.overall_rating ? <>{Number(r.overall_rating).toFixed(2)}<br /><span className="muted">{overallLabel(r.overall_rating)}</span></> : '—'}</td>
                <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => setSel(r.id === sel ? null : r.id)}>{r.id === sel ? 'Close' : 'Open'}</button></td></tr>))}
          </tbody></table>)}
      </div>
      {sel && <ReviewDetail key={sel} reviewId={sel} setMsg={setMsg} onChanged={load} />}
    </>
  )
}

/* ---------------- One review ---------------- */
function ReviewDetail({ reviewId, setMsg, onChanged }: any) {
  const { profile } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const [rev, setRev] = useState<any | null>(null)
  const [scores, setScores] = useState<any[]>([])
  const [mgr, setMgr] = useState<any | null>(null)
  const [mscores, setMscores] = useState<any[]>([])
  const [form, setForm] = useState<Record<string, { score: string; comment: string }>>({})
  const [text, setText] = useState({ comment: '', strengths: '', development: '', goals: '', response: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const sb = createClient()
    const [r, s, m, ms] = await Promise.all([
      sb.from('reviews').select(REVIEW_SELECT + ',self_comment,employee_response,acknowledged_at').eq('id', reviewId).maybeSingle(),
      sb.from('review_scores').select('*').eq('review_id', reviewId).order('sort_order'),
      sb.from('review_manager').select('*').eq('review_id', reviewId).maybeSingle(),
      sb.from('review_manager_scores').select('*').eq('review_id', reviewId),
    ])
    setRev(r.data); setScores(s.data ?? []); setMgr(m.data ?? null); setMscores(ms.data ?? [])
  }, [reviewId])
  useEffect(() => { load() }, [load])

  if (!rev) return <div className="panel"><p className="empty">Loading…</p></div>
  const me = profile.employee_id
  const isOwner = rev.employee_id === me
  const open = rev.review_cycles?.status === 'open'
  const canSelf = isOwner && rev.status === 'pending_self' && open
  const canAck = isOwner && rev.status === 'pending_ack' && open
  const canAssess = !isOwner && rev.status === 'pending_manager' && open && (rev.reviewer_id === me || (!rev.reviewer_id && can(profile.role, ['hr_admin', 'director'])))
  const showManager = !!mgr || mscores.length > 0
  const msOf = (sid: string) => mscores.find(x => x.score_id === sid)

  const setF = (cid: string, k: 'score' | 'comment', v: string) => setForm(p => ({ ...p, [cid]: { score: p[cid]?.score ?? '', comment: p[cid]?.comment ?? '', [k]: v } }))
  const payload = () => scores.map(s => ({ criterion_id: s.criterion_id, score: Number(form[s.criterion_id]?.score || 0), comment: form[s.criterion_id]?.comment ?? '' }))

  async function run(fn: string, args: any, ok: string) {
    setBusy(true); setMsg(null)
    const { error } = await createClient().rpc(fn, args)
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setMsg({ kind: 'success', text: ok }); await load(); onChanged()
  }
  const submitSelf = (e: FormEvent) => { e.preventDefault(); run('submit_self_review', { p_review_id: rev.id, p_scores: payload(), p_comment: text.comment || null }, 'Your self-assessment was sent to your manager.') }
  const submitMgr = (e: FormEvent) => { e.preventDefault(); run('submit_manager_review', { p_review_id: rev.id, p_scores: payload(), p_comment: text.comment || null, p_strengths: text.strengths || null, p_development: text.development || null, p_goals: text.goals || null }, 'Assessment submitted. The employee has been notified.') }
  const ack = (e: FormEvent) => { e.preventDefault(); run('acknowledge_review', { p_review_id: rev.id, p_response: text.response || null }, 'Thank you. Your review is complete.') }
  const reopen = (to: string) => { if (window.confirm('Reopen this review? The later steps will be cleared.')) run('reopen_review', { p_review_id: rev.id, p_to: to }, 'Review reopened.') }

  const ratingSelect = (cid: string) => (
    <select required value={form[cid]?.score ?? ''} onChange={e => setF(cid, 'score', e.target.value)}>
      <option value="">Rate…</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{n} · {LABELS[n]}</option>)}</select>)

  return (
    <div className="panel" style={{ borderColor: 'var(--teal)' }}>
      <div className="page-head" style={{ marginBottom: 8 }}>
        <div><h2 style={{ margin: 0 }}>{fullName(rev.employees)} <span className="muted" style={{ fontWeight: 400 }}>· {rev.review_cycles?.name}</span></h2>
          <p className="muted">Manager: {rev.reviewer ? fullName(rev.reviewer) : 'none (Director or HR assesses)'} · <span className={`status ${rev.status === 'completed' ? 'active' : 'pending'}`}>{STATUS_TEXT[rev.status]}</span></p></div>
        {rev.overall_rating && <div style={{ textAlign: 'right' }}><div style={{ fontSize: 26, fontWeight: 700 }}>{Number(rev.overall_rating).toFixed(2)}</div><div className="muted">{overallLabel(rev.overall_rating)}</div></div>}
      </div>

      {(canSelf || canAssess) ? (
        <form onSubmit={canSelf ? submitSelf : submitMgr}>
          <p className="muted" style={{ marginBottom: 10 }}>{canSelf ? 'Rate yourself honestly on each point, from 1 to 5.' : 'Rate the employee on each point, from 1 to 5.'}</p>
          {scores.map(s => (
            <div key={s.id} style={{ borderBottom: '1px solid var(--line)', padding: '10px 0' }}>
              <strong>{s.criterion_name}</strong>{s.weight > 1 && <span className="muted"> (weight {s.weight})</span>}
              {s.criterion_description && <div className="muted" style={{ fontSize: 12 }}>{s.criterion_description}</div>}
              {canAssess && s.self_score && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Employee’s own rating: {s.self_score} · {LABELS[s.self_score]}{s.self_comment ? ` — “${s.self_comment}”` : ''}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 240px) 1fr', gap: 8, marginTop: 6 }}>
                {ratingSelect(s.criterion_id)}
                <input placeholder="Comment (optional)" value={form[s.criterion_id]?.comment ?? ''} onChange={e => setF(s.criterion_id, 'comment', e.target.value)} />
              </div>
            </div>))}
          {canAssess && rev.self_comment && <p style={{ marginTop: 10 }}><strong>Employee’s overall comment:</strong> {rev.self_comment}</p>}
          <div className="form-grid" style={{ marginTop: 12, border: 0, padding: 0 }}>
            <label>{canSelf ? 'Anything else you want to say about your year' : 'Overall comment'}<textarea rows={3} value={text.comment} onChange={e => setText({ ...text, comment: e.target.value })} /></label>
            {canAssess && <>
              <label>Strengths<textarea rows={2} value={text.strengths} onChange={e => setText({ ...text, strengths: e.target.value })} /></label>
              <label>Areas to develop<textarea rows={2} value={text.development} onChange={e => setText({ ...text, development: e.target.value })} /></label>
              <label>Goals for next period<textarea rows={2} value={text.goals} onChange={e => setText({ ...text, goals: e.target.value })} /></label></>}
            <div className="actions"><button className="primary" disabled={busy}>{busy ? 'Sending…' : canSelf ? 'Submit self-assessment' : 'Submit assessment'}</button></div>
          </div>
        </form>
      ) : (
        <>
          {scores.length > 0 && (
            <table><thead><tr><th>Criterion</th><th>Self-assessment</th>{showManager && <th>Manager</th>}</tr></thead><tbody>
              {scores.map(s => { const m = msOf(s.id); return (
                <tr key={s.id}><td><strong>{s.criterion_name}</strong></td>
                  <td>{s.self_score ? <>{s.self_score} · {LABELS[s.self_score]}{s.self_comment && <><br /><span className="muted">{s.self_comment}</span></>}</> : <span className="muted">Not yet</span>}</td>
                  {showManager && <td>{m ? <>{m.score} · {LABELS[m.score]}{m.comment && <><br /><span className="muted">{m.comment}</span></>}</> : '—'}</td>}</tr>) })}
            </tbody></table>)}
          {rev.self_comment && <p style={{ marginTop: 12 }}><strong>Employee’s comment:</strong> {rev.self_comment}</p>}
          {mgr && <div style={{ marginTop: 12, display: 'grid', gap: 8 }}>
            {mgr.manager_comment && <p><strong>Manager’s comment:</strong> {mgr.manager_comment}</p>}
            {mgr.strengths && <p><strong>Strengths:</strong> {mgr.strengths}</p>}
            {mgr.development_areas && <p><strong>Areas to develop:</strong> {mgr.development_areas}</p>}
            {mgr.goals_next && <p><strong>Goals for next period:</strong> {mgr.goals_next}</p>}</div>}
          {rev.employee_response && <p style={{ marginTop: 12 }}><strong>Employee’s response:</strong> {rev.employee_response}</p>}
          {rev.acknowledged_at && <p className="muted" style={{ marginTop: 8 }}>Acknowledged on {fmtDate(rev.acknowledged_at)}.</p>}
          {isOwner && rev.status === 'pending_manager' && <p className="muted" style={{ marginTop: 10 }}>Your manager has not finished yet. You will be notified when your review is ready.</p>}
          {isOwner && rev.status === 'pending_self' && !open && <p className="muted">This review cycle is closed.</p>}
        </>
      )}

      {canAck && (
        <form className="form-grid" onSubmit={ack} style={{ marginTop: 14 }}>
          <label>Your response (optional)<textarea rows={3} value={text.response} onChange={e => setText({ ...text, response: e.target.value })} placeholder="Add any comment about your review" /></label>
          <div className="actions"><button className="primary" disabled={busy}>I have read my review</button></div>
        </form>)}

      {isHr && open && rev.status !== 'pending_self' && (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="mini" onClick={() => reopen('pending_manager')}>Reopen manager assessment</button>
          <button className="mini danger" onClick={() => reopen('pending_self')}>Reopen self-assessment</button>
        </div>)}
    </div>
  )
}

/* ---------------- Cycles and results ---------------- */
function Cycles({ isHr, setMsg }: { isHr: boolean; setMsg: (m: Msg) => void }) {
  const { org } = useApp()
  const [cycles, setCycles] = useState<any[] | null>(null)
  const [reviews, setReviews] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [openRev, setOpenRev] = useState<string | null>(null)
  const [f, setF] = useState<any | null>(null)
  const [add, setAdd] = useState('')

  const load = useCallback(async () => {
    const sb = createClient()
    const [c, r, e] = await Promise.all([
      sb.from('review_cycles').select('*').order('start_date', { ascending: false }),
      sb.from('reviews').select(REVIEW_SELECT),
      sb.from('employees').select('id,first_name,middle_name,last_name').eq('status', 'active').order('last_name'),
    ])
    if (c.error) setMsg({ kind: 'error', text: c.error.message })
    setCycles(c.data ?? []); setReviews(r.data ?? []); setPeople(e.data ?? [])
  }, [setMsg])
  useEffect(() => { load() }, [load])

  const cycle = cycles?.find(c => c.id === sel) ?? null
  const rs = useMemo(() => reviews.filter(r => r.cycle_id === sel), [reviews, sel])
  const rated = rs.filter(r => r.overall_rating)
  const avg = rated.length ? rated.reduce((a, r) => a + Number(r.overall_rating), 0) / rated.length : null
  const count = (s: string) => rs.filter(r => r.status === s).length
  const dist = [1, 2, 3, 4, 5].map(n => rated.filter(r => Math.round(Number(r.overall_rating)) === n).length)
  const maxDist = Math.max(1, ...dist)
  const without = people.filter(p => !rs.some(r => r.employee_id === p.id))

  async function save(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('review_cycles').insert({ organization_id: org.id, name: f.name.trim(), start_date: f.start, end_date: f.end, self_review: !!f.self })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setF(null); setMsg({ kind: 'success', text: 'Cycle created as a draft. Open it when you are ready.' }); load()
  }
  async function call(fn: string, args: any, ok: string) {
    const { error } = await createClient().rpc(fn, args)
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: ok }); load() }
  }
  async function del(c: any) {
    if (!window.confirm(`Delete the draft cycle “${c.name}”?`)) return
    const { error } = await createClient().from('review_cycles').delete().eq('id', c.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else { setSel(null); load() }
  }
  function exportCsv() {
    downloadCsv(`reviews-${cycle.name.replace(/\s+/g, '-')}.csv`, [['Employee no.', 'Employee', 'Department', 'Manager', 'Status', 'Overall rating', 'Rating'],
      ...rs.map(r => [r.employees?.employee_no ?? '', fullName(r.employees), r.employees?.departments?.name ?? '', r.reviewer ? fullName(r.reviewer) : '', STATUS_TEXT[r.status], r.overall_rating ?? '', r.overall_rating ? overallLabel(r.overall_rating) : ''])])
  }

  return (
    <>
      <div className="page-head"><h2 style={{ margin: 0 }}>Review cycles</h2>{isHr && !f && <button className="primary" onClick={() => setF({ name: '', start: '', end: '', self: true })}>New cycle</button>}</div>
      {f && (
        <form className="form-grid" onSubmit={save}>
          <label>Name *<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. 2026 Annual Review" /></label>
          <label>Period starts *<input type="date" required value={f.start} onChange={e => setF({ ...f, start: e.target.value })} /></label>
          <label>Period ends *<input type="date" required min={f.start} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={f.self} onChange={e => setF({ ...f, self: e.target.checked })} />Employees assess themselves first</label>
          <div className="actions"><button className="primary">Create draft</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setF(null)}>Cancel</button></div>
        </form>)}
      <div className="panel">
        {cycles === null ? <p className="empty">Loading…</p> : cycles.length === 0 ? <p className="empty">No review cycles yet.</p> : (
          <table><thead><tr><th>Cycle</th><th>Period</th><th>Status</th><th /></tr></thead><tbody>
            {cycles.map(c => <tr key={c.id} style={c.id === sel ? { background: '#f3f8f6' } : undefined}><td><strong>{c.name}</strong></td><td>{fmtDate(c.start_date)} – {fmtDate(c.end_date)}</td>
              <td><span className={`status ${c.status === 'open' ? 'active' : 'closed'}`}>{pretty(c.status)}</span></td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="mini" onClick={() => { setSel(c.id); setOpenRev(null) }}>{c.id === sel ? 'Opened' : 'Results'}</button>
                {isHr && c.status === 'draft' && <><button className="mini" onClick={() => window.confirm('Open this cycle? A review is created for every active employee and they are notified.') && call('open_review_cycle', { p_cycle_id: c.id }, 'Cycle opened. Everyone has been notified.')}>Open cycle</button><button className="mini danger" onClick={() => del(c)}>Delete</button></>}
                {isHr && c.status === 'open' && <button className="mini danger" onClick={() => window.confirm('Close this cycle? Unfinished reviews can no longer be completed.') && call('close_review_cycle', { p_cycle_id: c.id }, 'Cycle closed.')}>Close cycle</button>}</td></tr>)}
          </tbody></table>)}
      </div>

      {cycle && (
        <>
          <div className="page-head" style={{ marginTop: 6 }}><h2 style={{ margin: 0 }}>{cycle.name}</h2><button className="mini" onClick={exportCsv} disabled={rs.length === 0}>Export to Excel</button></div>
          <div className="cards">
            <div className="card"><span>Reviews</span><strong>{rs.length}</strong><small>{count('completed')} completed</small></div>
            <div className="card"><span>Waiting for staff</span><strong>{count('pending_self') + count('pending_ack')}</strong><small>Self-assessment or acknowledgement</small></div>
            <div className="card"><span>Waiting for managers</span><strong>{count('pending_manager')}</strong><small>Assessment not yet done</small></div>
            <div className="card"><span>Average rating</span><strong>{avg ? avg.toFixed(2) : '—'}</strong><small>{avg ? overallLabel(avg) : 'No ratings yet'}</small></div>
          </div>
          <div className="split" style={{ marginTop: 18 }}>
            <div className="panel"><h2>Rating spread</h2>
              {rated.length === 0 ? <p className="empty">No ratings yet.</p> : dist.map((c, i) => <div className="hbar" key={i}><span className="lab">{i + 1} · {LABELS[i + 1]}</span><div className="track"><span style={{ width: `${(c / maxDist) * 100}%` }} /></div><b>{c}</b></div>)}
            </div>
            <div className="panel"><h2>Add someone to this cycle</h2>
              {isHr && cycle.status === 'open' ? (
                <div style={{ display: 'flex', gap: 8 }}><select value={add} onChange={e => setAdd(e.target.value)}><option value="">Select employee…</option>{without.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select>
                  <button className="mini" disabled={!add} onClick={() => { call('add_review', { p_cycle_id: cycle.id, p_employee_id: add }, 'Review added.'); setAdd('') }}>Add</button></div>
              ) : <p className="muted">Only an HR admin can add a review while the cycle is open.</p>}
            </div>
          </div>
          <div className="panel"><h2>All reviews in this cycle</h2>
            {rs.length === 0 ? <p className="empty">No reviews. Open the cycle to create them.</p> : (
              <table><thead><tr><th>Employee</th><th>Manager</th><th>Status</th><th className="num">Rating</th><th /></tr></thead><tbody>
                {rs.map(r => <tr key={r.id}><td><strong>{fullName(r.employees)}</strong><br /><span className="muted">{r.employees?.departments?.name ?? ''}</span></td><td>{r.reviewer ? fullName(r.reviewer) : <span className="muted">none</span>}</td>
                  <td><span className={`status ${r.status === 'completed' ? 'active' : 'pending'}`}>{STATUS_TEXT[r.status]}</span></td>
                  <td className="num">{r.overall_rating ? <>{Number(r.overall_rating).toFixed(2)}<br /><span className="muted">{overallLabel(r.overall_rating)}</span></> : '—'}</td>
                  <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => setOpenRev(r.id === openRev ? null : r.id)}>{r.id === openRev ? 'Close' : 'Open'}</button></td></tr>)}
              </tbody></table>)}
          </div>
          {openRev && <ReviewDetail key={openRev} reviewId={openRev} setMsg={setMsg} onChanged={load} />}
        </>
      )}
    </>
  )
}

/* ---------------- Criteria ---------------- */
function Criteria({ setMsg }: { setMsg: (m: Msg) => void }) {
  const { org } = useApp()
  const [rows, setRows] = useState<any[] | null>(null)
  const [f, setF] = useState<any | null>(null)
  const load = useCallback(async () => {
    const { data } = await createClient().from('review_criteria').select('*').order('sort_order')
    setRows(data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(e: FormEvent) {
    e.preventDefault()
    const payload = { name: f.name.trim(), description: f.description.trim() || null, weight: Number(f.weight), sort_order: Number(f.sort), is_active: !!f.active }
    const sb = createClient()
    const { error } = f.id ? await sb.from('review_criteria').update(payload).eq('id', f.id) : await sb.from('review_criteria').insert({ ...payload, organization_id: org.id })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setF(null); setMsg({ kind: 'success', text: 'Saved. Changes apply to review cycles opened from now on.' }); load()
  }
  async function del(r: any) {
    if (!window.confirm(`Delete “${r.name}”?`)) return
    const { error } = await createClient().from('review_criteria').delete().eq('id', r.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }
  return (
    <>
      <div className="page-head"><div><h2 style={{ margin: 0 }}>Review criteria</h2><p className="muted">The points everyone is rated on, from 1 to 5. A higher weight counts more towards the overall rating. Changes do not affect cycles already open.</p></div>
        {!f && <button className="primary" onClick={() => setF({ id: null, name: '', description: '', weight: '1', sort: String((rows?.length ?? 0) + 1), active: true })}>Add criterion</button>}</div>
      {f && (
        <form className="form-grid" onSubmit={save}>
          <label>Name *<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></label>
          <label>Weight (1 to 10)<input type="number" min="1" max="10" required value={f.weight} onChange={e => setF({ ...f, weight: e.target.value })} /></label>
          <label>Order<input type="number" required value={f.sort} onChange={e => setF({ ...f, sort: e.target.value })} /></label>
          <label className="check"><input type="checkbox" checked={f.active} onChange={e => setF({ ...f, active: e.target.checked })} />Active</label>
          <label>Description<textarea rows={2} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></label>
          <div className="actions"><button className="primary">Save</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setF(null)}>Cancel</button></div>
        </form>)}
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No criteria yet.</p> : (
          <table><thead><tr><th>#</th><th>Criterion</th><th className="num">Weight</th><th>Status</th><th /></tr></thead><tbody>
            {rows.map(r => <tr key={r.id}><td>{r.sort_order}</td><td><strong>{r.name}</strong>{r.description && <><br /><span className="muted">{r.description}</span></>}</td><td className="num">{r.weight}</td>
              <td><span className={`status ${r.is_active ? 'active' : 'closed'}`}>{r.is_active ? 'Active' : 'Off'}</span></td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="mini" onClick={() => setF({ id: r.id, name: r.name, description: r.description ?? '', weight: String(r.weight), sort: String(r.sort_order), active: r.is_active })}>Edit</button><button className="mini danger" onClick={() => del(r)}>Delete</button></td></tr>)}
          </tbody></table>)}
      </div>
    </>
  )
}
