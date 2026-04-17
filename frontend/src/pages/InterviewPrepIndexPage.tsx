import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getApplications } from '../lib/api'

export function InterviewPrepIndexPage() {
  const { t } = useTranslation()
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getApplications()
      .then((data: any[]) => setApps(data.filter(a => a.status === 'interview')))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const byRound = apps.reduce<Record<number, any[]>>((acc, app) => {
    const round = app.interview_round ?? 1
    ;(acc[round] = acc[round] ?? []).push(app)
    return acc
  }, {})
  const rounds = Object.keys(byRound).map(Number).sort((a, b) => a - b)

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('interviewPrep.title')}</h2>
        <p className="text-sm text-gray-400 mt-1">{t('interviewPrep.subtitle')}</p>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : apps.length === 0 ? (
        <p className="text-sm text-gray-400">{t('interviewPrep.noInterviews')}</p>
      ) : (
        <div className="space-y-8">
          {rounds.map(round => (
            <div key={round}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('interviewPrep.round', { round })}</h3>
              <div className="space-y-2">
                {byRound[round].map((app: any) => (
                  <Link
                    key={app.id}
                    to={`/applications/${app.id}/interview-prep`}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{app.jobs?.title ?? 'Untitled'}</p>
                      {app.jobs?.company && <p className="text-xs text-gray-500 truncate">{app.jobs.company}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {app.interview_prep
                        ? <span className="text-xs text-green-600">{t('optimizations.ready')}</span>
                        : <span className="text-xs text-gray-400">{t('optimizations.notGenerated')}</span>
                      }
                      <span className="text-gray-400 text-sm">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
