/* eslint-disable @next/next/no-img-element */
'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

const cache = new Map<string, { url: string; at: number }>()

function usePhotoUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!path) { setUrl(null); return }
    const hit = cache.get(path)
    if (hit && Date.now() - hit.at < 50 * 60 * 1000) { setUrl(hit.url); return }
    createClient().storage.from('employee-photos').createSignedUrl(path, 3600).then(({ data }) => {
      if (!alive || !data) return
      cache.set(path, { url: data.signedUrl, at: Date.now() })
      setUrl(data.signedUrl)
    })
    return () => { alive = false }
  }, [path])
  return url
}

export default function Avatar({ path, name, size = 40 }: { path?: string | null; name: string; size?: number }) {
  const url = usePhotoUrl(path)
  const initials = name.split(' ').filter(Boolean).map(s => s[0]).slice(0, 2).join('').toUpperCase() || '?'
  const box = { width: size, height: size, borderRadius: '50%', flex: 'none' as const }
  if (url) return <img src={url} alt={name} style={{ ...box, objectFit: 'cover', display: 'block' }} />
  return (
    <div style={{ ...box, background: 'var(--teal)', color: '#fff', display: 'grid', placeContent: 'center', fontWeight: 700, fontSize: Math.round(size * 0.36) }}>
      {initials}
    </div>
  )
}
