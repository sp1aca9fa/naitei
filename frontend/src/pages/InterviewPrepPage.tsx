import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getApplication, generateInterviewPrep } from '../lib/api'

interface InterviewPrep {
  key_topics: string[]
  likely_questions: { question: string; tip: string }[]
  talking_points: string[]
  concerns_to_address: { potential_concern: string; how_to_address: string }[]
}

function Section({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</h3>
      <ul className="space-y-1.5">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-700">
            <span className="text-gray-300 shrink-0 mt-0.5">•</span>{item}
          </li>
        ))}
      </ul>
    </div>
  )
}

export function InterviewPrepPage() {
  const { id } = useParams<{ id: string }>()
  const [jobTitle, setJobTitle] = useState('')
  const [company, setCompany] = useState('')
  const [round, setRound] = useState<number | null>(null)
  const [prep, setPrep] = useState<InterviewPrep | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id) return
    getApplication(id)
      .then((app: any) => {
        setJobTitle(app.jobs?.title ?? 'Untitled')
        setCompany(app.jobs?.company ?? '')
        setRound(app.interview_round ?? null)
        if (app.interview_prep) {
          setPrep(app.interview_prep)
          setGeneratedAt(app.interview_prep_generated_at)
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  async function generate(force = false) {
    if (!id) return
    setGenerating(true)
    setError(null)
    try {
      const result = await generateInterviewPrep(id, force)
      setPrep(result)
      setGeneratedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <Link to="/interview-prep" className="text-xs text-gray-400 hover:text-gray-600">← Interview Prep</Link>
          <Link to={`/applications?expand=${id}`} className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors">Open application card →</Link>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mt-2">Interview Prep</h2>
        {(jobTitle || company) && (
          <p className="text-sm text-gray-500 mt-0.5">
            {jobTitle}{company ? ` — ${company}` : ''}
            {round != null && <span className="ml-2 text-xs text-blue-600">Round {round}</span>}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : prep ? (
        <div className="space-y-8">
          {generatedAt && (
            <p className="text-xs text-gray-400">Generated {new Date(generatedAt).toLocaleDateString()}</p>
          )}

          <Section title="Topics to review" items={prep.key_topics} />

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Likely questions</h3>
            <div className="space-y-3">
              {prep.likely_questions.map((q, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-800">{q.question}</p>
                  <p className="text-sm text-gray-500 mt-1">{q.tip}</p>
                </div>
              ))}
            </div>
          </div>

          <Section title="Talking points" items={prep.talking_points} />

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Concerns to address</h3>
            <div className="space-y-3">
              {prep.concerns_to_address.map((c, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4">
                  <p className="text-sm font-medium text-gray-800">{c.potential_concern}</p>
                  <p className="text-sm text-gray-500 mt-1">{c.how_to_address}</p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => generate(true)}
            disabled={generating}
            className="text-xs text-gray-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? 'Regenerating...' : 'Regenerate'}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-gray-600">No interview prep generated yet for this application.</p>
          <button
            onClick={() => generate(false)}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? 'Generating...' : 'Generate Interview Prep'}
          </button>
          {generating && <p className="text-xs text-gray-400 animate-pulse">This may take a moment...</p>}
        </div>
      )}
    </main>
  )
}
