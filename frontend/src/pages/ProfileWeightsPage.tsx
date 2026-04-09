import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile } from '@/lib/api'

interface ScoreWeights {
  skills: number
  language: number
  company: number
  location: number
  growth: number
}

const DEFAULT_WEIGHTS: ScoreWeights = { skills: 30, language: 25, company: 20, location: 15, growth: 10 }

export function ProfileWeightsPage() {
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'saved' | 'error' | null>(null)
  const lastSaved = useRef<ScoreWeights | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getProfile()
      .then((p: { score_weights: ScoreWeights | null }) => {
        const w = p.score_weights ?? DEFAULT_WEIGHTS
        lastSaved.current = w
        setWeights(w)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!lastSaved.current) return
    if (JSON.stringify(weights) === JSON.stringify(lastSaved.current)) return
    if (timer.current) clearTimeout(timer.current)
    setSaveStatus(null)
    timer.current = setTimeout(async () => {
      setSaveStatus('saving')
      try {
        await updateProfile({ score_weights: weights })
        lastSaved.current = weights
        setSaveStatus('saved')
        setTimeout(() => setSaveStatus(null), 2000)
      } catch {
        setSaveStatus('error')
      }
    }, 700)
    return () => { if (timer.current) clearTimeout(timer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weights])

  const total = Object.values(weights).reduce((a, b) => a + b, 0)

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Score Weights</h1>
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">Adjust how each category affects your job-fit score.</p>
          </div>
          <div className="flex items-center gap-3">
            {saveStatus === 'saving' && <span className="text-xs text-gray-400">Saving...</span>}
            {saveStatus === 'saved' && <span className="text-xs text-green-600">Saved</span>}
            {saveStatus === 'error' && <span className="text-xs text-red-500">Save failed</span>}
            <span className={`text-sm font-medium ${total === 100 ? 'text-green-600' : 'text-amber-600'}`}>
              Total: {total}/100
            </span>
          </div>
        </div>
        {(Object.entries(weights) as [keyof ScoreWeights, number][]).map(([key, val]) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="capitalize text-gray-700">{key === 'language' ? 'Language / Env' : key}</span>
              <span className="font-mono text-gray-600">{val}</span>
            </div>
            <input
              type="range" min={0} max={100} value={val}
              onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>
        ))}
      </section>
    </div>
  )
}
