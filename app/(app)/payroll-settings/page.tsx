'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { errMsg, fmtDate, money } from '@/lib/format'

type Msg = { kind: 'error' | 'success'; text: string } | null
const pct = (v: number) => String(Number((Number(v) * 100).toFixed(2)))
const frac = (s: string) => Math.round((Number(s) / 100) * 10000) / 10000

export default function PayrollSettingsPage() {
  const { org } = useApp()
  const [s, setS] = useState<any | null>(null)
  const [f, setF] = useState<any>({})
  const [bands, setBands] = useState<any[] | null>(null)
  const [bf, setBf] = useState<{ id: string | null; lower: string; fixed: string; rate: string } | null>(null)
  const [msg, setMsg] = useState<Msg>(null)

  const load = useCallback(async () => {
    const sb = createClient()
    const [a, b] = await Promise.all([
      sb.from('payroll_settings').select('*').eq('organization_id', org.id).maybeSingle(),
      sb.from('paye_bands').select('*').eq('organization_id', org.id).order('lower_bound'),
    ])
    if (a.error) setMsg({ kind: 'error', text: a.error.message })
    const row = a.data
    setS(row)
    if (row) setF({
      nssf_employee_rate: pct(row.nssf_employee_rate), nssf_employer_rate: pct(row.nssf_employer_rate), nssf_deductible_for_paye: row.nssf_deductible_for_paye,
      wcf_employer_rate: pct(row.wcf_employer_rate), sdl_rate: pct(row.sdl_rate), sdl_min_employees: String(row.sdl_min_employees),
      nhif_enabled: row.nhif_enabled, nhif_employee_rate: pct(row.nhif_employee_rate), nhif_employer_rate: pct(row.nhif_employer_rate),
    })
    setBands(b.data ?? [])
  }, [org.id])
  useEffect(() => { load() }, [load])

  async function saveRates(e: FormEvent) {
    e.preventDefault(); setMsg(null)
    const { error } = await createClient().from('payroll_settings').update({
      nssf_employee_rate: frac(f.nssf_employee_rate), nssf_employer_rate: frac(f.nssf_employer_rate), nssf_deductible_for_paye: !!f.nssf_deductible_for_paye,
      wcf_employer_rate: frac(f.wcf_employer_rate), sdl_rate: frac(f.sdl_rate), sdl_min_employees: Number(f.sdl_min_employees),
      nhif_enabled: !!f.nhif_enabled, nhif_employee_rate: frac(f.nhif_employee_rate), nhif_employer_rate: frac(f.nhif_employer_rate),
    }).eq('organization_id', org.id)
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setMsg({ kind: 'success', text: 'Rates saved. Please confirm them again before running payroll.' }); load()
  }

  async function confirm() {
    if (!window.confirm('Have you checked these rates and the PAYE bands against current TRA, NSSF and WCF guidance?')) return
    const { error } = await createClient().rpc('confirm_payroll_rates')
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: 'Rates confirmed. You can now run payroll.' }); load() }
  }

  async function saveBand(e: FormEvent) {
    e.preventDefault()
    if (!bf) return
    const payload = { lower_bound: Number(bf.lower), fixed_amount: Number(bf.fixed || 0), rate: frac(bf.rate) }
    const sb = createClient()
    const { error } = bf.id ? await sb.from('paye_bands').update(payload).eq('id', bf.id) : await sb.from('paye_bands').insert({ ...payload, organization_id: org.id })
    if (error) return setMsg({ kind: 'error', text: errMsg(error) })
    setBf(null); setMsg({ kind: 'success', text: 'PAYE band saved. Please confirm the rates again.' }); load()
  }
  async function delBand(id: string) {
    if (!window.confirm('Delete this PAYE band?')) return
    const { error } = await createClient().from('paye_bands').delete().eq('id', id)
    if (error) setMsg({ kind: 'error', text: error.message }); else { setMsg({ kind: 'success', text: 'Band deleted. Please confirm the rates again.' }); load() }
  }

  const T = (k: string, label: string, suffix = '%') => (
    <label>{label} ({suffix})<input type="number" step="0.01" min="0" required value={f[k] ?? ''} onChange={e => setF({ ...f, [k]: e.target.value })} /></label>)

  if (s === null && bands === null) return <p className="empty">Loading…</p>

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Payroll settings</h1><p className="muted">Statutory rates used to calculate PAYE and contributions.</p></div></div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}

      <div className="panel" style={{ borderColor: s?.confirmed_at ? '#2f7d32' : '#c27a1c' }}>
        {s?.confirmed_at
          ? <p><span className="status active">Confirmed</span> on {fmtDate(s.confirmed_at)}. Any change to a rate or band removes this confirmation.</p>
          : <p><span className="status pending">Not confirmed</span> Payroll cannot be run until you confirm the rates below.</p>}
        <p className="muted" style={{ marginTop: 8 }}>
          The starting values are common Tanzania figures (NSSF 10% + 10%, WCF 0.5%, SDL 3.5% for employers with 10 or more staff, and the monthly PAYE bands shown below), but they change from time to time and sources differ.
          Check them with TRA (tra.go.tz), NSSF and WCF, and ask your accountant, before confirming.
        </p>
        <div style={{ marginTop: 10 }}><button className="primary" onClick={confirm}>Confirm these rates</button> <Link href="/payroll" style={{ marginLeft: 12 }}>Go to payroll</Link></div>
      </div>

      <form className="form-grid" onSubmit={saveRates}>
        {T('nssf_employee_rate', 'NSSF, employee share')}{T('nssf_employer_rate', 'NSSF, employer share')}
        <label className="check"><input type="checkbox" checked={!!f.nssf_deductible_for_paye} onChange={e => setF({ ...f, nssf_deductible_for_paye: e.target.checked })} />Employee NSSF is deducted before PAYE</label>
        {T('wcf_employer_rate', 'WCF, employer')}{T('sdl_rate', 'SDL, employer')}
        <label>SDL applies from this many employees<input type="number" min="0" required value={f.sdl_min_employees ?? ''} onChange={e => setF({ ...f, sdl_min_employees: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={!!f.nhif_enabled} onChange={e => setF({ ...f, nhif_enabled: e.target.checked })} />Use NHIF health insurance contributions</label>
        {T('nhif_employee_rate', 'NHIF, employee share')}{T('nhif_employer_rate', 'NHIF, employer share')}
        <div className="actions"><button className="primary">Save rates</button></div>
      </form>

      <div className="panel">
        <div className="page-head" style={{ marginBottom: 10 }}><h2 style={{ margin: 0 }}>PAYE bands (monthly, TZS)</h2>
          {!bf && <button className="mini" onClick={() => setBf({ id: null, lower: '', fixed: '0', rate: '' })}>Add band</button>}</div>
        {bf && (
          <form className="form-grid" onSubmit={saveBand} style={{ border: 0, padding: 0 }}>
            <label>Income above (TZS) *<input type="number" min="0" required value={bf.lower} onChange={e => setBf({ ...bf, lower: e.target.value })} /></label>
            <label>Fixed tax at this point (TZS)<input type="number" min="0" value={bf.fixed} onChange={e => setBf({ ...bf, fixed: e.target.value })} /></label>
            <label>Rate on the excess (%) *<input type="number" step="0.01" min="0" max="100" required value={bf.rate} onChange={e => setBf({ ...bf, rate: e.target.value })} /></label>
            <div className="actions"><button className="primary">Save band</button><button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => setBf(null)}>Cancel</button></div>
          </form>)}
        {bands === null ? <p className="empty">Loading…</p> : (
          <table><thead><tr><th>Monthly taxable income above</th><th className="num">Fixed tax</th><th className="num">Rate on the excess</th><th /></tr></thead><tbody>
            {bands.map(b => <tr key={b.id}><td>{money(b.lower_bound, 'TZS')}</td><td className="num">{money(b.fixed_amount, 'TZS')}</td><td className="num">{pct(b.rate)}%</td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}><button className="mini" onClick={() => setBf({ id: b.id, lower: String(b.lower_bound), fixed: String(b.fixed_amount), rate: pct(b.rate) })}>Edit</button>
                <button className="mini danger" onClick={() => delBand(b.id)}>Delete</button></td></tr>)}
          </tbody></table>)}
        <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>How it works: for taxable income above a band, tax = fixed tax + rate × (income − the band’s lower amount). The highest band that is below the income applies.</p>
      </div>
    </div>
  )
}
