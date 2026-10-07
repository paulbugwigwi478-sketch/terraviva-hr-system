'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can } from '@/lib/roles'
import { downloadCsv, errMsg, fetchAll, fmtDate, fullName, money, pretty } from '@/lib/format'
import { monthName, printPayslip } from '@/lib/payslip'

type Msg = { kind: 'error' | 'success'; text: string } | null
const sum = (rows: any[], k: string) => rows.reduce((a, r) => a + Number(r[k] ?? 0), 0)

export default function PayrollPage() {
  const { profile, org } = useApp()
  const isHr = can(profile.role, ['hr_admin'])
  const now = new Date()
  const [runs, setRuns] = useState<any[] | null>(null)
  const [allLines, setAllLines] = useState<any[]>([])
  const [confirmed, setConfirmed] = useState<boolean | null>(null)
  const [selId, setSelId] = useState<string | null>(null)
  const [people, setPeople] = useState<any[]>([])
  const [year, setYear] = useState(String(now.getFullYear()))
  const [month, setMonth] = useState(String(now.getMonth() + 1))
  const [note, setNote] = useState('')
  const [usd, setUsd] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const sb = createClient()
    try {
      const [r, s, e, lines] = await Promise.all([
        sb.from('payroll_runs').select('*').order('period_year', { ascending: false }).order('period_month', { ascending: false }),
        sb.from('payroll_settings').select('confirmed_at').eq('organization_id', org.id).maybeSingle(),
        sb.from('employees').select('id,first_name,middle_name,last_name,employee_no').eq('status', 'active').order('last_name'),
        fetchAll<any>((a, b) => sb.from('payroll_lines').select('*').order('employee_name').range(a, b) as any),
      ])
      if (r.error) setMsg({ kind: 'error', text: r.error.message })
      setRuns(r.data ?? []); setConfirmed(!!s.data?.confirmed_at); setPeople(e.data ?? []); setAllLines(lines)
    } catch (err) { setMsg({ kind: 'error', text: errMsg(err) }); setRuns([]) }
  }, [org.id])
  useEffect(() => { load() }, [load])

  const sel = runs?.find(r => r.id === selId) ?? null
  const lines = useMemo(() => allLines.filter(l => l.run_id === selId), [allLines, selId])
  const missing = useMemo(() => people.filter(p => !lines.some(l => l.employee_id === p.id)), [people, lines])

  async function generate(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null)
    const { data, error } = await createClient().rpc('generate_payroll', { p_year: Number(year), p_month: Number(month), p_note: note.trim() || null, p_usd_rate: usd.trim() ? Number(usd) : null })
    setBusy(false)
    if (error) return setMsg({ kind: 'error', text: error.message })
    setNote(''); setMsg({ kind: 'success', text: 'Payroll prepared. Check it, then ask someone else (a Director or another HR admin) to approve it.' })
    await load(); setSelId(data as string)
  }

  async function act(fn: string, ok: string) {
    if (!sel) return
    const { error } = await createClient().rpc(fn, { p_run_id: sel.id })
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: ok }); load() }
  }
  const cancel = () => { if (window.confirm('Cancel this payroll? It will no longer count.')) act('cancel_payroll', 'Payroll cancelled.') }

  async function bankFile() {
    const { data } = await createClient().from('employee_private').select('employee_id,bank_name,bank_account').in('employee_id', lines.map(l => l.employee_id))
    const bank = new Map((data ?? []).map((b: any) => [b.employee_id, b]))
    downloadCsv(`bank-payments-${sel.period_year}-${String(sel.period_month).padStart(2, '0')}.csv`, [['Employee no.', 'Name', 'Bank', 'Account number', 'Net pay (TZS)'],
      ...lines.map(l => { const b: any = bank.get(l.employee_id); return [l.employee_no, l.employee_name, b?.bank_name ?? '', b?.bank_account ?? '', Number(l.net_pay).toFixed(2)] })])
  }
  function payrollFile() {
    downloadCsv(`payroll-${sel.period_year}-${String(sel.period_month).padStart(2, '0')}.csv`, [
      ['Employee no.', 'Name', 'Department', 'Basic', 'Allowances', 'Gross', 'NSSF (employee)', 'PAYE', 'NHIF (employee)', 'Other deductions', 'Net pay', 'NSSF (employer)', 'WCF', 'SDL', 'NHIF (employer)'],
      ...lines.map(l => [l.employee_no, l.employee_name, l.department ?? '', l.basic_salary, l.allowances, l.gross_pay, l.nssf_employee, l.paye, l.nhif_employee, l.other_deductions, l.net_pay, l.nssf_employer, l.wcf_employer, l.sdl_employer, l.nhif_employer])])
  }

  const t = {
    gross: sum(lines, 'gross_pay'), paye: sum(lines, 'paye'), nssfE: sum(lines, 'nssf_employee'), nssfR: sum(lines, 'nssf_employer'), wcf: sum(lines, 'wcf_employer'),
    sdl: sum(lines, 'sdl_employer'), nhifE: sum(lines, 'nhif_employee'), nhifR: sum(lines, 'nhif_employer'), other: sum(lines, 'other_deductions'), net: sum(lines, 'net_pay'),
  }
  const employerCost = t.gross + t.nssfR + t.wcf + t.sdl + t.nhifR
  const preparedByMe = sel?.created_by === profile.id

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Payroll</h1><p className="muted">Prepare monthly pay. A payroll must be approved by someone other than the person who prepared it.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}
      {confirmed === false && <p className="error msg">The payroll rates have not been confirmed. {isHr ? <Link href="/payroll-settings">Check and confirm them</Link> : 'Ask the HR admin to confirm them.'} before running payroll.</p>}

      {isHr && (
        <form className="form-grid" onSubmit={generate}>
          <label>Month<select value={month} onChange={e => setMonth(e.target.value)}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{monthName(i + 1)}</option>)}</select></label>
          <label>Year<input type="number" min="2000" max="2100" value={year} onChange={e => setYear(e.target.value)} /></label>
          <label>USD rate (TZS per 1 USD)<input type="number" step="0.01" min="0" value={usd} onChange={e => setUsd(e.target.value)} placeholder="Only if someone is paid in USD" /></label>
          <label>Note (optional)<input value={note} onChange={e => setNote(e.target.value)} /></label>
          <div className="actions"><button className="primary" disabled={busy || confirmed === false}>{busy ? 'Preparing…' : 'Prepare payroll'}</button>
            <span className="muted">Uses each employee’s latest salary (TZS or USD) and active allowances and deductions. Staff who joined or left during the month are paid for the days worked, and approved unpaid leave is deducted.</span></div>
        </form>)}

      <div className="panel"><h2>Payroll runs</h2>
        {runs === null ? <p className="empty">Loading…</p> : runs.length === 0 ? <p className="empty">No payroll has been prepared yet.</p> : (
          <table><thead><tr><th>Month</th><th>Status</th><th className="num">Employees</th><th className="num">Gross</th><th className="num">Net pay</th><th /></tr></thead><tbody>
            {runs.map(r => { const ls = allLines.filter(l => l.run_id === r.id); return (
              <tr key={r.id} style={r.id === selId ? { background: '#f3f8f6' } : undefined}><td><strong>{monthName(r.period_month)} {r.period_year}</strong>{r.note && <><br /><span className="muted">{r.note}</span></>}</td>
                <td><span className={`status ${r.status === 'paid' ? 'active' : r.status === 'cancelled' ? 'rejected' : r.status === 'approved' ? 'approved' : 'pending'}`}>{pretty(r.status)}</span></td>
                <td className="num">{ls.length}</td><td className="num">{money(sum(ls, 'gross_pay'), 'TZS')}</td><td className="num">{money(sum(ls, 'net_pay'), 'TZS')}</td>
                <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => { setSelId(r.id); setMsg(null) }}>{r.id === selId ? 'Opened' : 'Open'}</button></td></tr>) })}
          </tbody></table>)}
      </div>

      {sel && (
        <>
          <div className="page-head" style={{ marginTop: 6 }}>
            <div><h2 style={{ margin: 0 }}>{monthName(sel.period_month)} {sel.period_year} <span className={`status ${sel.status === 'paid' ? 'active' : sel.status === 'cancelled' ? 'rejected' : 'pending'}`}>{pretty(sel.status)}</span></h2>
              <p className="muted">{sel.usd_rate ? `USD rate used: TZS ${money(sel.usd_rate)}. ` : ''}{sel.approved_at ? `Approved ${fmtDate(sel.approved_at)}. ` : ''}{sel.paid_at ? `Paid ${fmtDate(sel.paid_at)}.` : ''}</p></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {sel.status === 'draft' && !preparedByMe && <button className="primary" onClick={() => act('approve_payroll', 'Payroll approved. Employees can now see their payslips.')}>Approve payroll</button>}
              {sel.status === 'draft' && preparedByMe && <span className="muted" style={{ alignSelf: 'center' }}>Waiting for someone else to approve</span>}
              {sel.status === 'approved' && <button className="primary" onClick={() => act('mark_payroll_paid', 'Marked as paid.')}>Mark as paid</button>}
              {(sel.status === 'draft' || sel.status === 'approved') && <button className="mini danger" onClick={cancel}>Cancel payroll</button>}
              <button className="mini" onClick={payrollFile}>Export to Excel</button>
              {sel.status !== 'cancelled' && <button className="mini" onClick={bankFile}>Bank payment list</button>}
            </div>
          </div>

          <div className="cards">
            <div className="card"><span>Gross pay</span><strong>{money(t.gross)}</strong><small>{lines.length} employees</small></div>
            <div className="card"><span>Net pay to employees</span><strong>{money(t.net)}</strong><small>After tax and deductions</small></div>
            <div className="card"><span>PAYE to TRA</span><strong>{money(t.paye)}</strong><small>Check the due date with TRA</small></div>
            <div className="card"><span>Total cost to Terraviva</span><strong>{money(employerCost)}</strong><small>Gross + employer contributions</small></div>
          </div>

          <div className="panel" style={{ marginTop: 18 }}><h2>Payments due to authorities</h2>
            <div className="row"><span>PAYE (TRA)</span><b>{money(t.paye, 'TZS')}</b></div>
            <div className="row"><span>NSSF (employee {money(t.nssfE)} + employer {money(t.nssfR)})</span><b>{money(t.nssfE + t.nssfR, 'TZS')}</b></div>
            <div className="row"><span>WCF (employer)</span><b>{money(t.wcf, 'TZS')}</b></div>
            <div className="row"><span>SDL (employer)</span><b>{money(t.sdl, 'TZS')}</b></div>
            {(t.nhifE + t.nhifR) > 0 && <div className="row"><span>NHIF (employee + employer)</span><b>{money(t.nhifE + t.nhifR, 'TZS')}</b></div>}
          </div>

          <div className="panel"><h2>Employees</h2>
            <table><thead><tr><th>Employee</th><th className="num">Gross</th><th className="num">NSSF</th><th className="num">PAYE</th><th className="num">Other deductions</th><th className="num">Net pay</th><th /></tr></thead><tbody>
              {lines.map(l => <tr key={l.id}><td><strong>{l.employee_name}</strong><br /><span className="muted">{l.employee_no}{l.department ? ` · ${l.department}` : ''}</span>
                {Number(l.days_paid) > 0 && Number(l.days_paid) < Number(l.days_in_month) && <><br /><span className="muted">Part month: {l.days_paid} of {l.days_in_month} days</span></>}
                {Number(l.unpaid_leave_days) > 0 && <><br /><span className="muted">Unpaid leave: {l.unpaid_leave_days} days</span></>}
                {l.salary_currency === 'USD' && <><br /><span className="muted">USD {money(l.salary_original)} at {money(l.fx_rate)}</span></>}</td>
                <td className="num">{money(l.gross_pay)}</td><td className="num">{money(l.nssf_employee)}</td><td className="num">{money(l.paye)}</td>
                <td className="num">{money(Number(l.other_deductions) + Number(l.nhif_employee))}</td><td className="num"><strong>{money(l.net_pay)}</strong></td>
                <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => printPayslip(l, org.name)}>Payslip</button></td></tr>)}
            </tbody>
            <tfoot><tr><td>Total</td><td className="num">{money(t.gross)}</td><td className="num">{money(t.nssfE)}</td><td className="num">{money(t.paye)}</td><td className="num">{money(t.other + t.nhifE)}</td><td className="num">{money(t.net)}</td><td /></tr></tfoot></table>
            {sel.status === 'draft' && missing.length > 0 && (
              <p className="muted" style={{ marginTop: 12 }}>Not in this payroll (no salary recorded yet): {missing.map(m => fullName(m)).join(', ')}. Add their salary on their employee page, then cancel and prepare the payroll again.</p>)}
          </div>
        </>
      )}
    </div>
  )
}
