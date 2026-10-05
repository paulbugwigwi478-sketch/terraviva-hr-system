'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LogoFull } from '@/components/Logo'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function signIn(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password })
      if (error) throw error
      window.location.href = '/'
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <LogoFull width={190} />
        <h1 style={{ textAlign: 'center' }}>HR System</h1>
        <p className="muted" style={{ textAlign: 'center' }}>Sign in to your Terraviva employee records, leave and HR services.</p>
        <form onSubmit={signIn}>
          <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
          <label>Password<input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="current-password" /></label>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>First time? <Link href="/signup">Create your account</Link> (use the email you were invited with).</p>
      </section>
    </main>
  )
}
