'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { money } from '@/lib/format'
import { monthName, printPayslip } from '@/lib/payslip'

export default function PayslipsPage() {
  const { profile, org } = useApp()
  const [rows, setRows] = useState<any[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!profile.employee_id) { setRows([]); return }
    createClient().from('payroll_lines').select('*').eq('employee_id', profile.employee_id)
      .order('period_year', { ascending: false }).order('period_month', { ascending: false })
      .then(({ data, error }) => { if (error) setError(error.message); setRows(data ?? []) })
  }, [profile.employee_id])

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>My payslips</h1><p className="muted">Available after a payroll has been approved. Use Print and choose “Save as PDF” to keep a copy.</p></div></div>
      {error && <p className="error msg">{error}</p>}
      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">No payslips yet.</p> : (
          <table><thead><tr><th>Month</th><th className="num">Gross pay</th><th className="num">Deductions</th><th className="num">Net pay</th><th /></tr></thead><tbody>
            {rows.map(r => <tr key={r.id}><td><strong>{monthName(r.period_month)} {r.period_year}</strong></td><td className="num">{money(r.gross_pay, r.currency_code)}</td>
              <td className="num">{money(Number(r.gross_pay) - Number(r.net_pay), r.currency_code)}</td><td className="num"><strong>{money(r.net_pay, r.currency_code)}</strong></td>
              <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => printPayslip(r, org.name)}>View / Print</button></td></tr>)}
          </tbody></table>)}
      </div>
    </div>
  )
}
