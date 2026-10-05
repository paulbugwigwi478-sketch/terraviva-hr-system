'use client'

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase'
import { useApp } from '@/components/AppShell'
import { can, type Role } from '@/lib/roles'
import { errMsg } from '@/lib/format'

export type Field = {
  name: string
  label: string
  type?: 'text' | 'number' | 'date' | 'email' | 'select' | 'textarea' | 'checkbox'
  options?: { value: string; label: string }[]
  lookup?: { table: string; value?: string; label: string }
  required?: boolean
  default?: string | number | boolean
}
export type Column = { label: string; render: (row: any) => ReactNode; num?: boolean }

type Props = {
  table: string
  title: string
  subtitle: string
  noun: string
  fields: Field[]
  columns: Column[]
  writeRoles: Role[]
  orderBy: string
  ascending?: boolean
}

export default function CrudPage({ table, title, subtitle, noun, fields, columns, writeRoles, orderBy, ascending = true }: Props) {
  const { profile, org } = useApp()
  const [rows, setRows] = useState<any[] | null>(null)
  const [lookups, setLookups] = useState<Record<string, { value: string; label: string }[]>>({})
  const [form, setForm] = useState<Record<string, any> | null>(null)
  const [editId, setEditId] = useState<string | null>(null)
  const [msg, setMsg] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const canWrite = can(profile.role, writeRoles)

  const load = useCallback(async () => {
    const sb = createClient()
    const { data, error } = await sb.from(table).select('*').order(orderBy, { ascending })
    if (error) setMsg({ kind: 'error', text: error.message })
    setRows(data ?? [])
    const next: Record<string, { value: string; label: string }[]> = {}
    for (const f of fields) {
      if (!f.lookup) continue
      const { data: l } = await sb.from(f.lookup.table).select('*').order(f.lookup.label)
      next[f.name] = (l ?? []).map((r: any) => ({ value: String(r[f.lookup!.value ?? 'id']), label: String(r[f.lookup!.label]) }))
    }
    setLookups(next)
  }, [table, orderBy, ascending, fields])
  useEffect(() => { load() }, [load])

  const blank = () => Object.fromEntries(fields.map(x => [x.name, x.default ?? (x.type === 'checkbox' ? true : '')]))
  const startNew = () => { setEditId(null); setForm(blank()); setMsg(null) }
  const startEdit = (row: any) => {
    setEditId(row.id)
    setForm(Object.fromEntries(fields.map(x => [x.name, row[x.name] ?? (x.type === 'checkbox' ? false : '')])))
    setMsg(null)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!form) return
    setBusy(true); setMsg(null)
    const payload: Record<string, any> = {}
    for (const x of fields) {
      const v = form[x.name]
      if (x.type === 'checkbox') payload[x.name] = !!v
      else if (x.type === 'number') payload[x.name] = v === '' || v === null ? null : Number(v)
      else payload[x.name] = typeof v === 'string' ? (v.trim() === '' ? null : v.trim()) : v
    }
    const sb = createClient()
    const { error } = editId ? await sb.from(table).update(payload).eq('id', editId) : await sb.from(table).insert({ ...payload, organization_id: org.id })
    setBusy(false)
    if (error) { setMsg({ kind: 'error', text: errMsg(error) }); return }
    setMsg({ kind: 'success', text: editId ? 'Changes saved.' : `${noun} added.` })
    setForm(null); setEditId(null); load()
  }

  async function remove(row: any) {
    if (!window.confirm(`Delete this ${noun.toLowerCase()}? This cannot be undone.`)) return
    const { error } = await createClient().from(table).delete().eq('id', row.id)
    if (error) setMsg({ kind: 'error', text: error.message.includes('foreign key') ? `This ${noun.toLowerCase()} is already in use, so it cannot be deleted.` : error.message })
    else { setMsg({ kind: 'success', text: `${noun} deleted.` }); load() }
  }

  return (
    <div className="module-page">
      <div className="page-head">
        <div><h1>{title}</h1><p className="muted">{subtitle}</p></div>
        {canWrite && !form && <button className="primary" onClick={startNew}>Add {noun.toLowerCase()}</button>}
      </div>
      {msg && <p className={`${msg.kind} msg`}>{msg.text}</p>}

      {form && (
        <form className="form-grid" onSubmit={save}>
          {fields.map(f => (
            <label key={f.name} className={f.type === 'checkbox' ? 'check' : undefined}>
              {f.type === 'checkbox' ? (
                <><input type="checkbox" checked={!!form[f.name]} onChange={e => setForm({ ...form, [f.name]: e.target.checked })} />{f.label}</>
              ) : (
                <>
                  {f.label}{f.required ? ' *' : ''}
                  {f.type === 'select' || f.lookup ? (
                    <select value={form[f.name] ?? ''} required={f.required} onChange={e => setForm({ ...form, [f.name]: e.target.value })}>
                      <option value="">{f.required ? 'Select…' : 'None'}</option>
                      {(f.options ?? lookups[f.name] ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === 'textarea' ? (
                    <textarea rows={2} value={form[f.name] ?? ''} onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
                  ) : (
                    <input type={f.type ?? 'text'} step={f.type === 'number' ? '0.5' : undefined} value={form[f.name] ?? ''} required={f.required}
                      onChange={e => setForm({ ...form, [f.name]: e.target.value })} />
                  )}
                </>
              )}
            </label>
          ))}
          <div className="actions">
            <button className="primary" disabled={busy}>{busy ? 'Saving…' : editId ? 'Save changes' : `Add ${noun.toLowerCase()}`}</button>
            <button type="button" className="mini" style={{ padding: '10px 14px' }} onClick={() => { setForm(null); setEditId(null) }}>Cancel</button>
          </div>
        </form>
      )}

      <div className="panel">
        {rows === null ? <p className="empty">Loading…</p> : rows.length === 0 ? (
          <p className="empty">Nothing here yet.{canWrite ? ` Use “Add ${noun.toLowerCase()}” to create the first one.` : ''}</p>
        ) : (
          <table>
            <thead><tr>{columns.map(c => <th key={c.label} className={c.num ? 'num' : undefined}>{c.label}</th>)}{canWrite && <th />}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id}>
                  {columns.map(c => <td key={c.label} className={c.num ? 'num' : undefined}>{c.render(r)}</td>)}
                  {canWrite && <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="mini" onClick={() => startEdit(r)}>Edit</button>
                    <button className="mini danger" onClick={() => remove(r)}>Delete</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
