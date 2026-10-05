'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { fmtDate, fullName, pretty } from '@/lib/format'

export default function LeaveRequestsPage() {
  const { profile } = useApp()
  const seesAll = can(profile.role, ['hr_admin', 'director', 'auditor'])
  const isHr = can(profile.role, ['hr_admin'])
  const [rows, setRows] = useState<any[] | null>(null)
  const [status, setStatus] = useState('pending')
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const load = useCallback(async () => {
    let q = createClient().from('leave_requests').select('*, employees(first_name,middle_name,last_name,employee_no), leave_types(name)').order('start_date', { ascending: false }).limit(300)
    if (status) q = q.eq('status', status)
    const { data, error } = await q
    if (error) setMsg({ kind: 'error', text: error.message })
    setRows(data ?? [])
  }, [status])
  useEffect(() => { load() }, [load])

  async function decide(id: string, approve: boolean) {
    const note = window.prompt(approve ? 'Note (optional)' : 'Reason for rejecting (required)')
    if (note === null) return
    if (!approve && !note.trim()) return setMsg({ kind: 'error', text: 'Please give a reason for rejecting.' })
    const { error } = await createClient().rpc('decide_leave', { p_request_id: id, p_approve: approve, p_note: note.trim() || null })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: approve ? 'Leave approved.' : 'Leave rejected.' }); load() }
  }
  async function cancel(id: string) {
    if (!window.confirm('Cancel this leave?')) return
    const { error } = await createClient().rpc('cancel_leave', { p_request_id: id })
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Leave requests</h1><p className="muted">{seesAll ? 'Requests from all employees.' : 'Requests from your team.'} You cannot decide your own request.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      <div className="filters"><label>Status<select value={status} onChange={e => setStatus(e.target.value)}>
        <option value="">All</option>{['pending', 'approved', 'rejected', 'cancelled'].map(s => <option key={s} value={s}>{pretty(s)}</option>)}</select></label></div>
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No requests.</p> : (
          <table><thead><tr><th>Employee</th><th>Leave</th><th>From</th><th>To</th><th className="num">Days</th><th>Reason</th><th>Status</th><th /></tr></thead><tbody>
            {rows.map(r => {
              const own = r.employee_id === profile.employee_id
              return <tr key={r.id}><td><strong>{fullName(r.employees)}</strong><br /><span className="muted">{r.employees?.employee_no}</span></td><td>{r.leave_types?.name}</td>
                <td>{fmtDate(r.start_date)}</td><td>{fmtDate(r.end_date)}</td><td className="num">{r.days}</td><td>{r.reason ?? '—'}{r.decision_note && <><br /><span className="muted">Note: {r.decision_note}</span></>}</td>
                <td><span className={`status ${r.status}`}>{pretty(r.status)}</span></td>
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {r.status === 'pending' && !own && (profile.role !== 'auditor') && <><button className="mini" onClick={() => decide(r.id, true)}>Approve</button><button className="mini danger" onClick={() => decide(r.id, false)}>Reject</button></>}
                  {isHr && (r.status === 'pending' || r.status === 'approved') && <button className="mini danger" onClick={() => cancel(r.id)}>Cancel</button>}
                  {r.status === 'pending' && own && <span className="muted">Your request</span>}
                </td></tr>
            })}
          </tbody></table>)}
      </div>
    </div>
  )
}
