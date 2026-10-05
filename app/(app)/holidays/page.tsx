'use client'
import CrudPage from '@/components/CrudPage'
import { fmtDate } from '@/lib/format'

const fields = [
  { name: 'holiday_date', label: 'Date', type: 'date' as const, required: true },
  { name: 'name', label: 'Holiday name', required: true },
]
const columns = [
  { label: 'Date', render: (r: any) => <strong>{fmtDate(r.holiday_date)}</strong> },
  { label: 'Holiday', render: (r: any) => r.name },
]

export default function HolidaysPage() {
  return <CrudPage table="holidays" title="Public holidays" subtitle="These days are not counted as leave days. Add moveable holidays (such as Eid) each year." noun="Holiday"
    fields={fields} columns={columns} writeRoles={['hr_admin']} orderBy="holiday_date" />
}
