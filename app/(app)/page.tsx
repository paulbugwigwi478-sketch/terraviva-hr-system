'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { ORG_VIEWERS, can } from '@/lib/roles'
import { fmtDate, fullName, pretty, todayIso } from '@/lib/format'

const inDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10)

export default function Dashboard() {
  const { profile, org, isManager } = useApp()
  const wide = can(profile.role, ORG_VIEWERS)
  const hrView = can(profile.role, ['hr_admin', 'director'])
  const [d, setD] = useState<any | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    ;(async () => {
      const sb = createClient(), t = todayIso(), year = new Date().getFullYear()
      const [emps, onLeave, pending, contracts, holidays, bal, celeb, docs] = await Promise.all([
        sb.from('employees').select('id,first_name,last_name,status,department_id,employment_type,gender,probation_end_date,departments!employees_department_id_fkey(name)'),
        sb.from('leave_requests').select('id,start_date,end_date,employees(first_name,last_name),leave_types(name)').eq('status', 'approved').lte('start_date', t).gte('end_date', t),
        sb.from('leave_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
        wide ? sb.from('contracts').select('id,end_date,contract_type,employees(id,first_name,last_name)').eq('status', 'active').not('end_date', 'is', null).lte('end_date', inDays(60)).order('end_date') : Promise.resolve({ data: [], error: null }),
        sb.from('holidays').select('holiday_date,name').gte('holiday_date', t).order('holiday_date').limit(4),
        profile.employee_id ? sb.rpc('leave_balances_for', { p_employee_id: profile.employee_id, p_year: year }) : Promise.resolve({ data: [], error: null }),
        sb.rpc('upcoming_celebrations', { p_days: 30 }),
        sb.from('documents').select('id,name,category,expires_on,employees(id,first_name,last_name)').not('expires_on', 'is', null).lte('expires_on', inDays(60)).order('expires_on'),
      ])
      const err = [emps, onLeave, pending, contracts, holidays, bal, celeb, docs].find((r: any) => r.error)?.error
      if (err) setError(err.message)
      setD({
        emps: emps.data ?? [], onLeave: onLeave.data ?? [], pending: (pending as any).count ?? 0, contracts: contracts.data ?? [],
        holidays: holidays.data ?? [], bal: bal.data ?? [], celeb: celeb.data ?? [], docs: docs.data ?? [],
      })
    })()
  }, [wide, profile.employee_id])

  if (!d) return <p className="empty">Loading dashboard…</p>

  const active = d.emps.filter((e: any) => e.status === 'active')
  const byDept: Record<string, number> = {}
  active.forEach((e: any) => { const k = e.departments?.name ?? 'No department'; byDept[k] = (byDept[k] ?? 0) + 1 })
  const deptRows = Object.entries(byDept).sort((a, b) => b[1] - a[1])
  const maxDept = Math.max(1, ...deptRows.map(r => r[1]))
  const probation = active.filter((e: any) => e.probation_end_date && e.probation_end_date >= todayIso() && e.probation_end_date <= inDays(30))
  const annual = d.bal.find((b: any) => b.code === 'ANNUAL')
  const t = todayIso()
  const showDocs = hrView || d.docs.length > 0

  return (
    <div className="module-page">
      <div className="page-head"><div><h1>Welcome, {(profile.full_name || '').split(' ')[0] || 'there'}</h1><p className="muted">{org.name} people and leave at a glance.</p></div></div>
      {error && <p className="error msg">Some figures could not load: {error}</p>}

      <div className="cards">
        {wide ? <>
          <div className="card"><span>Active employees</span><strong>{active.length}</strong><small>{d.emps.length - active.length} not active</small></div>
          <div className="card"><span>On leave today</span><strong>{d.onLeave.length}</strong><small>Approved leave</small></div>
          <div className="card"><span>Leave awaiting decision</span><strong>{d.pending}</strong><small><Link href="/leave-requests">Open requests</Link></small></div>
          <div className="card"><span>Contracts ending in 60 days</span><strong>{d.contracts.length}</strong><small>{probation.length} on probation ending soon</small></div>
        </> : <>
          <div className="card"><span>My annual leave left</span><strong>{annual ? (annual.remaining ?? '∞') : '—'}</strong><small><Link href="/leave">Request leave</Link></small></div>
          <div className="card"><span>{isManager ? 'My team on leave today' : 'On leave today'}</span><strong>{d.onLeave.length}</strong><small>Approved leave</small></div>
          {isManager && <div className="card"><span>Team leave awaiting me</span><strong>{d.pending}</strong><small><Link href="/leave-requests">Open requests</Link></small></div>}
        </>}
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        {wide ? (
          <div className="panel"><h2>Headcount by department</h2>
            {deptRows.length === 0 ? <p className="empty">No active employees yet. <Link href="/employees">Add the first one</Link>.</p> : deptRows.map(([n, c]) => (
              <div className="hbar" key={n}><span className="lab">{n}</span><div className="track"><span style={{ width: `${(c / maxDept) * 100}%` }} /></div><b>{c}</b></div>))}
          </div>
        ) : (
          <div className="panel"><h2>My leave balances</h2>
            {d.bal.length === 0 ? <p className="empty">No leave information yet.</p> : d.bal.map((b: any) => (
              <div className="row" key={b.leave_type_id}><span>{b.name}</span><b>{b.remaining ?? '∞'} left</b></div>))}
          </div>
        )}
        <div className="panel"><h2>Birthdays and work anniversaries <span className="muted" style={{ fontWeight: 400 }}>(next 30 days)</span></h2>
          {d.celeb.length === 0 ? <p className="empty">Nothing in the next 30 days.</p> : d.celeb.slice(0, 8).map((c: any) => (
            <div className="row" key={c.employee_id + c.kind}>
              <span><strong>{c.employee_name}</strong><br /><span className="muted">{c.kind === 'birthday' ? 'Birthday' : `${c.years} year${c.years === 1 ? '' : 's'} at Terraviva`}{c.department ? ` · ${c.department}` : ''}</span></span>
              <span className={c.event_date === t ? 'status active' : 'muted'}>{c.event_date === t ? 'Today' : fmtDate(c.event_date)}</span>
            </div>))}
        </div>
      </div>

      <div className="split" style={{ marginTop: 18 }}>
        <div className="panel"><h2>Away today <Link href="/calendar" style={{ fontSize: 12, fontWeight: 400 }}>Team calendar</Link></h2>
          {d.onLeave.length === 0 ? <p className="empty">Nobody is on approved leave today.</p> : d.onLeave.map((r: any) => (
            <div className="row" key={r.id}><span>{fullName(r.employees)}</span><span className="muted">{r.leave_types?.name} · back after {fmtDate(r.end_date)}</span></div>))}
        </div>
        <div className="panel"><h2>Upcoming public holidays</h2>
          {d.holidays.length === 0 ? <p className="empty">None in the calendar.</p> : d.holidays.map((h: any) => (
            <div className="row" key={h.holiday_date}><span>{h.name}</span><span className="muted">{fmtDate(h.holiday_date)}</span></div>))}
        </div>
      </div>

      {(wide || showDocs) && (
        <div className="split" style={{ marginTop: 18 }}>
          {wide && <div className="panel"><h2>Contracts ending soon</h2>
            {d.contracts.length === 0 ? <p className="empty">No active contracts end in the next 60 days.</p> : d.contracts.map((c: any) => (
              <div className="row" key={c.id}><span><Link href={`/employees/${c.employees?.id}`}>{fullName(c.employees)}</Link><br /><span className="muted">{pretty(c.contract_type)}</span></span>
                <span className={c.end_date < inDays(14) ? 'status rejected' : 'status pending'}>{fmtDate(c.end_date)}</span></div>))}
          </div>}
          {showDocs && <div className="panel"><h2>Documents expiring <span className="muted" style={{ fontWeight: 400 }}>(next 60 days)</span></h2>
            {d.docs.length === 0 ? <p className="empty">No documents expire in the next 60 days.</p> : d.docs.map((x: any) => (
              <div className="row" key={x.id}><span><Link href={`/employees/${x.employees?.id}`}>{fullName(x.employees)}</Link><br /><span className="muted">{x.name} · {pretty(x.category)}</span></span>
                <span className={x.expires_on < t ? 'status rejected' : x.expires_on < inDays(14) ? 'status rejected' : 'status pending'}>{x.expires_on < t ? `Expired ${fmtDate(x.expires_on)}` : fmtDate(x.expires_on)}</span></div>))}
          </div>}
        </div>
      )}
    </div>
  )
}
