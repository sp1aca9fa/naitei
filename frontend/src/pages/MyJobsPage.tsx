import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getJobs, getProfile, deleteJob, importRemotive, importAdzuna, importRemoteOk } from '../lib/api'

interface JobSummary {
  id: string
  title: string
  company: string | null
  source: string
  scoring_status: string | null
  ai_score: number | null
  ai_recommendation: string | null
  ats_score: number | null
  is_recent: boolean | null
  posted_at: string | null
  scored_at: string | null
  created_at: string
}

const RECOMMENDATION_COLORS: Record<string, string> = {
  apply_now: 'bg-green-50 text-green-700',
  apply_with_tailoring: 'bg-blue-50 text-blue-700',
  save_for_later: 'bg-yellow-50 text-yellow-700',
  skip: 'bg-red-50 text-red-600',
}

function scoreBadgeColor(score: number | null): string {
  if (score === null) return 'bg-gray-100 text-gray-500'
  if (score >= 80) return 'bg-green-100 text-green-800'
  if (score >= 65) return 'bg-blue-100 text-blue-800'
  if (score >= 45) return 'bg-yellow-100 text-yellow-800'
  return 'bg-red-100 text-red-700'
}

type SortKey = 'imported' | 'score' | 'posted'

export function MyJobsPage() {
  const { t, i18n } = useTranslation()
  const dateLocale = i18n.language.startsWith('ja') ? 'ja-JP' : undefined
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [displayMinScore, setDisplayMinScore] = useState(50)
  const [displayShowSkipped, setDisplayShowSkipped] = useState(false)
  const [recentThresholdHours, setRecentThresholdHours] = useState(48)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [importing, setImporting] = useState<'remotive' | 'adzuna' | 'remoteok' | null>(null)
  const [importResult, setImportResult] = useState<string | null>(null)
  const [importCooldown, setImportCooldown] = useState<{ remotive: boolean; remoteok: boolean }>(() => {
    const now = Date.now()
    const rok = parseInt(sessionStorage.getItem('import_cooldown_remoteok') ?? '0')
    const rem = parseInt(sessionStorage.getItem('import_cooldown_remotive') ?? '0')
    return { remoteok: now - rok < 90_000, remotive: now - rem < 90_000 }
  })

  const [filterSource, setFilterSource] = useState<string | null>(null)
  const [filterRec, setFilterRec] = useState<string | null>(null)
  const [filterRecentOnly, setFilterRecentOnly] = useState(false)
  const [sortKey, setSortKey] = useState<SortKey>('imported')

  function relativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    if (hours < 1) return t('jobs.myJobs.relativeTimeLessThanHour')
    if (hours < 24) return t('jobs.myJobs.relativeTimeHours', { count: hours })
    const days = Math.floor(hours / 24)
    return t('jobs.myJobs.relativeTimeDays', { count: days })
  }

  useEffect(() => {
    Promise.all([getJobs(), getProfile()])
      .then(([jobsData, profile]) => {
        setJobs(jobsData)
        setDisplayMinScore(profile.display_min_score ?? 50)
        setDisplayShowSkipped(profile.display_show_skipped ?? false)
        setRecentThresholdHours(profile.recent_threshold_hours ?? 48)
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load jobs'))
      .finally(() => setLoading(false))
  }, [])

  async function handleImport(source: 'remotive' | 'adzuna' | 'remoteok') {
    setImporting(source)
    setImportResult(null)
    if (source !== 'adzuna') {
      sessionStorage.setItem(`import_cooldown_${source}`, String(Date.now()))
      setImportCooldown(prev => ({ ...prev, [source]: true }))
    }
    try {
      const result = source === 'remotive' ? await importRemotive() : source === 'remoteok' ? await importRemoteOk() : await importAdzuna()
      const parts: string[] = []
      if (result.imported > 0) parts.push(t('jobs.myJobs.importAdded', { count: result.imported }))
      if (result.failed) parts.push(t('jobs.myJobs.importFailed', { count: result.failed }))
      if (result.filtered) parts.push(t('jobs.myJobs.importFiltered', { count: result.filtered }))
      if (result.remaining > 0) {
        parts.push(t('jobs.myJobs.importMore', { count: result.remaining }))
      } else if (result.imported === 0 && result.filtered && result.filtered > 0) {
        parts.push(t('jobs.myJobs.importNoMore'))
      } else {
        parts.push(t('jobs.myJobs.importAllCaughtUp'))
      }
      if (result.imported > 0) parts.push(t('jobs.myJobs.importScoringBackground'))
      setImportResult(parts.join(' · '))
      if (result.imported > 0) {
        const updated = await getJobs()
        setJobs(updated)
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Import failed'
      try { setImportResult(JSON.parse(raw).error ?? raw) } catch { setImportResult(raw) }
    } finally {
      setImporting(null)
      if (source !== 'adzuna') {
        setTimeout(() => {
          setImportCooldown(prev => ({ ...prev, [source]: false }))
          sessionStorage.removeItem(`import_cooldown_${source}`)
        }, 90_000)
      }
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id)
    try {
      await deleteJob(id)
      setJobs(prev => prev.filter(j => j.id !== id))
      setConfirmDelete(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete')
    } finally {
      setDeleting(null)
    }
  }

  const analyzedCount = jobs.filter(j => j.scoring_status !== 'skipped').length

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">{t('jobs.myJobs.title')}</h2>
          <p className="text-sm text-gray-400">{t('jobs.myJobs.subtitle', { count: analyzedCount })}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => handleImport('remoteok')}
            disabled={importing !== null || importCooldown.remoteok}
            title={importCooldown.remoteok && importing === null ? t('jobs.myJobs.importCooldown') : undefined}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing === 'remoteok' ? t('jobs.myJobs.importing') : t('jobs.myJobs.importFromRemoteOk')}
          </button>
          <button
            onClick={() => handleImport('remotive')}
            disabled={importing !== null || importCooldown.remotive}
            title={importCooldown.remotive && importing === null ? t('jobs.myJobs.importCooldown') : undefined}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing === 'remotive' ? t('jobs.myJobs.importing') : t('jobs.myJobs.importFromRemotive')}
          </button>
          <Link to="/jobs/analyze" className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
            {t('jobs.myJobs.analyzeJob')}
          </Link>
        </div>
      </div>

      {importResult && (
        <p className="text-sm text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">{importResult}</p>
      )}

      {loading && <p className="text-sm text-gray-400">{t('common.loading')}</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && jobs.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500 text-sm mb-3">{t('jobs.myJobs.noJobs')}</p>
          <Link to="/jobs/analyze" className="text-sm text-blue-600 hover:underline">
            {t('jobs.myJobs.noJobsLink')}
          </Link>
        </div>
      )}

      {jobs.some(j => j.source === 'remoteok') && (
        <p className="text-xs text-gray-400">
          {t('jobs.myJobs.remoteokAttribution')}{' '}
          <a href="https://remoteok.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-gray-600">RemoteOK</a>
        </p>
      )}

      {jobs.length > 0 && (() => {
        const afterProfileFilters = jobs.filter(j => {
          if (!displayShowSkipped && (j.ai_recommendation === 'skip' || j.scoring_status === 'skipped')) return false
          if (j.ai_score !== null && j.ai_score < displayMinScore) return false
          return true
        })
        const hiddenByProfile = jobs.length - afterProfileFilters.length

        const isJobRecent = (j: JobSummary) =>
          !!j.posted_at && (Date.now() - new Date(j.posted_at).getTime()) < recentThresholdHours * 60 * 60 * 1000

        const filtered = afterProfileFilters.filter(j => {
          if (filterSource && j.source !== filterSource) return false
          if (filterRec && j.ai_recommendation !== filterRec) return false
          if (filterRecentOnly && !isJobRecent(j)) return false
          return true
        })

        const sorted = [...filtered].sort((a, b) => {
          if (sortKey === 'score') return (b.ai_score ?? -1) - (a.ai_score ?? -1)
          if (sortKey === 'posted') {
            if (!a.posted_at && !b.posted_at) return 0
            if (!a.posted_at) return 1
            if (!b.posted_at) return -1
            return new Date(b.posted_at).getTime() - new Date(a.posted_at).getTime()
          }
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

        const SOURCE_LABELS: Record<string, string> = {
          remotive: 'Remotive',
          remoteok: 'RemoteOK',
          paste: i18n.language.startsWith('ja') ? '手動入力' : 'Paste',
          url_fetch: i18n.language.startsWith('ja') ? 'URL分析' : 'URL',
        }
        const sources = [...new Set(jobs.map(j => j.source))]
        const REC_OPTIONS = [
          { value: 'apply_now' },
          { value: 'apply_with_tailoring' },
          { value: 'save_for_later' },
          { value: 'skip' },
        ]
        const pillBase = 'text-xs px-2.5 py-1 rounded-full border cursor-pointer select-none transition-colors'
        const pillActive = 'bg-gray-900 text-white border-gray-900'
        const pillInactive = 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'

        return (
          <>
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 space-y-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 w-16 shrink-0">{t('jobs.myJobs.filterSource')}</span>
                <button onClick={() => setFilterSource(null)} className={`${pillBase} ${filterSource === null ? pillActive : pillInactive}`}>{t('jobs.myJobs.filterAll')}</button>
                {sources.map(s => (
                  <button key={s} onClick={() => setFilterSource(filterSource === s ? null : s)} className={`${pillBase} ${filterSource === s ? pillActive : pillInactive}`}>
                    {SOURCE_LABELS[s] ?? s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-400 w-16 shrink-0">{t('jobs.myJobs.filterMatch')}</span>
                <button onClick={() => setFilterRec(null)} className={`${pillBase} ${filterRec === null ? pillActive : pillInactive}`}>{t('jobs.myJobs.filterAll')}</button>
                {REC_OPTIONS.map(r => (
                  <button key={r.value} onClick={() => setFilterRec(filterRec === r.value ? null : r.value)} className={`${pillBase} ${filterRec === r.value ? pillActive : pillInactive}`}>
                    {t(`jobs.recommendations.${r.value}`)}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filterRecentOnly}
                    onChange={e => setFilterRecentOnly(e.target.checked)}
                    className="w-3.5 h-3.5 accent-blue-600"
                  />
                  <span className="text-xs text-gray-600">{t('jobs.myJobs.filterRecentOnly')}</span>
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400">{t('jobs.myJobs.sort')}</span>
                  <select
                    value={sortKey}
                    onChange={e => setSortKey(e.target.value as SortKey)}
                    className="text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="imported">{t('jobs.myJobs.sortImported')}</option>
                    <option value="score">{t('jobs.myJobs.sortScore')}</option>
                    <option value="posted">{t('jobs.myJobs.sortPosted')}</option>
                  </select>
                </div>
              </div>
            </div>

            {hiddenByProfile > 0 && (
              <p className="text-xs text-gray-400">
                {t('jobs.myJobs.hiddenByProfile', { count: hiddenByProfile })}{' '}
                <Link to="/profile" className="underline hover:text-gray-600">{t('jobs.myJobs.hiddenByProfileLink')}</Link>
              </p>
            )}

            {sorted.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">{t('jobs.myJobs.noMatch')}</p>
            )}

            <div className="space-y-2">
              {sorted.map(job => (
                <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all">
                  <div className="flex items-start justify-between gap-3">
                    <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                      {job.company && <p className="text-xs text-gray-500 mt-0.5">{job.company}</p>}
                    </Link>
                    <div className="flex items-center gap-2 shrink-0">
                      {isJobRecent(job) && (
                        <span
                          title={t('jobs.myJobs.recentTooltip', { time: relativeTime(job.posted_at!) })}
                          className="text-xs px-2 py-0.5 rounded bg-green-50 text-green-700 border border-green-200 font-medium cursor-default"
                        >
                          {t('jobs.myJobs.badgeRecent')}
                        </span>
                      )}
                      {job.scoring_status === 'skipped' && (
                        <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">{t('jobs.myJobs.badgeSkipped')}</span>
                      )}
                      {job.scoring_status === 'failed' && (
                        <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">{t('jobs.myJobs.badgeFailed')}</span>
                      )}
                      {job.ai_score !== null && (
                        <div className="relative group cursor-default">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${scoreBadgeColor(job.ai_score)}`}>
                            {job.ai_score}
                          </span>
                          <div className="absolute right-0 top-full mt-1.5 w-64 bg-gray-900 text-white text-xs rounded-lg p-2.5 z-20 shadow-lg hidden group-hover:block text-left leading-relaxed">
                            <p className="font-semibold mb-1.5">{t('jobs.scores.fit.tooltipTitle')}</p>
                            <p><span className="text-green-400 font-medium">80–100</span> — {t('jobs.scores.fit.tooltip80')}</p>
                            <p><span className="text-blue-400 font-medium">65–79</span> — {t('jobs.scores.fit.tooltip65')}</p>
                            <p><span className="text-yellow-400 font-medium">45–64</span> — {t('jobs.scores.fit.tooltip45')}</p>
                            <p><span className="text-red-400 font-medium">0–44</span> — {t('jobs.scores.fit.tooltip0')}</p>
                          </div>
                        </div>
                      )}
                      {job.ats_score !== null && (
                        <div className="relative group cursor-default">
                          <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                            ATS {job.ats_score}
                          </span>
                          <div className="absolute right-0 top-full mt-1.5 w-64 bg-gray-900 text-white text-xs rounded-lg p-2.5 z-20 shadow-lg hidden group-hover:block text-left leading-relaxed">
                            <p className="text-gray-300 mb-2">{t('jobs.scores.ats.tooltipIntro')}</p>
                            <p className="font-semibold mb-1.5">{t('jobs.scores.ats.tooltipTitle')}</p>
                            <p><span className="text-green-400 font-medium">80–100</span> — {t('jobs.scores.ats.tooltip80')}</p>
                            <p><span className="text-blue-400 font-medium">60–79</span> — {t('jobs.scores.ats.tooltip60')}</p>
                            <p><span className="text-yellow-400 font-medium">40–59</span> — {t('jobs.scores.ats.tooltip40')}</p>
                            <p><span className="text-red-400 font-medium">0–39</span> — {t('jobs.scores.ats.tooltip0')}</p>
                          </div>
                        </div>
                      )}
                      {confirmDelete === job.id ? (
                        <span className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(job.id)}
                            disabled={deleting === job.id}
                            className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                          >
                            {deleting === job.id ? '...' : t('common.confirm')}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                          >
                            {t('common.cancel')}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(job.id)}
                          className="text-xs text-gray-400 hover:text-red-500 px-1"
                        >
                          {t('common.delete')}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {job.ai_recommendation && (
                      <span className={`text-xs px-2 py-0.5 rounded ${RECOMMENDATION_COLORS[job.ai_recommendation] ?? 'bg-gray-100 text-gray-600'}`}>
                        {t(`jobs.recommendations.${job.ai_recommendation}`, { defaultValue: job.ai_recommendation })}
                      </span>
                    )}
                    <span className="text-xs text-gray-400">{SOURCE_LABELS[job.source] ?? job.source}</span>
                    <span className="text-xs text-gray-300">•</span>
                    <span className="text-xs text-gray-400">
                      {new Date(job.created_at).toLocaleDateString(dateLocale)}
                    </span>
                    {job.scored_at && (
                      <>
                        <span className="text-xs text-gray-300">•</span>
                        <span className="text-xs text-gray-400">
                          {t('jobs.myJobs.scored', { date: new Date(job.scored_at).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric', year: 'numeric' }) })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )
      })()}
    </main>
  )
}
