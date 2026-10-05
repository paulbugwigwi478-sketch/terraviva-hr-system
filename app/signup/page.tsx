'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LogoFull } from '@/components/Logo'

export default function SignupPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  async function signUp(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await createClient().auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: fullName.trim() }, emailRedirectTo: `${window.location.origin}/auth/callback` },
    })
    if (error) setError(error.message)
    else setDone(true)
    setLoading(false)
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <LogoFull width={190} />
        <h1 style={{ textAlign: 'center' }}>Create account</h1>
        {done ? (
          <p className="success">Check your email and click the confirmation link. After confirming you will be signed in. Access is granted only to invited email addresses.</p>
        ) : (
          <form onSubmit={signUp}>
            <label>Full name<input value={fullName} onChange={e => setFullName(e.target.value)} required /></label>
            <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
            <label>Password (min 8 characters)<input type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" /></label>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={loading}>{loading ? 'Creating…' : 'Create account'}</button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 16 }}><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  )
}
