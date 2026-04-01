import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function getProfile() {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function updateProfile(body: Record<string, unknown>) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function uploadResume(file: File, label?: string) {
  const headers = await authHeaders()
  const form = new FormData()
  form.append('resume', file)
  if (label) form.append('label', label)
  const res = await fetch(`${API_URL}/profile/resume`, {
    method: 'POST',
    headers,
    body: form,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function previewResumeVersion(versionId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile/resume/preview`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_id: versionId }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteResumeVersion(versionId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile/resume/${versionId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
