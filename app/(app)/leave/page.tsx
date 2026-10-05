'use client'

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { errMsg, fmtDate, pretty, todayIso, workingDays } from '@/lib/format'

type Msg = { kind: 'error' | 'success'; text: string } | null

export default function MyLeavePage() {
  const { profile } = useApp()
  const empId = profile.employee_id
  const year = new Date().getFullYear()
  const [bal, setBal] = useState<any[] | null>(null)
  const [reqs, setReqs] = useState<any[] | null>(null)
  const [holidays, setHolidays] = useState<Set<string>>(new Set())
  const [f, setF] = useState({ type: '', start: todayIso(), end: todayIso(), reason: '' })
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!empId) return
    const sb = createClient()
    const [b, r, h] = await Promise.all([
      sb.rpc('leave_balances_for', { p_employee_id: empId, p_year: year }),
      sb.from('leave_requests').select('*, leave_types(name)').eq('employee_id', empId).order('start_date', { ascending: false }),
      sb.from('holidays').select('holiday_date'),
    ])
    if (b.error) setMsg({ kind: 'error', text: b.error.message })
    setBal((b.data as any[]) ?? []); setReqs(r.data ?? []); setHolidays(new Set((h.data ?? []).map((x: any) => x.holiday_date)))
  }, [empId, year])
  useEffect(() => { load() }, [load])

  const days = useMemo(() => workingDays(f.start, f.end, holidays), [f.start, f.end, holidays])
  const chosen = bal?.find(b => b.leave_type_id === f.type)

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { error } = await createClient().rpc('request_leave', { p_leave_type_id: f.type, p_start: f.start, p_end: f.end, p_reason: f.reason.trim() || null })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setMsg({ kind: 'success', text: 'Your leave request has been sent for approval.' }); setF({ ...f, reason: '' }); load()
  }
  async function cancel(id: string) {
    if (!window.confirm('Cancel this leave request?')) return
    const { error } = await createClient().rpc('cancel_leave', { p_request_id: id })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: 'Request cancelled.' }); load() }
  }

  if (!empId) return <div className="module-page"><div className="page-head"><h1>My leave</h1></div><div className="panel"><p className="empty">Your account is not linked to an employee record yet. Please ask HR to link your work email to your employee profile.</p></div></div>

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>My leave</h1><p className="muted">Request leave and follow its approval. Weekends and public holidays are not counted.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}

      <div className="panel"><h2>My balances, {year}</h2>
        {bal === null ? <p className="empty">Loading…</p> : (
          <table><thead><tr><th>Leave type</th><th className="num">Entitled</th><th className="num">Carried over</th><th className="num">Used</th><th className="num">Pending</th><th className="num">Remaining</th></tr></thead><tbody>
            {bal.map(r => <tr key={r.leave_type_id}><td><strong>{r.name}</strong></td><td className="num">{r.entitled ?? '∞'}</td><td className="num">{r.carried_over}</td><td className="num">{r.used}</td><td className="num">{r.pending}</td><td className="num"><strong>{r.remaining ?? '∞'}</strong></td></tr>)}
          </tbody></table>)}
      </div>

      <form className="form-grid" onSubmit={submit}>
        <label>Leave type *<select required value={f.type} onChange={e => setF({ ...f, type: e.target.value })}><option value="">Select…</option>
          {(bal ?? []).map(b => <option key={b.leave_type_id} value={b.leave_type_id}>{b.name}{b.remaining != null ? ` (${b.remaining} left)` : ''}</option>)}</select></label>
        <label>From *<input type="date" required value={f.start} onChange={e => setF({ ...f, start: e.target.value, end: e.target.value > f.end ? e.target.value : f.end })} /></label>
        <label>To *<input type="date" required min={f.start} value={f.end} onChange={e => setF({ ...f, end: e.target.value })} /></label>
        <label>Reason (optional)<input value={f.reason} onChange={e => setF({ ...f, reason: e.target.value })} /></label>
        <div className="actions"><button className="primary" disabled={busy || !f.type || days === 0}>{busy ? 'Sending…' : 'Request leave'}</button>
          <span className="muted">{days} working day{days === 1 ? '' : 's'}{chosen?.remaining != null && days > chosen.remaining ? ' · more than your balance' : ''}</span></div>
      </form>

      <div className="panel"><h2>My requests</h2>
        {reqs === null ? <p className="empty">Loading…</p> : reqs.length === 0 ? <p className="empty">No leave requests yet.</p> : (
          <table><thead><tr><th>Leave</th><th>From</th><th>To</th><th className="num">Days</th><th>Status</th><th>Decision note</th><th /></tr></thead><tbody>
            {reqs.map(r => <tr key={r.id}><td><strong>{r.leave_types?.name}</strong></td><td>{fmtDate(r.start_date)}</td><td>{fmtDate(r.end_date)}</td><td className="num">{r.days}</td>
              <td><span className={`status ${r.status}`}>{pretty(r.status)}</span></td><td>{r.decision_note ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>{(r.status === 'pending' || (r.status === 'approved' && r.start_date > todayIso())) && <button className="mini danger" onClick={() => cancel(r.id)}>Cancel</button>}</td></tr>)}
          </tbody></table>)}
      </div>
    </div>
  )
}
