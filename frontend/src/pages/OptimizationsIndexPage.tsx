import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getApplications } from '../lib/api'

const VERDICT_STYLE: Record<string, string> = {
  strong: 'bg-green-50 text-green-700',
  needs_tweaks: 'bg-yellow-50 text-yellow-700',
  major_overhaul: 'bg-red-50 text-red-600',
}

const VERDICT_LABEL: Record<string, string> = {
  strong: 'Strong',
  needs_tweaks: 'Needs tweaks',
  major_overhaul: 'Major overhaul needed',
}

export function OptimizationsIndexPage() {
  const [apps, setApps] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getApplications()
      .then((data: any[]) => setApps(data.filter(a => a.status !== 'removed')))
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const withOptimization = apps.filter(a => a.resume_optimization)
  const without = apps.filter(a => !a.resume_optimization)

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">CV Optimizations</h2>
        <p className="text-sm text-gray-400 mt-1">Resume audits for each application.</p>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : apps.length === 0 ? (
        <p className="text-sm text-gray-400">No applications yet. Save a job to get started.</p>
      ) : (
        <div className="space-y-8">
          {withOptimization.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Optimized</h3>
              <div className="space-y-2">
                {withOptimization.map(app => (
                  <Link
                    key={app.id}
                    to={`/applications/${app.id}/optimize`}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{app.jobs?.title ?? 'Untitled'}</p>
                      {app.jobs?.company && <p className="text-xs text-gray-500 truncate">{app.jobs.company}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${VERDICT_STYLE[app.resume_optimization.verdict]}`}>
                        {VERDICT_LABEL[app.resume_optimization.verdict]}
                      </span>
                      <span className="text-gray-400 text-sm">→</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {without.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Not yet optimized</h3>
              <div className="space-y-2">
                {without.map(app => (
                  <Link
                    key={app.id}
                    to={`/applications/${app.id}/optimize`}
                    className="flex items-center justify-between bg-white border border-gray-200 rounded-lg px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{app.jobs?.title ?? 'Untitled'}</p>
                      {app.jobs?.company && <p className="text-xs text-gray-500 truncate">{app.jobs.company}</p>}
                    </div>
                    <span className="text-gray-400 text-sm shrink-0 ml-3">→</span>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  )
}
