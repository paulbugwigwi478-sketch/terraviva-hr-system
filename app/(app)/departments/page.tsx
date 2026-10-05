'use client'
import CrudPage from '@/components/CrudPage'

const fields = [
  { name: 'name', label: 'Department name', required: true },
  { name: 'description', label: 'Description', type: 'textarea' as const },
]
const columns = [
  { label: 'Department', render: (r: any) => <strong>{r.name}</strong> },
  { label: 'Description', render: (r: any) => r.description ?? '—' },
]

export default function DepartmentsPage() {
  return <CrudPage table="departments" title="Departments" subtitle="The teams and units of Terraviva." noun="Department"
    fields={fields} columns={columns} writeRoles={['hr_admin']} orderBy="name" />
}
