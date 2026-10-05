'use client'
import CrudPage from '@/components/CrudPage'
import { pretty } from '@/lib/format'

const fields = [
  { name: 'name', label: 'Leave type', required: true },
  { name: 'code', label: 'Short code (e.g. ANNUAL)', required: true },
  { name: 'default_days', label: 'Days per year (empty = no limit)', type: 'number' as const },
  { name: 'gender_restriction', label: 'Only for', type: 'select' as const, options: [{ value: 'female', label: 'Female employees' }, { value: 'male', label: 'Male employees' }] },
  { name: 'paid', label: 'Paid leave', type: 'checkbox' as const },
  { name: 'is_active', label: 'Active', type: 'checkbox' as const },
]
const columns = [
  { label: 'Leave type', render: (r: any) => <><strong>{r.name}</strong><br /><span className="muted">{r.code}</span></> },
  { label: 'Days per year', num: true, render: (r: any) => r.default_days ?? 'No limit' },
  { label: 'For', render: (r: any) => (r.gender_restriction ? pretty(r.gender_restriction) : 'Everyone') },
  { label: 'Paid', render: (r: any) => (r.paid ? 'Yes' : 'No') },
  { label: 'Status', render: (r: any) => <span className={`status ${r.is_active ? 'active' : 'closed'}`}>{r.is_active ? 'Active' : 'Inactive'}</span> },
]

export default function LeaveTypesPage() {
  return <CrudPage table="leave_types" title="Leave types" subtitle="Entitlements per year. Check these against Terraviva's HR policy and the Employment and Labour Relations Act." noun="Leave type"
    fields={fields} columns={columns} writeRoles={['hr_admin']} orderBy="name" />
}
