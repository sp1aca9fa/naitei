import { useState, useEffect } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getJob, getProfile, saveApplication, rescoreJob, updateJob, deleteJob } from '../lib/api'
import { CompanyResearchCard } from '../components/CompanyResearchCard'

interface AtsDetails {
  ats_score: number
  keyword_matches: string[]
  missing_keywords: string[]
  action_verb_score: number
  improvements: string[]
  skipped?: boolean
  reason?: string
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

const RECOMMENDATION_COLORS: Record<string, string> = {
  apply_now: 'text-green-700 bg-green-50 border-green-200',
  apply_with_tailoring: 'text-blue-700 bg-blue-50 border-blue-200',
  save_for_later: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  skip: 'text-red-700 bg-red-50 border-red-200',
}

const RESCORE_DELAY_MS = parseFloat(import.meta.env.VITE_AI_REQUEST_DELAY_HOURS ?? import.meta.env.VITE_RESCORE_DELAY_HOURS ?? '24') * 3600 * 1000

function rescoreAvailableAt(scoredAt: string | null): Date | null {
  if (!scoredAt || RESCORE_DELAY_MS <= 0) return null
  const available = new Date(new Date(scoredAt).getTime() + RESCORE_DELAY_MS)
  return available > new Date() ? available : null
}

function ScoreTooltip({ children, tooltip }: { children: React.ReactNode; tooltip: React.ReactNode }) {
  return (
    <div className="relative group cursor-default text-center">
      {children}
      <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 z-10 shadow-lg hidden group-hover:block text-left">
        {tooltip}
      </div>
    </div>
  )
}

export function JobDetailPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const dateLocale = i18n.language.startsWith('ja') ? 'ja-JP' : undefined

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
  const [descriptionExpanded, setDescriptionExpanded] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
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

