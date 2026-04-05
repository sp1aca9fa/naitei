import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getJob, getProfile, saveApplication, rescoreJob, updateJob } from '../lib/api'
import { CompanyResearchCard } from '../components/CompanyResearchCard'

interface AtsDetails {
  ats_score: number
  keyword_matches: string[]
  missing_keywords: string[]
  formatting_issues: string[]
  section_header_issues: string[]
  action_verb_score: number
  improvements: string[]
}

interface Job {
  id: string
  title: string
  company: string | null
  source: string
  scoring_status: string | null
  ai_score: number | null
  ai_score_breakdown: Record<string, number> | null
  ai_summary: string | null
  ai_green_flags: string[] | null
  ai_red_flags: string[] | null
  ai_recommendation: string | null
  ai_recommendation_reason: string | null
  matched_skills: string[] | null
  missing_skills: string[] | null
  salary_assessment: string | null
  application_effort: string | null
  ats_score: number | null
  ats_details: AtsDetails | null
  url: string | null
  posted_at: string | null
  scored_at: string | null
  is_recent: boolean
  description_raw: string | null
  created_at: string
}

const RECOMMENDATION_LABELS: Record<string, { label: string; color: string }> = {
  apply_now: { label: 'Apply Now', color: 'text-green-700 bg-green-50 border-green-200' },
  apply_with_tailoring: { label: 'Apply — Tailor Resume', color: 'text-blue-700 bg-blue-50 border-blue-200' },
  save_for_later: { label: 'Save for Later', color: 'text-yellow-700 bg-yellow-50 border-yellow-200' },
  skip: { label: 'Skip', color: 'text-red-700 bg-red-50 border-red-200' },
}

const EFFORT_LABELS: Record<string, string> = { low: 'Low effort', medium: 'Medium effort', high: 'High effort' }

const RESCORE_DELAY_MS = parseFloat(import.meta.env.VITE_AI_REQUEST_DELAY_HOURS ?? import.meta.env.VITE_RESCORE_DELAY_HOURS ?? '24') * 3600 * 1000

