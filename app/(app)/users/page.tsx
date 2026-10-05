'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { ROLES, ROLE_LABELS } from '@/lib/roles'
import { errMsg, fmtDate, fullName } from '@/lib/format'

export default function UsersPage() {
  const { profile, org } = useApp()
  const [members, setMembers] = useState<any[]>([])
  const [invites, setInvites] = useState<any[]>([])
  const [people, setPeople] = useState<any[]>([])
  const [f, setF] = useState({ employee: '', email: '', role: 'employee' })
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const load = useCallback(async () => {
    const sb = createClient()
    const [m, i, e] = await Promise.all([
      sb.from('profiles').select('*, employees:employee_id(employee_no,first_name,last_name)').eq('organization_id', org.id).order('created_at'),
      sb.from('member_invites').select('*').eq('organization_id', org.id).order('created_at', { ascending: false }),
      sb.from('employees').select('id,first_name,middle_name,last_name,work_email,user_id,status').eq('status', 'active').order('last_name'),
    ])
    setMembers(m.data ?? []); setInvites(i.data ?? []); setPeople(e.data ?? [])
    if (m.error || i.error) setMsg({ kind: 'error', text: (m.error ?? i.error)!.message })
  }, [org.id])
  useEffect(() => { load() }, [load])

  function pick(id: string) {
    const p = people.find(x => x.id === id)
    setF({ ...f, employee: id, email: p?.work_email ?? f.email })
  }
  async function invite(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('member_invites').insert({ organization_id: org.id, email: f.email.trim().toLowerCase(), role: f.role, employee_id: f.employee || null })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setF({ employee: '', email: '', role: 'employee' }); setMsg({ kind: 'success', text: 'Invitation saved. Ask this person to sign up with that exact email and confirm it.' }); load()
  }
  async function change(id: string, role: string, active: boolean) {
    const { error } = await createClient().rpc('set_member_role', { p_user_id: id, p_role: role, p_is_active: active })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: 'Member updated.' }); load() }
  }
  async function cancelInvite(id: string) {
    const { error } = await createClient().from('member_invites').delete().eq('id', id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Users and roles</h1><p className="muted">Nobody gets access by signing up. Invite an email address (ideally linked to an employee record); they then sign up with it.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      <form className="form-grid" onSubmit={invite}>
        <label>Employee (optional)<select value={f.employee} onChange={e => pick(e.target.value)}><option value="">— not linked —</option>
          {people.filter(p => !p.user_id).map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></label>
        <label>Email to invite *<input type="email" required value={f.email} onChange={e => setF({ ...f, email: e.target.value })} /></label>
        <label>Role<select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></label>
        <div><button className="primary">Invite</button></div>
      </form>

      <div className="panel"><h2>Members</h2>
        <table><thead><tr><th>Name</th><th>Employee record</th><th>Role</th><th>Status</th><th>Joined</th></tr></thead><tbody>
          {members.map(m => (
            <tr key={m.id}><td><strong>{m.full_name}</strong>{m.id === profile.id && <span className="muted"> (you)</span>}<br /><span className="muted">{m.email}</span></td>
              <td>{m.employees ? `${m.employees.employee_no} · ${fullName(m.employees)}` : <span className="muted">Not linked</span>}</td>
              <td><select value={m.role} disabled={m.id === profile.id} onChange={e => change(m.id, e.target.value, m.is_active)} style={{ width: 'auto' }}>{ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></td>
              <td>{m.id === profile.id ? <span className="status active">Active</span> : <button className="mini" onClick={() => change(m.id, m.role, !m.is_active)}>{m.is_active ? 'Deactivate' : 'Reactivate'}</button>}</td>
              <td>{fmtDate(m.created_at)}</td></tr>))}
        </tbody></table>
      </div>

      <div className="panel"><h2>Invitations</h2>
        {invites.length === 0 ? <p className="empty">No invitations.</p> : <table><thead><tr><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead><tbody>
          {invites.map(i => <tr key={i.id}><td>{i.email}</td><td>{ROLE_LABELS[i.role as keyof typeof ROLE_LABELS] ?? i.role}</td>
            <td><span className={`status ${i.accepted_at ? 'active' : 'pending'}`}>{i.accepted_at ? 'Accepted' : 'Waiting'}</span></td>
            <td style={{ textAlign: 'right' }}>{!i.accepted_at && <button className="mini danger" onClick={() => cancelInvite(i.id)}>Cancel</button>}</td></tr>)}
        </tbody></table>}
      </div>
    </div>
  )
}
