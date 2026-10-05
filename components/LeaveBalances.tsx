'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { errMsg } from '@/lib/format'

export default function LeaveBalances({ emp, orgId, isHr, setMsg }: any) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [rows, setRows] = useState<any[] | null>(null)

  const load = useCallback(async () => {
    const { data } = await createClient().rpc('leave_balances_for', { p_employee_id: emp.id, p_year: year })
    setRows((data as any[]) ?? [])
  }, [emp.id, year])
  useEffect(() => { load() }, [load])

  async function adjust(r: any) {
    const ent = window.prompt(`${r.name}, ${year}\n\nDays this employee is entitled to this year.\nLeave empty to use the standard entitlement.`, r.entitled ?? '')
    if (ent === null) return
    const car = window.prompt('Days carried over from the previous year (0 if none):', String(r.carried_over ?? 0))
    if (car === null) return
    const entitled = ent.trim() === '' ? null : Number(ent)
    const carried = car.trim() === '' ? 0 : Number(car)
    if ((entitled !== null && (Number.isNaN(entitled) || entitled < 0)) || Number.isNaN(carried) || carried < 0) {
      setMsg({ kind: 'error', text: 'Please enter numbers of zero or more.' })
      return
    }
    const { error } = await createClient().from('leave_balances').upsert(
      { organization_id: orgId, employee_id: emp.id, leave_type_id: r.leave_type_id, year, entitled_days: entitled, carried_over_days: carried },
      { onConflict: 'employee_id,leave_type_id,year' },
    )
    if (error) setMsg({ kind: 'error', text: errMsg(error) })
    else { setMsg({ kind: 'success', text: 'Leave balance updated.' }); load() }
  }

  return (
    <div className="panel">
      <div className="page-head" style={{ marginBottom: 10 }}>
        <h2 style={{ margin: 0 }}>Leave balances</h2>
        <select value={year} onChange={e => setYear(Number(e.target.value))} style={{ width: 'auto' }}>
          {[thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
      {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? <p className="empty">Not available.</p> : (
        <table>
          <thead><tr><th>Leave type</th><th className="num">Entitled</th><th className="num">Carried over</th><th className="num">Used</th><th className="num">Pending</th><th className="num">Remaining</th>{isHr && <th />}</tr></thead>
          <tbody>
            {rows.map((r: any) => (
              <tr key={r.leave_type_id}>
                <td><strong>{r.name}</strong></td><td className="num">{r.entitled ?? '∞'}</td><td className="num">{r.carried_over}</td>
                <td className="num">{r.used}</td><td className="num">{r.pending}</td><td className="num"><strong>{r.remaining ?? '∞'}</strong></td>
                {isHr && <td style={{ textAlign: 'right' }}><button className="mini" onClick={() => adjust(r)}>Adjust</button></td>}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {isHr && <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>Use “Adjust” for a new hire’s part-year entitlement or to carry unused days over from last year.</p>}
    </div>
  )
}
