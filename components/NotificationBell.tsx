'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Bell } from 'lucide-react'
import { createClient } from '@/lib/supabase'

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m} min ago`
  if (m < 1440) return `${Math.round(m / 60)} h ago`
  return `${Math.round(m / 1440)} d ago`
}

export default function NotificationBell() {
  const router = useRouter()
  const [items, setItems] = useState<any[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const { data } = await createClient().from('notifications').select('*').order('created_at', { ascending: false }).limit(15)
    setItems(data ?? [])
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  useEffect(() => {
    function outside(e: MouseEvent) { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  const unread = items.filter(i => !i.read_at).length

  async function openItem(n: any) {
    if (!n.read_at) await createClient().from('notifications').update({ read_at: new Date().toISOString() }).eq('id', n.id)
    setOpen(false)
    load()
    if (n.link) router.push(n.link)
  }
  async function markAll() {
    await createClient().from('notifications').update({ read_at: new Date().toISOString() }).is('read_at', null)
    load()
  }

  return (
    <div ref={box} style={{ position: 'relative' }}>
      <button className="mini" onClick={() => { setOpen(o => !o); if (!open) load() }} aria-label="Notifications" title="Notifications" style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Bell size={14} />
        {unread > 0 && <span style={{ position: 'absolute', top: -6, right: -6, background: '#b3261e', color: '#fff', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 16, textAlign: 'center' }}>{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', width: 340, maxHeight: 400, overflowY: 'auto', background: '#fff', border: '1px solid var(--line)', borderRadius: 12, boxShadow: '0 12px 32px rgba(8,40,42,.18)', zIndex: 50 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--line)' }}>
            <strong style={{ fontSize: 13 }}>Notifications</strong>
            {unread > 0 && <button className="mini" onClick={markAll}>Mark all as read</button>}
          </div>
          {items.length === 0 ? <p className="empty">Nothing yet.</p> : items.map(n => (
            <button key={n.id} onClick={() => openItem(n)} style={{ display: 'block', width: '100%', textAlign: 'left', border: 0, borderBottom: '1px solid var(--line)', background: n.read_at ? '#fff' : '#f0f8f7', padding: '10px 14px', cursor: 'pointer' }}>
              <div style={{ fontSize: 13, fontWeight: n.read_at ? 500 : 700 }}>{n.title}</div>
              {n.body && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{n.body}</div>}
              <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{ago(n.created_at)}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
