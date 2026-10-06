'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { errMsg, fullName, money, pretty } from '@/lib/format'

export default function PayItemsPage() {
  const { profile, org } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const [rows, setRows] = useState<any[] | null>(null)
  const [people, setPeople] = useState<any[]>([])
  const [f, setF] = useState<any | null>(null)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)

  const load = useCallback(async () => {
    const sb = createClient()
    const [i, e] = await Promise.all([
      sb.from('employee_pay_items').select('*, employees(first_name,middle_name,last_name,employee_no)').order('created_at', { ascending: false }),
      sb.from('employees').select('id,first_name,middle_name,last_name').eq('status', 'active').order('last_name'),
    ])
    if (i.error) setMsg({ kind: 'error', text: i.error.message })
    setRows(i.data ?? []); setPeople(e.data ?? [])
  }, [])
  useEffect(() => { load() }, [load])

  async function add(e: FormEvent) {
    e.preventDefault()
    const { error } = await createClient().from('employee_pay_items').insert({
      organization_id: org.id, employee_id: f.employee, kind: f.kind, name: f.name.trim(), amount: Number(f.amount), taxable: f.kind === 'allowance' ? !!f.taxable : false })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setF(null); setMsg({ kind: 'success', text: 'Saved. It applies to every payroll run from now on, until you switch it off.' }); load()
  }
  async function toggle(r: any) {
    const { error } = await createClient().from('employee_pay_items').update({ active: !r.active }).eq('id', r.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }
  async function remove(r: any) {
    if (!window.confirm(`Delete “${r.name}”?`)) return
    const { error } = await createClient().from('employee_pay_items').delete().eq('id', r.id)
    if (error) setMsg({ kind: 'error', text: error.message }); else load()
  }

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Allowances and deductions</h1>
        <p className="muted">Monthly amounts added to or taken from an employee’s pay (for example transport allowance or a staff loan repayment). They repeat every month while active.</p></div>
        {isHr && !f && <button className="primary" onClick={() => setF({ employee: '', kind: 'allowance', name: '', amount: '', taxable: true })}>Add item</button>}</div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      {f && (
        <form className="form-grid" onSubmit={add}>
          <label>Employee *<select required value={f.employee} onChange={e => setF({ ...f, employee: e.target.value })}><option value="">Select…</option>{people.map(p => <option key={p.id} value={p.id}>{fullName(p)}</option>)}</select></label>
          <label>Type *<select value={f.kind} onChange={e => setF({ ...f, kind: e.target.value })}><option value="allowance">Allowance (adds to pay)</option><option value="deduction">Deduction (taken after tax)</option></select></label>
          <label>Name *<input required value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="e.g. Transport allowance, Staff loan" /></label>
          <label>Amount per month (TZS) *<input type="number" min="0" step="0.01" required value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} /></label>
          {f.kind === 'allowance' && <label className="check"><input type="checkbox" checked={!!f.taxable} onChange={e => setF({ ...f, taxable: e.target.checked })} />Taxable (counts for PAYE)</label>}
          <div className="actions"><button className="primary">Save</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setF(null)}>Cancel</button></div>
        </form>)}
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No allowances or deductions yet.</p> : (
          <table><thead><tr><th>Employee</th><th>Item</th><th>Type</th><th className="num">Per month</th><th>Taxable</th><th>Status</th>{isHr && <th />}</tr></thead><tbody>
            {rows.map(r => <tr key={r.id}><td><strong>{fullName(r.employees)}</strong><br /><span className="muted">{r.employees?.employee_no}</span></td><td>{r.name}</td><td>{pretty(r.kind)}</td>
              <td className="num">{money(r.amount, 'TZS')}</td><td>{r.kind === 'allowance' ? (r.taxable ? 'Yes' : 'No') : '—'}</td>
              <td><span className={`status ${r.active ? 'active' : 'closed'}`}>{r.active ? 'Active' : 'Off'}</span></td>
              {isHr && <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="mini" onClick={() => toggle(r)}>{r.active ? 'Switch off' : 'Switch on'}</button><button className="mini danger" onClick={() => remove(r)}>Delete</button></td>}</tr>)}
          </tbody></table>)}
      </div>
    </div>
  )
}
