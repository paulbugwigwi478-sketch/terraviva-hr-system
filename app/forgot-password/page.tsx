'use client'

import Link from 'next/link'
import { FormEvent, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LogoFull } from '@/components/Logo'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(event: FormEvent) {
    event.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await createClient().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    })
    setLoading(false)
    if (error) setError(error.message)
    else setSent(true)
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <LogoFull width={190} />
        <h1 style={{ textAlign: 'center' }}>Forgot password</h1>
        {sent ? (
          <p className="success">If an account exists for that email, a reset link is on its way. Open it in the <strong>same browser</strong> you used here. Check your Spam folder if you do not see it.</p>
        ) : (
          <>
            <p className="muted" style={{ textAlign: 'center' }}>Enter your email and we will send you a link to choose a new password.</p>
            <form onSubmit={submit}>
              <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" /></label>
              {error && <p className="error">{error}</p>}
              <button className="primary" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
            </form>
          </>
        )}
        <p className="muted" style={{ marginTop: 16 }}><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  )
}
