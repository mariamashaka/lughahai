// =============================================
// LUGHA HAI — Supabase client
// =============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'

const SUPABASE_URL  = 'https://geogbanccumdcaymhkdb.supabase.co'
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imdlb2diYW5jY3VtZGNheW1oa2RiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MDk4MjgsImV4cCI6MjA5MTk4NTgyOH0.BL1np5CpfddNE_S7x_bmHBqTHG-L7xn8PE5Jk3XIUx0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON)

// ── AUTH HELPERS ──────────────────────────────

export async function getUser() {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

export async function getUserRoles(userId) {
  const { data } = await supabase
    .from('user_roles')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'approved')
  return data || []
}

export async function hasRole(userId, role, languageId) {
  const roles = await getUserRoles(userId)
  // Check global admin
  if (roles.some(r => r.role === 'admin' && r.language_id === '*')) return true
  // Check specific role for language
  if (languageId) {
    return roles.some(r => r.role === role && r.language_id === languageId)
  }
  return roles.some(r => r.role === role)
}

export async function signUp(email, password, fullName, phone) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName, phone: phone || null } }
  })
  return { data, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

// ── SUBMISSION HELPERS ────────────────────────

export async function getOrCreateSubmission(userId, languageId, topicId) {
  // Try to get existing
  const { data: existing } = await supabase
    .from('submissions')
    .select('*')
    .eq('user_id', userId)
    .eq('language_id', languageId)
    .eq('topic_id', topicId)
    .single()

  if (existing) return existing

  // Create new
  const { data, error } = await supabase
    .from('submissions')
    .insert({ user_id: userId, language_id: languageId, topic_id: topicId })
    .select()
    .single()

  if (error) console.error('Error creating submission:', error)
  return data
}

export async function savePhraseResponse(submissionId, phraseId, translation, audioUrl, isDone) {
  const { data, error } = await supabase
    .from('phrase_responses')
    .upsert({
      submission_id: submissionId,
      phrase_id:     phraseId,
      translation:   translation || null,
      audio_url:     audioUrl || null,
      is_done:       isDone || false,
      updated_at:    new Date().toISOString()
    }, { onConflict: 'submission_id,phrase_id' })
    .select()
    .single()

  if (error) console.error('Error saving phrase:', error)
  return data
}

export async function getPhraseResponses(submissionId) {
  const { data } = await supabase
    .from('phrase_responses')
    .select('*')
    .eq('submission_id', submissionId)
  return data || []
}

export async function updateSubmissionStatus(submissionId, status) {
  const { error } = await supabase
    .from('submissions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', submissionId)
  if (error) console.error('Error updating submission:', error)
}
