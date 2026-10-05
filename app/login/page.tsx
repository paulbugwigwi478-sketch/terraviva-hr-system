'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LogoFull } from '@/components/Logo'
import PasswordInput from '@/components/PasswordInput'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('error')) {
      setError('That link is invalid or has expired. Please sign in, or request a new link.')
    }
  }, [])

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
          <label>Password<PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></label>
          <div style={{ textAlign: 'right', marginTop: -6 }}><Link href="/forgot-password" style={{ fontSize: 12 }}>Forgot password?</Link></div>
          {error && <p className="error">{error}</p>}
          <button className="primary" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
        <p className="muted" style={{ marginTop: 16 }}>First time? <Link href="/signup">Create your account</Link> (use the email you were invited with).</p>
      </section>
    </main>
  )
}
