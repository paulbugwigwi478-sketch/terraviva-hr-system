'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { pretty } from '@/lib/format'

export default function AuditPage() {
  const [rows, setRows] = useState<any[] | null>(null)
  const [table, setTable] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    setRows(null)
    let q = createClient().from('audit_logs').select('*').order('created_at', { ascending: false }).limit(200)
    if (table) q = q.eq('table_name', table)
    q.then(({ data, error }) => { if (error) setError(error.message); setRows(data ?? []) })
  }, [table])

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Audit log</h1><p className="muted">Every change to HR records. Entries cannot be edited or removed.</p></div></div>
      {error && <p className="error msg">{error}</p>}
      <div className="filters"><label>Record type<select value={table} onChange={e => setTable(e.target.value)}><option value="">All</option>
        {['employees', 'employee_private', 'employee_compensation', 'contracts', 'documents', 'leave_requests', 'leave_balances', 'profiles', 'member_invites'].map(t => <option key={t} value={t}>{pretty(t)}</option>)}</select></label></div>
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No audit entries.</p> : (
          <table><thead><tr><th>When</th><th>Record</th><th>Action</th><th>Details</th></tr></thead><tbody>
            {rows.map(r => <tr key={r.id}><td style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleString('en-GB')}</td><td>{pretty(r.table_name)}</td><td><span className="status">{r.action}</span></td>
              <td><details><summary>View</summary><pre>{JSON.stringify(r.new_data ?? r.old_data, null, 2)}</pre></details></td></tr>)}
          </tbody></table>)}
      </div>
    </div>
  )
}
