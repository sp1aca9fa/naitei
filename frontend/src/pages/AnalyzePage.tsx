import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { importPasteJob, importUrlJob } from '../lib/api'

export function AnalyzePage() {
  const navigate = useNavigate()
  const [url, setUrl] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [fetchWarning, setFetchWarning] = useState<string | null>(null)
  const [description, setDescription] = useState('')
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [skipped, setSkipped] = useState<string | null>(null)

  async function handleUrlChange(value: string) {
    setUrl(value)
    setFetchError(null)
    setFetchWarning(null)
    try { new URL(value) } catch { return }
    setFetching(true)
    setTitle('')
    setCompany('')
    setDescription('')
    try {
      const data = await importUrlJob(value.trim())
      if (data.fallback) {
        setFetchError(
          data.reason === 'login_wall'
            ? "This page requires login — paste the description below."
            : "Couldn't fetch that URL — paste the description below."
        )
      } else {
        if (data.description) setDescription(data.description)
        if (data.title) setTitle(data.title)
        if (data.company) setCompany(data.company)
        setFetchWarning("Auto-filled from URL — review and correct the fields below before analyzing.")
      }
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Fetch failed')
    } finally {
      setFetching(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim()) return
    setLoading(true)
    setError(null)
    setSkipped(null)
    try {
      const data = await importPasteJob({
        description: description.trim(),
        title: title.trim() || undefined,
        company: company.trim() || undefined,
        url: url.trim() || undefined,
      })
      if (data.skipped) {
        setSkipped(data.error ?? 'Job matched a blocklist word and was skipped.')
        return
      }
      navigate(`/jobs/${data.job.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import job')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-8 flex flex-col min-h-[calc(100vh-3.5rem)]">
      <div className="mb-5">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Analyze a Job</h2>
        <p className="text-sm text-gray-400">Paste a job description to score it against your profile.</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 flex flex-col flex-1">
        <div className="mb-4">
          <input
            type="url"
            placeholder="Job URL (paste to auto-fill)"
            value={url}
            onChange={e => handleUrlChange(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {fetching && <p className="text-xs text-gray-400 mt-1">Fetching...</p>}
        </div>

        {fetchError && (
          <p className="text-sm text-yellow-700 bg-yellow-50 border border-yellow-200 rounded px-3 py-2 mb-4">{fetchError}</p>
        )}
        {fetchWarning && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">{fetchWarning}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              type="text"
              placeholder="Job title (optional — extracted from text if blank)"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              type="text"
              placeholder="Company name (optional)"
              value={company}
              onChange={e => setCompany(e.target.value)}
              className="border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <textarea
            placeholder="Paste the full job description here..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="w-full flex-1 border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
          <button
            type="submit"
            disabled={loading || description.trim().length < 50}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed self-start"
          >
            {loading ? 'Analyzing...' : 'Analyze Job'}
          </button>
        </form>
      </div>

      {error && <p className="text-sm text-red-500 mt-4">{error}</p>}

      {skipped && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 mt-4">
          <p className="font-medium">Job skipped</p>
          <p className="text-yellow-700 mt-1">{skipped}</p>
        </div>
      )}
    </main>
  )
}
