'use client'

import Link from 'next/link'
import { FormEvent, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { LogoFull } from '@/components/Logo'
import PasswordInput from '@/components/PasswordInput'

export default function ResetPasswordPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    createClient().auth.getUser().then(({ data }) => setSignedIn(!!data.user))
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setLoading(true)
    const { error } = await createClient().auth.updateUser({ password })
    setLoading(false)
    if (error) setError(error.message)
    else setDone(true)
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <LogoFull width={190} />
        <h1 style={{ textAlign: 'center' }}>Choose a new password</h1>
        {signedIn === null ? (
          <p className="muted" style={{ textAlign: 'center' }}>Checking your link…</p>
        ) : !signedIn ? (
          <p className="error">This link is invalid or has expired. <Link href="/forgot-password">Request a new one</Link>.</p>
        ) : done ? (
          <>
            <p className="success">Your password has been changed.</p>
            <p style={{ marginTop: 16 }}><Link href="/">Continue to the system</Link></p>
          </>
        ) : (
          <form onSubmit={submit}>
            <label>New password (min 8 characters)<PasswordInput value={password} onChange={setPassword} minLength={8} autoComplete="new-password" /></label>
            <label>Confirm new password<PasswordInput value={confirm} onChange={setConfirm} minLength={8} autoComplete="new-password" /></label>
            {error && <p className="error">{error}</p>}
            <button className="primary" disabled={loading}>{loading ? 'Saving…' : 'Change password'}</button>
          </form>
        )}
        <p className="muted" style={{ marginTop: 16 }}><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  )
}