function rescoreAvailableAt(scoredAt: string | null): Date | null {
  if (!scoredAt || RESCORE_DELAY_MS <= 0) return null
  const available = new Date(new Date(scoredAt).getTime() + RESCORE_DELAY_MS)
  return available > new Date() ? available : null
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [job, setJob] = useState<Job | null>(null)
  const [recentThresholdHours, setRecentThresholdHours] = useState(48)
  const [companyCredits, setCompanyCredits] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [rescoring, setRescoring] = useState(false)
  const [rescoreCooldown, setRescoreCooldown] = useState(() => {
    if (!id) return false
    const ts = parseInt(sessionStorage.getItem(`rescore_cooldown_${id}`) ?? '0')
    return Date.now() - ts < 60_000
  })
  const [addingUrl, setAddingUrl] = useState(false)
  const [urlInput, setUrlInput] = useState('')
  const [savingUrl, setSavingUrl] = useState(false)
  const [editingDate, setEditingDate] = useState(false)
  const [dateInput, setDateInput] = useState('')
  const [savingDate, setSavingDate] = useState(false)

  useEffect(() => {
    if (!id) return
    Promise.all([getJob(id), getProfile()])
      .then(([jobData, profile]) => {
        setJob(jobData)
        setRecentThresholdHours(profile.recent_threshold_hours ?? 48)
        setCompanyCredits(profile.company_research_credits ?? 0)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load job'))
      .finally(() => setLoading(false))
  }, [id])

  async function handleRescore() {
    if (!job) return
    setRescoring(true)
    setRescoreCooldown(true)
    sessionStorage.setItem(`rescore_cooldown_${job.id}`, String(Date.now()))
    setError(null)
    try {
      const data = await rescoreJob(job.id)
      setJob(data.job)
      if (data.error) {
        const isTemporary = /overload|high demand|temporary|capacity/i.test(data.error)
        setError(isTemporary ? 'Scoring failed due to high AI demand. Try again in a few minutes.' : `Scoring failed: ${data.error}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Rescore failed')
    } finally {
      setRescoring(false)
      setTimeout(() => {
        setRescoreCooldown(false)
        if (job) sessionStorage.removeItem(`rescore_cooldown_${job.id}`)
      }, 60_000)
    }
  }

  async function handleSaveUrl() {
    if (!job || !urlInput.trim()) return
    setSavingUrl(true)
    try {
      const updated = await updateJob(job.id, { url: urlInput.trim() })
      setJob(updated)
      setAddingUrl(false)
      setUrlInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save URL')
    } finally {
      setSavingUrl(false)
    }
  }

  async function handleSaveDate() {
    if (!job) return
    setSavingDate(true)
    try {
      const updated = await updateJob(job.id, { posted_at: dateInput || null })
      setJob(updated)
      setEditingDate(false)
      setDateInput('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save date')
    } finally {
      setSavingDate(false)
    }
  }

  async function handleSave() {
    if (!job) return
    setSaving(true)
    try {
      await saveApplication(job.id)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <main className="max-w-3xl mx-auto px-6 py-12"><p className="text-sm text-gray-400">Loading...</p></main>
  if (!job) return <main className="max-w-3xl mx-auto px-6 py-12"><p className="text-sm text-red-500">{error ?? 'Job not found'}</p></main>

  const rec = job.ai_recommendation ? RECOMMENDATION_LABELS[job.ai_recommendation] : null
  const breakdown = job.ai_score_breakdown ?? {}

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-5">
      {error && <p className="text-sm text-red-500">{error}</p>}
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link to="/jobs" className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block">
            &larr; My Jobs
          </Link>
          <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
          {job.company && <p className="text-sm text-gray-500 mt-0.5">{job.company}</p>}
          <div className="flex items-center gap-2 mt-1">
            {job.posted_at && (Date.now() - new Date(job.posted_at).getTime()) < recentThresholdHours * 60 * 60 * 1000 && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">Recent</span>
            )}
            {editingDate ? (
              <>
                <input
                  type="date"
                  value={dateInput}
                  onChange={e => setDateInput(e.target.value)}
                  className="text-xs border border-gray-300 rounded px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  autoFocus
                />
                <button
                  onClick={handleSaveDate}
                  disabled={savingDate}
                  className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingDate ? '...' : 'Save'}
                </button>
                <button onClick={() => setEditingDate(false)} className="text-xs text-gray-400 hover:text-gray-600">
                  Cancel
                </button>
              </>
            ) : job.posted_at ? (
              <>
                <span className="text-xs text-gray-400">
                  Posted {new Date(job.posted_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                </span>
                <button
                  onClick={() => { setDateInput(job.posted_at!.slice(0, 10)); setEditingDate(true) }}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  Edit
                </button>
              </>
            ) : (
              <button
                onClick={() => { setDateInput(''); setEditingDate(true) }}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                + Add posting date
              </button>
            )}
          </div>
          {job.url ? (
            <div className="flex items-center gap-3 mt-1">
              <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                View original posting &rarr;
              </a>
              {job.description_raw && (
                <a href="#job-description" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                  View saved description
                </a>
              )}
            </div>
          ) : addingUrl ? (
            <div className="flex items-center gap-2 mt-1">
              <input
                type="url"
                value={urlInput}
                onChange={e => setUrlInput(e.target.value)}
                placeholder="https://..."
                className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 w-64"
                autoFocus
              />
              <button
                onClick={handleSaveUrl}
                disabled={savingUrl || !urlInput.trim()}
                className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                {savingUrl ? '...' : 'Save'}
              </button>
              <button onClick={() => setAddingUrl(false)} className="text-xs text-gray-400 hover:text-gray-600">
                Cancel
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 mt-1">
              {job.description_raw && (
                <a href="#job-description" className="text-xs text-blue-600 hover:underline">
                  View job description &rarr;
                </a>
              )}
              <button onClick={() => setAddingUrl(true)} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                + Add URL
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {(() => {
            const delayedUntil = rescoreAvailableAt(job.scored_at ?? null)
            const blocked = rescoring || rescoreCooldown || !!delayedUntil || job.scoring_status === 'pending'
            const title = job.scoring_status === 'pending'
              ? 'Scoring in progress'
              : rescoreCooldown && !rescoring
              ? 'Re-score recently triggered — wait a moment'
              : delayedUntil
              ? `Re-score available at ${delayedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
              : undefined
            return (
              <button
                onClick={handleRescore}
                disabled={blocked}
                title={title}
                className="px-4 py-2 text-sm rounded border border-gray-300 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {rescoring ? 'Rescoring — up to 30s...' : delayedUntil ? `Re-score (${delayedUntil.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})` : 'Re-score'}
              </button>
            )
          })()}
          <button
            onClick={handleSave}
            disabled={saving || saved}
            className="px-4 py-2 text-sm rounded border border-gray-300 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saved ? 'Saved to Applications' : saving ? 'Saving...' : 'Save to Applications'}
          </button>
        </div>
      </div>

      {job.scoring_status === 'skipped' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          This job was skipped due to a blocklist match.
        </div>
      )}

      {job.scoring_status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          Scoring failed. This can happen during high AI demand — try rescoring in a few minutes.
        </div>
      )}

      {job.ai_score !== null && (
        <>
          {/* Scores + recommendation */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <p className="text-4xl font-bold text-gray-900">{job.ai_score}<span className="text-lg text-gray-400">/100</span></p>
                <p className="text-xs text-gray-500 mt-1">Match score</p>
              </div>
              {job.ats_score !== null && (
                <div className="text-right">
                  <p className="text-2xl font-bold text-gray-900">{job.ats_score}<span className="text-sm text-gray-400">/100</span></p>
                  <p className="text-xs text-gray-500 mt-1">ATS score</p>
                </div>
              )}
            </div>
            {job.ai_summary && <p className="text-sm text-gray-600 mb-4">{job.ai_summary}</p>}
            {rec && (
              <>
                <div className={`inline-flex items-center px-3 py-1.5 rounded border text-sm font-medium ${rec.color}`}>
                  {rec.label}
                </div>
                {job.ai_recommendation_reason && (
                  <p className="text-xs text-gray-500 mt-2">{job.ai_recommendation_reason}</p>
                )}
              </>
            )}
          </div>

          {/* Score breakdown */}
          {Object.keys(breakdown).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Score Breakdown</h4>
              <div className="space-y-2">
                {Object.entries(breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-36 shrink-0 capitalize">{key.replace(/_/g, ' ')}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${val}%` }} />
                    </div>
                    <span className="text-xs text-gray-700 w-8 text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Skills */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(job.matched_skills?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Matched Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {job.matched_skills!.map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(job.missing_skills?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Missing Skills</h4>
                <div className="flex flex-wrap gap-1.5">
                  {job.missing_skills!.map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Flags */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(job.ai_green_flags?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Green Flags</h4>
                <ul className="space-y-1">
                  {job.ai_green_flags!.map(f => (
                    <li key={f} className="text-sm text-green-700 flex gap-2"><span className="shrink-0">+</span><span>{f}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {(job.ai_red_flags?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Red Flags</h4>
                <ul className="space-y-1">
                  {job.ai_red_flags!.map(f => (
                    <li key={f} className="text-sm text-red-600 flex gap-2"><span className="shrink-0">-</span><span>{f}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* ATS improvements */}
          {(job.ats_details?.improvements?.length ?? 0) > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">ATS Improvements</h4>
              <ul className="space-y-1">
                {job.ats_details!.improvements.map(i => (
                  <li key={i} className="text-sm text-gray-600 flex gap-2">
                    <span className="shrink-0 text-gray-400">•</span><span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Meta */}
          {(job.salary_assessment || job.application_effort) && (
            <div className="flex gap-4 text-xs text-gray-500">
              {job.salary_assessment && <span>{job.salary_assessment}</span>}
              {job.application_effort && <span>{EFFORT_LABELS[job.application_effort] ?? job.application_effort}</span>}
            </div>
          )}
        </>
      )}

      {job.description_raw && (
        <div id="job-description" className="bg-white border border-gray-200 rounded-lg p-6">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Job Description</h4>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{job.description_raw}</pre>
        </div>
      )}

      {job.company && <CompanyResearchCard companyName={job.company} credits={companyCredits} />}
    </main>
  )
}
