'use client'
import CrudPage from '@/components/CrudPage'

const fields = [
  { name: 'title', label: 'Job title', required: true },
  { name: 'department_id', label: 'Department', lookup: { table: 'departments', label: 'name' } },
  { name: 'description', label: 'Description', type: 'textarea' as const },
]
const columns = [
  { label: 'Job title', render: (r: any) => <strong>{r.title}</strong> },
  { label: 'Description', render: (r: any) => r.description ?? '—' },
]

export default function PositionsPage() {
  return <CrudPage table="positions" title="Positions" subtitle="Job titles used on employee records." noun="Position"
    fields={fields} columns={columns} writeRoles={['hr_admin']} orderBy="title" />
}