  async function handleDelete() {
    if (!job) return
    setDeleting(true)
    try {
      await deleteJob(job.id)
      navigate('/jobs')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
      setDeleting(false)
      setConfirmDelete(false)
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

  if (loading) return <main className="max-w-3xl mx-auto px-6 py-12"><p className="text-sm text-gray-400">{t('common.loading')}</p></main>
  if (!job) return <main className="max-w-3xl mx-auto px-6 py-12"><p className="text-sm text-red-500">{error ?? t('jobs.jobDetail.notFound')}</p></main>

  const breakdown = job.ai_score_breakdown ?? {}

  const fitTooltip = (
    <>
      <p className="font-semibold mb-2">{t('jobs.scores.fit.tooltipTitle')}</p>
      <div className="space-y-1 mb-2">
        <p><span className="text-green-400 font-medium">80–100</span> — {t('jobs.scores.fit.tooltip80')}</p>
        <p><span className="text-blue-400 font-medium">65–79</span> — {t('jobs.scores.fit.tooltip65')}</p>
        <p><span className="text-yellow-400 font-medium">45–64</span> — {t('jobs.scores.fit.tooltip45')}</p>
        <p><span className="text-red-400 font-medium">0–44</span> — {t('jobs.scores.fit.tooltip0')}</p>
      </div>
      <p className="text-gray-400 border-t border-gray-700 pt-2">{t('jobs.scores.fit.tooltipFooter')}</p>
    </>
  )

  const atsTooltip = (
    <>
      <p className="text-gray-300 mb-2">{t('jobs.scores.ats.tooltipIntro')}</p>
      <p className="font-semibold mb-2">{t('jobs.scores.ats.tooltipTitle')}</p>
      <div className="space-y-1 mb-2">
        <p><span className="text-green-400 font-medium">80–100</span> — {t('jobs.scores.ats.tooltip80')}</p>
        <p><span className="text-blue-400 font-medium">60–79</span> — {t('jobs.scores.ats.tooltip60')}</p>
        <p><span className="text-yellow-400 font-medium">40–59</span> — {t('jobs.scores.ats.tooltip40')}</p>
        <p><span className="text-red-400 font-medium">0–39</span> — {t('jobs.scores.ats.tooltip0')}</p>
      </div>
      <p className="text-gray-400 border-t border-gray-700 pt-2">{t('jobs.scores.ats.tooltipFooter')}</p>
    </>
  )

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-5">
      {error && <p className="text-sm text-red-500">{error}</p>}

      <div>
        <Link to="/jobs" className="text-xs text-gray-400 hover:text-gray-600 mb-2 inline-block">
          {t('jobs.jobDetail.backLink')}
        </Link>
        <h2 className="text-xl font-bold text-gray-900">{job.title}</h2>
        {job.company && <p className="text-sm text-gray-500 mt-0.5">{job.company}</p>}
        <div className="flex items-center gap-2 mt-1">
          {job.posted_at && (Date.now() - new Date(job.posted_at).getTime()) < recentThresholdHours * 60 * 60 * 1000 && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium">{t('jobs.jobDetail.badgeRecent')}</span>
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
              <button onClick={handleSaveDate} disabled={savingDate} className="text-xs px-2 py-0.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                {savingDate ? '...' : t('common.save')}
              </button>
              <button onClick={() => setEditingDate(false)} className="text-xs text-gray-400 hover:text-gray-600">{t('common.cancel')}</button>
            </>
          ) : job.posted_at ? (
            <>
              <span className="text-xs text-gray-400">
                {t('jobs.jobDetail.postedDate', { date: new Date(job.posted_at).toLocaleDateString(dateLocale, { year: 'numeric', month: 'short', day: 'numeric' }) })}
              </span>
              <button onClick={() => { setDateInput(job.posted_at!.slice(0, 10)); setEditingDate(true) }} className="text-xs text-gray-400 hover:text-gray-600">
                {t('jobs.jobDetail.editDate')}
              </button>
            </>
          ) : (
            <button onClick={() => { setDateInput(''); setEditingDate(true) }} className="text-xs text-gray-400 hover:text-gray-600">
              {t('jobs.jobDetail.addPostingDate')}
            </button>
          )}
        </div>

        {job.url ? (
          <div className="flex items-center gap-3 mt-1">
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
              {t('jobs.jobDetail.viewOriginal')}
            </a>
            {job.description_raw && (
              <a href="#job-description" className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
                {t('jobs.jobDetail.viewSavedDescription')}
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
            <button onClick={handleSaveUrl} disabled={savingUrl || !urlInput.trim()} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
              {savingUrl ? '...' : t('common.save')}
            </button>
            <button onClick={() => setAddingUrl(false)} className="text-xs text-gray-400 hover:text-gray-600">{t('common.cancel')}</button>
          </div>
        ) : (
          <div className="flex items-center gap-3 mt-1">
            {job.description_raw && (
              <a href="#job-description" className="text-xs text-blue-600 hover:underline">
                {t('jobs.jobDetail.viewJobDescription')}
              </a>
            )}
            <button onClick={() => setAddingUrl(true)} className="text-xs text-gray-400 hover:text-gray-600 hover:underline">
              {t('jobs.jobDetail.addUrl')}
            </button>
          </div>
        )}

        <div className="flex items-center justify-end gap-2 mt-3">
          {job.scored_at && (
            <span className="text-xs text-gray-400 mr-auto">
              {t('jobs.jobDetail.scored', { date: new Date(job.scored_at).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' }) })}
            </span>
          )}
          {(() => {
            const delayedUntil = rescoreAvailableAt(job.scored_at ?? null)
            const blocked = rescoring || rescoreCooldown || !!delayedUntil || job.scoring_status === 'pending'
            const title = job.scoring_status === 'pending'
              ? t('jobs.jobDetail.scoringInProgress')
              : rescoreCooldown && !rescoring
              ? t('jobs.jobDetail.rescoreCooldown')
              : delayedUntil
              ? t('jobs.jobDetail.rescoreAvailableAt', { time: delayedUntil.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) })
              : undefined
            return (
              <button onClick={handleRescore} disabled={blocked} title={title}
                className="px-4 py-2 text-sm rounded border border-gray-300 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
                {rescoring
                  ? t('jobs.jobDetail.rescoringButton')
                  : delayedUntil
                  ? t('jobs.jobDetail.rescoreAtButton', { time: delayedUntil.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) })
                  : t('jobs.jobDetail.rescoreButton')}
              </button>
            )
          })()}
          <button onClick={handleSave} disabled={saving || saved}
            className="px-4 py-2 text-sm rounded border border-gray-300 hover:border-gray-400 disabled:opacity-50 disabled:cursor-not-allowed">
            {saved ? t('jobs.jobDetail.savedToApplications') : saving ? t('jobs.jobDetail.saving') : t('jobs.jobDetail.saveToApplications')}
          </button>
          {confirmDelete ? (
            <span className="flex items-center gap-1">
              <button onClick={handleDelete} disabled={deleting} className="px-3 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50">
                {deleting ? '...' : t('common.confirm')}
              </button>
              <button onClick={() => setConfirmDelete(false)} className="px-3 py-2 text-sm rounded border border-gray-300 text-gray-600 hover:bg-gray-50">
                {t('common.cancel')}
              </button>
            </span>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="px-4 py-2 text-sm rounded border border-gray-300 text-gray-400 hover:text-red-500 hover:border-red-300">
              {t('common.delete')}
            </button>
          )}
        </div>
      </div>

      {job.scoring_status === 'skipped' && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          {t('jobs.jobDetail.skippedAlert')}
        </div>
      )}

      {job.scoring_status === 'failed' && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-800">
          {t('jobs.jobDetail.failedAlert')}
        </div>
      )}

      {job.ai_score !== null && (
        <>
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <div className="flex justify-center gap-10 mb-6">
              <ScoreTooltip tooltip={fitTooltip}>
                <p className="text-4xl font-bold text-gray-900">{job.ai_score}<span className="text-lg text-gray-400">/100</span></p>
                <p className="text-xs text-gray-500 mt-1">{t('jobs.scores.fit.label')}</p>
              </ScoreTooltip>

              {job.ats_details?.skipped ? (
                <div className="text-center">
                  <p className="text-4xl font-bold text-gray-300">—</p>
                  <p className="text-xs text-gray-400 mt-1">ATS</p>
                  <p className="text-xs text-yellow-600 mt-1">{t('jobs.scores.ats.reupload')}</p>
                </div>
              ) : job.ats_score !== null ? (
                <ScoreTooltip tooltip={atsTooltip}>
                  <p className="text-4xl font-bold text-gray-900">{job.ats_score}<span className="text-lg text-gray-400">/100</span></p>
                  <p className="text-xs text-gray-500 mt-1">{t('jobs.scores.ats.label')}</p>
                </ScoreTooltip>
              ) : null}
            </div>

            {job.ai_summary && (
              <>
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{t('jobs.jobDetail.aiAnalysisSummary')}</h3>
                <p className="text-sm text-gray-600 mb-4">{job.ai_summary}</p>
              </>
            )}
            {job.ai_recommendation && (
              <>
                <div className={`inline-flex items-center px-3 py-1.5 rounded border text-sm font-medium ${RECOMMENDATION_COLORS[job.ai_recommendation] ?? ''}`}>
                  {t(`jobs.recommendations.${job.ai_recommendation}`, { defaultValue: job.ai_recommendation })}
                </div>
                {job.ai_recommendation_reason && (
                  <p className="text-xs text-gray-500 mt-2">{job.ai_recommendation_reason}</p>
                )}
              </>
            )}
          </div>

          {Object.keys(breakdown).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('jobs.jobDetail.fitBreakdown')}</h4>
              <div className="space-y-2">
                {Object.entries(breakdown).map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-gray-500 w-40 shrink-0">
                      {t(`jobs.scores.breakdownKeys.${key}`, { defaultValue: key.replace(/_/g, ' ') })}
                    </span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${val}%` }} />
                    </div>
                    <span className="text-xs text-gray-700 w-8 text-right">{val}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(job.matched_skills?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('jobs.jobDetail.matchedSkills')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {job.matched_skills!.map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {(job.missing_skills?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('jobs.jobDetail.missingSkills')}</h4>
                <div className="flex flex-wrap gap-1.5">
                  {job.missing_skills!.map(s => (
                    <span key={s} className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">{s}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(job.ai_green_flags?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('jobs.jobDetail.greenFlags')}</h4>
                <ul className="space-y-1">
                  {job.ai_green_flags!.map(f => (
                    <li key={f} className="text-sm text-green-700 flex gap-2"><span className="shrink-0">+</span><span>{f}</span></li>
                  ))}
                </ul>
              </div>
            )}
            {(job.ai_red_flags?.length ?? 0) > 0 && (
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('jobs.jobDetail.redFlags')}</h4>
                <ul className="space-y-1">
                  {job.ai_red_flags!.map(f => (
                    <li key={f} className="text-sm text-red-600 flex gap-2"><span className="shrink-0">-</span><span>{f}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {(job.ats_details?.improvements?.length ?? 0) > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{t('jobs.jobDetail.atsImprovements')}</h4>
              <ul className="space-y-1">
                {job.ats_details!.improvements.map(i => (
                  <li key={i} className="text-sm text-gray-600 flex gap-2">
                    <span className="shrink-0 text-gray-400">•</span><span>{i}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(job.salary_assessment || job.application_effort) && (
            <div className="flex gap-4 text-xs text-gray-500">
              {job.salary_assessment && <span>{job.salary_assessment}</span>}
              {job.application_effort && (
                <span>{t(`jobs.jobDetail.effort.${job.application_effort}`, { defaultValue: job.application_effort })}</span>
              )}
            </div>
          )}
        </>
      )}

      {job.description_raw && (
        <div id="job-description" className="bg-white border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{t('jobs.jobDetail.jobDescription')}</h4>
            <button onClick={() => setDescriptionExpanded(v => !v)} className="text-xs text-gray-400 hover:text-gray-600">
              {descriptionExpanded ? t('jobs.jobDetail.collapse') : t('jobs.jobDetail.expand')}
            </button>
          </div>
          {descriptionExpanded ? (
            <>
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">{job.description_raw}</pre>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <span className="text-xs text-gray-400">{t('jobs.jobDetail.chars', { count: job.description_raw.length.toLocaleString(dateLocale) })}</span>
                {(() => {
                  const maxChars = import.meta.env.VITE_JOB_DESCRIPTION_MAX_CHARS ? parseInt(import.meta.env.VITE_JOB_DESCRIPTION_MAX_CHARS) : undefined
                  return maxChars && job.description_raw.length > maxChars ? (
                    <span className="text-xs text-yellow-600">{t('jobs.jobDetail.charsTruncated', { count: maxChars.toLocaleString(dateLocale) })}</span>
                  ) : null
                })()}
              </div>
            </>
          ) : (
            <p className="text-xs text-gray-400 italic">
              {t('jobs.jobDetail.charsCollapsed', { count: job.description_raw.length.toLocaleString(dateLocale) })}
            </p>
          )}
        </div>
      )}

      {job.company && <CompanyResearchCard companyName={job.company} credits={companyCredits} />}
    </main>
  )
}
