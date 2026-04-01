import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getJobs, deleteJob } from '../lib/api'

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
  created_at: string
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  apply_now: 'Apply Now',
  apply_with_tailoring: 'Tailor & Apply',
  save_for_later: 'Save for Later',
  skip: 'Skip',
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

export function MyJobsPage() {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    getJobs()
      .then(setJobs)
      .catch(err => setError(err instanceof Error ? err.message : 'Failed to load jobs'))
      .finally(() => setLoading(false))
  }, [])

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

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1">My Jobs</h2>
          <p className="text-sm text-gray-400">{jobs.length} analyzed job{jobs.length !== 1 ? 's' : ''}</p>
        </div>
        <Link
          to="/jobs/analyze"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          + Analyze Job
        </Link>
      </div>

      {loading && <p className="text-sm text-gray-400">Loading...</p>}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {!loading && jobs.length === 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500 text-sm mb-3">No jobs analyzed yet.</p>
          <Link to="/jobs/analyze" className="text-sm text-blue-600 hover:underline">
            Paste your first job description
          </Link>
        </div>
      )}

      {jobs.length > 0 && (
        <div className="space-y-2">
          {jobs.map(job => (
            <div key={job.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-all">
              <div className="flex items-start justify-between gap-3">
                <Link to={`/jobs/${job.id}`} className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                  {job.company && <p className="text-xs text-gray-500 mt-0.5">{job.company}</p>}
                </Link>
                <div className="flex items-center gap-2 shrink-0">
                  {job.scoring_status === 'skipped' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-yellow-50 text-yellow-700">Skipped</span>
                  )}
                  {job.scoring_status === 'failed' && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-50 text-red-600">Failed</span>
                  )}
                  {job.ai_score !== null && (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${scoreBadgeColor(job.ai_score)}`}>
                      {job.ai_score}
                    </span>
                  )}
                  {job.ats_score !== null && (
                    <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                      ATS {job.ats_score}
                    </span>
                  )}
                  {confirmDelete === job.id ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => handleDelete(job.id)}
                        disabled={deleting === job.id}
                        className="text-xs px-2 py-0.5 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {deleting === job.id ? '...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="text-xs px-2 py-0.5 rounded border border-gray-300 text-gray-600 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(job.id)}
                      className="text-xs text-gray-400 hover:text-red-500 px-1"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 mt-2">
                {job.ai_recommendation && (
                  <span className={`text-xs px-2 py-0.5 rounded ${RECOMMENDATION_COLORS[job.ai_recommendation] ?? 'bg-gray-100 text-gray-600'}`}>
                    {RECOMMENDATION_LABELS[job.ai_recommendation] ?? job.ai_recommendation}
                  </span>
                )}
                <span className="text-xs text-gray-400">{job.source}</span>
                <span className="text-xs text-gray-300">•</span>
                <span className="text-xs text-gray-400">
                  {new Date(job.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}
