import { useState, useEffect } from 'react'
import { CompanyResearchCard } from '../components/CompanyResearchCard'
import { getProfile, getJobs, getApplications } from '../lib/api'

interface DashboardStats {
  totalScored: number
  avgScore: number | null
  topSkillsGap: string[]
  applicationsByStage: Record<string, number>
}

function computeStats(jobs: any[], applications: any[]): DashboardStats {
  const scored = jobs.filter(j => j.scoring_status === 'scored')
  const totalScored = scored.length

  const avgScore = scored.length > 0
    ? Math.round(scored.reduce((sum, j) => sum + (j.ai_score ?? 0), 0) / scored.length)
    : null

  const skillFreq: Record<string, number> = {}
  for (const job of scored) {
    const skills: string[] = job.missing_skills ?? []
    for (const s of skills) {
      skillFreq[s] = (skillFreq[s] ?? 0) + 1
    }
  }
  const topSkillsGap = Object.entries(skillFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([skill]) => skill)

  const stages = ['saved', 'applied', 'interview', 'offer']
  const applicationsByStage: Record<string, number> = {}
  for (const stage of stages) {
    applicationsByStage[stage] = applications.filter(a => a.status === stage).length
  }

  return { totalScored, avgScore, topSkillsGap, applicationsByStage }
}

function scoreColor(score: number) {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-500'
}

export function DashboardPage() {
  const [credits, setCredits] = useState<number | undefined>(undefined)
  const [stats, setStats] = useState<DashboardStats | null>(null)

  useEffect(() => {
    getProfile()
      .then(p => setCredits(p.company_research_credits ?? 0))
      .catch(() => setCredits(0))

    Promise.all([getJobs(), getApplications()])
      .then(([jobs, apps]) => setStats(computeStats(jobs, apps)))
      .catch(() => {})
  }, [])

  const stages = ['saved', 'applied', 'interview', 'offer']
  const stageLabels: Record<string, string> = {
    saved: 'Saved',
    applied: 'Applied',
    interview: 'Interview',
    offer: 'Offer',
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h2>
        <p className="text-sm text-gray-400">Your job search at a glance.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Total analyzed */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Jobs Analyzed</p>
          <p className="text-3xl font-bold text-gray-900">
            {stats ? stats.totalScored : <span className="text-gray-300">--</span>}
          </p>
        </div>

        {/* Avg score */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Avg Match Score</p>
          <p className={`text-3xl font-bold ${stats?.avgScore != null ? scoreColor(stats.avgScore) : 'text-gray-300'}`}>
            {stats?.avgScore != null ? `${stats.avgScore}%` : '--'}
          </p>
        </div>

        {/* Applications by stage */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Applications by Stage</p>
          {stats ? (
            <div className="space-y-1">
              {stages.map(stage => (
                <div key={stage} className="flex justify-between items-center text-sm">
                  <span className="text-gray-600">{stageLabels[stage]}</span>
                  <span className="font-semibold text-gray-900">{stats.applicationsByStage[stage]}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-300 text-sm">Loading...</p>
          )}
        </div>

        {/* Top skills gap */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-3">Top Skills Gap</p>
          {stats ? (
            stats.topSkillsGap.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {stats.topSkillsGap.map(skill => (
                  <span key={skill} className="text-xs bg-red-50 text-red-600 border border-red-200 rounded-full px-2 py-0.5">
                    {skill}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400">No data yet</p>
            )
          ) : (
            <p className="text-gray-300 text-sm">Loading...</p>
          )}
        </div>
      </div>

      <CompanyResearchCard credits={credits} />
    </main>
  )
}
