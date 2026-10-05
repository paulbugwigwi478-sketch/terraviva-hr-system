'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { Briefcase, Building2, CalendarDays, Check, FileText, History, LayoutDashboard, LogOut, Settings, Shield, User, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase'
import { ORG_VIEWERS, ROLE_LABELS, can, type Role } from '@/lib/roles'
import { LogoMark } from '@/components/Logo'

export type Profile = { id: string; organization_id: string | null; full_name: string | null; role: Role; is_active: boolean; employee_id: string | null }
export type Org = { id: string; name: string; legal_name: string | null }
type Ctx = { profile: Profile; org: Org; isManager: boolean }

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
  { href: '/leave-requests', label: 'Leave requests', icon: <Check size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ['hr_admin', 'director', 'auditor']) || x.isManager },
  { href: '/employees', label: 'Employees', icon: <Users size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ORG_VIEWERS) || x.isManager },
  { href: '/departments', label: 'Departments', icon: <Building2 size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ORG_VIEWERS) },
  { href: '/positions', label: 'Positions', icon: <Briefcase size={16} />, group: 'PEOPLE', show: x => can(x.profile.role, ORG_VIEWERS) },
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
    if (p.employee_id) {
      const { count } = await sb.from('employees').select('id', { count: 'exact', head: true }).eq('manager_id', p.employee_id)
      isManager = (count ?? 0) > 0
    }
    setCtx({ profile: p as Profile, org: (org ?? { id: p.organization_id, name: 'Terraviva', legal_name: null }) as Org, isManager })
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
  const initials = (profile.full_name || 'U').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

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
              <div className="avatar">{initials}</div>
              <div><strong>{profile.full_name}</strong><br /><span className="muted" style={{ fontSize: 11 }}>{ROLE_LABELS[profile.role]}</span></div>
              <button className="mini" onClick={signOut} title="Sign out" style={{ marginLeft: 6 }}><LogOut size={12} /></button>
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
