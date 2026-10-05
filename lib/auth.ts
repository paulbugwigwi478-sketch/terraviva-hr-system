import { createClient } from '@/lib/supabase'

export async function getCurrentUser() {
  const supabase = createClient()
  const { data } = await supabase.auth.getUser()
  return data.user
}

export async function getCurrentProfile() {
  const supabase = createClient()
  const { data: auth } = await supabase.auth.getUser()
  if (!auth.user) return null
  const { data } = await supabase.from('profiles').select('*').eq('id', auth.user.id).maybeSingle()
  return data
}
