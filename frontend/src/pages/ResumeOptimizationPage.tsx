import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getApplication, generateResumeOptimization } from '../lib/api'

interface ResumeOptimization {
  verdict: 'strong' | 'needs_tweaks' | 'major_overhaul'
  summary: string
  improvements: { area: string; issue: string; suggestion: string; rewrite?: string | null }[]
  priority_actions: string[]
}

const VERDICT_STYLE: Record<string, string> = {
  strong: 'bg-green-50 text-green-700 border-green-200',
  needs_tweaks: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  major_overhaul: 'bg-red-50 text-red-600 border-red-200',
}

export function ResumeOptimizationPage() {
  const { t, i18n } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [jobTitle, setJobTitle] = useState<string>('')
  const [company, setCompany] = useState<string>('')
  const [optimization, setOptimization] = useState<ResumeOptimization | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dateLocale = i18n.language.startsWith('ja') ? 'ja-JP' : undefined

  const verdictLabel: Record<string, string> = {
    strong: t('optimizations.verdictStrong'),
    needs_tweaks: t('optimizations.verdictNeedsTweaks'),
    major_overhaul: t('optimizations.verdictMajorOverhaul'),
  }

  useEffect(() => {
    if (!id) return
    getApplication(id)
      .then((app: any) => {
        setJobTitle(app.jobs?.title ?? 'Untitled')
        setCompany(app.jobs?.company ?? '')
        if (app.resume_optimization) {
          setOptimization(app.resume_optimization)
          setGeneratedAt(app.resume_optimization_generated_at)
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
      const result = await generateResumeOptimization(id, force)
      setOptimization(result)
      setGeneratedAt(new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : t('common.error'))
    } finally {
      setGenerating(false)
    }
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-10">
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <Link to="/optimizations" className="text-xs text-gray-400 hover:text-gray-600">{t('optimizations.backLink')}</Link>
          <Link to={`/applications?expand=${id}`} className="text-xs px-2.5 py-1 border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors">{t('optimizations.openApplication')}</Link>
        </div>
        <h2 className="text-2xl font-bold text-gray-900 mt-2">{t('optimizations.pageTitle')}</h2>
        {(jobTitle || company) && (
          <p className="text-sm text-gray-500 mt-0.5">
            {jobTitle}{company ? ` — ${company}` : ''}
          </p>
        )}
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">{t('common.loading')}</p>
      ) : optimization ? (
        <div className="space-y-8">
          <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
            <div className="flex items-center gap-3">
              <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${VERDICT_STYLE[optimization.verdict]}`}>
                {verdictLabel[optimization.verdict]}
              </span>
              {generatedAt && (
                <span className="text-xs text-gray-400">
                  {t('optimizations.generatedAt', { date: new Date(generatedAt).toLocaleDateString(dateLocale) })}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{optimization.summary}</p>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{t('optimizations.priorityActions')}</h3>
            <ol className="space-y-2">
              {optimization.priority_actions.map((action, i) => (
                <li key={i} className="flex gap-3 text-sm text-gray-700">
                  <span className="shrink-0 w-5 h-5 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center font-semibold mt-0.5">{i + 1}</span>
                  {action}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
              {t('optimizations.improvements', { count: optimization.improvements.length })}
            </h3>
            <div className="space-y-4">
              {optimization.improvements.map((imp, i) => (
                <div key={i} className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                  <p className="text-sm font-semibold text-gray-800">{imp.area}</p>
                  <p className="text-sm text-red-600">{imp.issue}</p>
                  <p className="text-sm text-gray-600">{imp.suggestion}</p>
                  {imp.rewrite && (
                    <div className="mt-2 bg-green-50 border border-green-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-green-700 mb-1">{t('optimizations.suggestedRewrite')}</p>
                      <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{imp.rewrite}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => generate(true)}
            disabled={generating}
            className="text-xs text-gray-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? t('common.regenerating') : t('common.regenerate')}
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center space-y-3">
          <p className="text-sm text-gray-600">{t('optimizations.noOptimization')}</p>
          <button
            onClick={() => generate(false)}
            disabled={generating}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? t('optimizations.analyzing') : t('optimizations.analyzeAndOptimize')}
          </button>
          {generating && (
            <p className="text-xs text-gray-400 animate-pulse">{t('common.thisMayTakeAMoment')}</p>
          )}
        </div>
      )}
    </main>
  )
}
