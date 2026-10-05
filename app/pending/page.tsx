'use client'

import { createClient } from '@/lib/supabase'
import { LogoFull } from '@/components/Logo'

export default function PendingPage() {
  async function signOut() {
    await createClient().auth.signOut()
    window.location.href = '/login'
  }
  return (
    <main className="login-shell">
      <section className="login-card">
        <LogoFull width={190} />
        <h1 style={{ textAlign: 'center' }}>Access pending</h1>
        <p className="muted">Your account is confirmed but has not been given access to the Terraviva HR system yet. Ask HR to invite your email address, then sign in again.</p>
        <button className="primary" onClick={signOut}>Sign out</button>
      </section>
    </main>
  )
}
