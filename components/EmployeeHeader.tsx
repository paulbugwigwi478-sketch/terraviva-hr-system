'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import Avatar from '@/components/Avatar'
import { resizeToSquare } from '@/lib/image'
import { errMsg, fullName, pretty } from '@/lib/format'

export default function EmployeeHeader({ emp, orgId, isHr, setMsg, reload }: any) {
  const [busy, setBusy] = useState(false)
  const name = fullName(emp)

  async function pick(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) { setMsg({ kind: 'error', text: 'Please choose a picture (JPG, PNG or WebP).' }); return }
    setBusy(true); setMsg(null)
    try {
      const blob = await resizeToSquare(file, 512)
      const sb = createClient()
      const path = `${orgId}/${emp.id}/${Date.now()}.jpg`
      const up = await sb.storage.from('employee-photos').upload(path, blob, { contentType: 'image/jpeg' })
      if (up.error) throw up.error
      const { error } = await sb.from('employees').update({ photo_path: path }).eq('id', emp.id)
      if (error) { await sb.storage.from('employee-photos').remove([path]); throw error }
      if (emp.photo_path) await sb.storage.from('employee-photos').remove([emp.photo_path])
      setMsg({ kind: 'success', text: 'Photo updated.' })
      reload()
    } catch (e) {
      setMsg({ kind: 'error', text: errMsg(e) })
    }
    setBusy(false)
  }

  async function removePhoto() {
    if (!window.confirm('Remove this photo?')) return
    const sb = createClient()
    const { error } = await sb.from('employees').update({ photo_path: null }).eq('id', emp.id)
    if (error) { setMsg({ kind: 'error', text: error.message }); return }
    if (emp.photo_path) await sb.storage.from('employee-photos').remove([emp.photo_path])
    setMsg({ kind: 'success', text: 'Photo removed.' })
    reload()
  }

  return (
    <div className="profile-head">
      <Avatar path={emp.photo_path} name={name} size={84} />
      <div>
        <h1 style={{ margin: 0, fontSize: 23 }}>{name}</h1>
        <p className="muted">
          {emp.employee_no} · {emp.positions?.title ?? 'No position'} · {emp.departments?.name ?? 'No department'} · <span className={`status ${emp.status}`}>{pretty(emp.status)}</span>
        </p>
        {isHr && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <label className="mini" style={{ cursor: 'pointer' }}>
              {busy ? 'Uploading…' : emp.photo_path ? 'Change photo' : 'Add photo'}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden disabled={busy} onChange={e => { pick(e.target.files); e.target.value = '' }} />
            </label>
            {emp.photo_path && <button className="mini danger" onClick={removePhoto}>Remove photo</button>}
          </div>
        )}
      </div>
    </div>
  )
}
