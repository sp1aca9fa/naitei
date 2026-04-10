import { supabase } from './supabase'

const API_URL = import.meta.env.VITE_API_URL

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function throwError(res: Response): Promise<never> {
  if (res.status === 429) {
    const resetHeader = res.headers.get('RateLimit-Reset')
    const resetTime = resetHeader
      ? new Date(parseInt(resetHeader) * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : null
    throw new Error(resetTime ? `Rate limit reached. Try again after ${resetTime}.` : 'Rate limit reached. Try again later.')
  }
  const text = await res.text()
  try { throw new Error(JSON.parse(text).error ?? text) } catch (e) {
    if (e instanceof Error && e.message !== text) throw e
    throw new Error(text)
  }
}

export async function getProfile() {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function updateProfile(body: Record<string, unknown>) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwError(res)
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
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function previewResumeVersion(versionId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile/resume/preview`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ version_id: versionId }),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function updateResumeVersion(versionId: string, data: { skills_matrix?: { name: string; level: number }[]; cv_analysis?: string; key_strengths?: string[]; focus_skills?: string[] }) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile/resume/${versionId}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function deleteResumeVersion(versionId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/profile/resume/${versionId}`, {
    method: 'DELETE',
    headers,
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function searchCompanies(q: string): Promise<{ id: string; name: string; research: unknown }[]> {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/company/search?q=${encodeURIComponent(q)}`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function importUrlJob(url: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/url`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
  if (!res.ok) await throwError(res)
  return res.json() as Promise<{ description?: string; title?: string; company?: string; postedAt?: string; fallback?: boolean; reason?: string }>
}

export async function updateJob(id: string, body: { url?: string; posted_at?: string | null }) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function importPasteJob(body: { description: string; title?: string; company?: string; url?: string; posted_at?: string }) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/paste`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function importAdzuna(): Promise<{ imported: number; failed?: number; filtered?: number; already_imported: number; remaining: number; total: number }> {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/adzuna`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function importRemotive(): Promise<{ imported: number; failed?: number; filtered?: number; already_imported: number; remaining: number; total: number }> {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/remotive`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function importRemoteOk(): Promise<{ imported: number; failed?: number; filtered?: number; already_imported: number; remaining: number; total: number }> {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/import/remoteok`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function getJobs() {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function deleteJob(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}`, { method: 'DELETE', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function getJob(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function rescoreJob(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/jobs/${id}/rescore`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function saveApplication(jobId: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function getApplications() {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function generateInterviewPrep(id: string, force = false) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications/${id}/interview-prep${force ? '?force=true' : ''}`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function generateCoverLetter(id: string, force = false) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications/${id}/cover-letter${force ? '?force=true' : ''}`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function getApplication(id: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications/${id}`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function generateResumeOptimization(id: string, force = false) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications/${id}/resume-optimization${force ? '?force=true' : ''}`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function generateApplyChecklist(id: string, force = false) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications/${id}/apply-checklist${force ? '?force=true' : ''}`, { method: 'POST', headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function getInsights(): Promise<{
  skillGaps: { skill: string; frequency: number; avg_score: number; impact: number; jobs: { id: string; title: string; company: string | null; ai_score: number }[] }[]
  demandedSkills: { skill: string; frequency: number }[]
  scoreDistribution: { label: string; count: number; jobs: { id: string; title: string; company: string | null; ai_score: number }[] }[]
  topCompanies: { company: string; count: number; avg_score: number; jobs: { id: string; title: string; ai_score: number }[] }[]
}> {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/insights`, { headers })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function updateApplication(id: string, fields: Record<string, unknown>) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/applications/${id}`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(fields),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}

export async function researchCompany(companyName: string, jobTitle?: string) {
  const headers = await authHeaders()
  const res = await fetch(`${API_URL}/company/research`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_name: companyName, job_title: jobTitle }),
  })
  if (!res.ok) await throwError(res)
  return res.json()
}
