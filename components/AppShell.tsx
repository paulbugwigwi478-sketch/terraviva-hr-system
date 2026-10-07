'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Banknote, Briefcase, Building2, Calendar, CalendarDays, Check, Clock, FileText, GraduationCap, History, LayoutDashboard, LogOut, Receipt, Settings, Shield, Target, User, UserPlus, Users, Wallet } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ORG_VIEWERS, ROLE_LABELS, can, type Role } from '@/lib/roles'
import { LogoMark } from '@/components/Logo'
import Avatar from '@/components/Avatar'
import NotificationBell from '@/components/NotificationBell'
import { FEATURES } from '@/lib/features'

export type Profile = { id: string; organization_id: string | null; full_name: string | null; role: Role; is_active: boolean; employee_id: string | null }
export type Org = { id: string; name: string; legal_name: string | null }
type Ctx = { profile: Profile; org: Org; isManager: boolean; photoPath: string | null }

const AppContext = createContext<Ctx | null>(null)
export function useApp(): Ctx {
  const c = useContext(AppContext)
  if (!c) throw new Error('useApp must be used inside AppShell')
  return c
}

type Item = { href: string; label: string; icon: ReactNode; group: string; show: (c: Ctx) => boolean }

const NAV = (c: Ctx): Item[] => [
  { href: '/', label: 'Dashboard', icon: <LayoutDashboard size={16} />, group: 'OVERVIEW', show: () => true },
  { href: c.profile.employee_id ? `/employees/${c.profile.employee_id}` : '/me', label: 'My profile', icon: <User size={16} />, group: 'ME', show: () => true },
  { href: '/leave', label: 'My leave', icon: <CalendarDays size={16} />, group: 'ME', show: () => true },
  { href: '/attendance', label: 'Attendance', icon: <Clock size={16} />, group: 'WORK', show: x => FEATURES.attendance && !!x.profile.employee_id },
  { href: '/performance', label: 'Performance', icon: <Target size={16} />, group: 'WORK', show: x => FEATURES.performance && (!!x.profile.employee_id || can(x.profile.role, ['hr_admin', 'director'])) },
  { href: '/training', label: 'Training', icon: <GraduationCap size={16} />, group: 'WORK', show: x => FEATURES.training && (!!x.profile.employee_id || can(x.profile.role, ['hr_admin', 'director'])) },
  { href: '/payslips', label: 'My payslips', icon: <Receipt size={16} />, group: 'ME', show: x => !!x.profile.employee_id },
  { href: '/calendar', label: 'Team calendar', icon: <Calendar size={16} />, group: 'PEOPLE', show: () => true },
  { href: '/leave-requests', label: 'Leave requests', icon: <Check size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ['hr_admin', 'director', 'auditor']) || x.isManager },
  { href: '/employees', label: 'Employees', icon: <Users size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ORG_VIEWERS) || x.isManager },
  { href: '/recruitment', label: 'Recruitment', icon: <UserPlus size={16} />, group: 'PEOPLE', show: x => FEATURES.recruitment && can(x.profile.role, ['hr_admin', 'director']) },
  { href: '/departments', label: 'Departments', icon: <Building2 size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ORG_VIEWERS) },
  { href: '/positions', label: 'Positions', icon: <Briefcase size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ORG_VIEWERS) },
  { href: '/payroll', label: 'Payroll', icon: <Wallet size={16} />, group: 'PAYROLL', show: x => can(x.profile.role, ['hr_admin', 'director']) },
  { href: '/pay-items', label: 'Allowances & deductions', icon: <Banknote size={16} />, group: 'PAYROLL', show: x => can(x.profile.role, ['hr_admin', 'director']) },
  { href: '/payroll-settings', label: 'Payroll settings', icon: <Settings size={16} />, group: 'PAYROLL', show: x => can(x.profile.role, ['hr_admin']) },
  { href: '/reports', label: 'Reports', icon: <FileText size={16} />, group: 'ADMIN', show: x => can(x.profile.role, ORG_VIEWERS) },
  { href: '/audit', label: 'Audit log', icon: <History size={16} />, group: 'ADMIN', show: x => can(x.profile.role, ORG_VIEWERS) },
  { href: '/holidays', label: 'Holidays', icon: <CalendarDays size={16} />, group: 'ADMIN', show: x => can(x.profile.role, ['hr_admin']) },
  { href: '/leave-types', label: 'Leave types', icon: <Settings size={16} />, group: 'ADMIN', show: x => can(x.profile.role, ['hr_admin']) },
  { href: '/users', label: 'Users & roles', icon: <Shield size={16} />, group: 'ADMIN', show: x => can(x.profile.role, ['hr_admin']) },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [ctx, setCtx] = useState<Ctx | null>(null)

  const boot = useCallback(async () => {
    const sb = createClient()
    const { data: auth } = await sb.auth.getUser()
    if (!auth.user) { router.replace('/login'); return }
    const { data: p } = await sb.from('profiles').select('*').eq('id', auth.user.id).maybeSingle()
    if (!p || !p.organization_id || !p.is_active) { router.replace('/pending'); return }
    const { data: org } = await sb.from('organizations').select('id,name,legal_name').eq('id', p.organization_id).maybeSingle()
    let isManager = false
    let photoPath: string | null = null
    if (p.employee_id) {
      const { count } = await sb.from('employees').select('id', { count: 'exact', head: true }).eq('manager_id', p.employee_id)
      isManager = (count ?? 0) > 0
      const { data: me } = await sb.from('employees').select('photo_path').eq('id', p.employee_id).maybeSingle()
      photoPath = me?.photo_path ?? null
    }
    setCtx({ profile: p as Profile, org: (org ?? { id: p.organization_id, name: 'Terraviva', legal_name: null }) as Org, isManager, photoPath })
  }, [router])
  useEffect(() => { boot() }, [boot])

  async function signOut() {
    await createClient().auth.signOut()
    window.location.href = '/login'
  }

  if (!ctx) return <div className="boot"><LogoMark size={64} /><p className="muted">Loading Terraviva HR…</p></div>

  const { profile, org } = ctx
  const items = NAV(ctx).filter(i => i.show(ctx))
  const groups = Array.from(new Set(items.map(i => i.group)))
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href))

  return (
    <AppContext.Provider value={ctx}>
      <div className="app">
        <aside className="sidebar">
          <div className="brand">
            <LogoMark size={44} />
            <div><div className="brand-name">TERRAVIVA</div><div className="brand-sub">HR System</div></div>
          </div>
          <nav>
            {groups.map(g => (
              <div key={g}>
                <div className="nav-section">{g}</div>
                {items.filter(i => i.group === g).map(i => (
                  <Link key={i.href + i.label} href={i.href} className={`nav-item${isActive(i.href) ? ' active' : ''}`}>{i.icon}<span>{i.label}</span></Link>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="main">
          <div className="topbar">
            <div className="title"><p>{org.name} · Human Resources</p></div>
            <div className="user">
              <NotificationBell />
              <Avatar path={ctx.photoPath} name={profile.full_name || 'User'} size={34} />
              <div><strong>{profile.full_name}</strong><br /><span className="muted" style={{ fontSize: 11 }}>{ROLE_LABELS[profile.role]}</span></div>
              <Link href="/reset-password" className="mini" title="Change password" style={{ marginLeft: 6 }}>Password</Link>
              <button className="mini" onClick={signOut} title="Sign out"><LogOut size={12} /></button>
            </div>
          </div>
          <div className="mobile-nav">
            <select value={items.find(i => isActive(i.href))?.href ?? '/'} onChange={e => router.push(e.target.value)}>
              {items.map(i => <option key={i.href + i.label} value={i.href}>{i.label}</option>)}
            </select>
          </div>
          {children}
        </main>
      </div>
    </AppContext.Provider>
  )
}
