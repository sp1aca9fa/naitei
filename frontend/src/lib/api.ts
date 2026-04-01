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

export async function searchCompanies(q: string): Promise<{ id: string; name: string; research: unknown }[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/company/search?q=${encodeURIComponent(q)}`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function importUrlJob(url: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/url`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json() as Promise<{ description?: string; title?: string; company?: string; fallback?: boolean; reason?: string }>
}

export async function importPasteJob(body: { description: string; title?: string; company?: string }) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/paste`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getJobs() {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function deleteJob(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function getJob(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}`, { headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function rescoreJob(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}/rescore`, { method: 'POST', headers })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function saveApplication(jobId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function researchCompany(companyName: string, jobTitle?: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/company/research`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName, job_title: jobTitle }),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
