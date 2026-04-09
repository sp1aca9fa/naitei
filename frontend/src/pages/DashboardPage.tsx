import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CompanyResearchCard } from '../components/CompanyResearchCard'
import { getProfile, getJobs, getApplications } from '../lib/api'
import { LEVEL_LABELS, LEVEL_COLORS } from './ProfileResumePage'

interface DashboardStats {
  totalScored: number
  avgScore: number | null
  topSkillsGap: string[]
  applicationsByStage: Record<string, number>
}

interface ProfileSummary {
  name: string | null
  target_role: string | null
  experience_level: number | null
  active_resume_version_id: string | null
  resume_versions: Array<{ id: string; label: string; created_at: string; cv_analysis?: string }> | null
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

function ResumeCard({ profile }: { profile: ProfileSummary | null }) {
  if (profile === null) return null

  if (!profile.active_resume_version_id) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-start gap-3">
        <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center flex-shrink-0 text-amber-700 font-bold text-sm">!</div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-amber-800">Resume not set up</p>
          <p className="text-xs text-amber-700 mt-0.5">Your resume powers all job scoring and match analysis. Upload it to get started.</p>
          <Link to="/profile/resume" className="text-xs font-medium text-amber-800 underline mt-2 inline-block hover:text-amber-900">Set up resume</Link>
        </div>
      </div>
    )
  }

  const activeVersion = profile.resume_versions?.find(v => v.id === profile.active_resume_version_id)
  const lastUpdated = activeVersion
    ? new Date(activeVersion.created_at).toLocaleDateString(undefined, { dateStyle: 'medium' })
    : null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {profile.name && <span className="text-sm font-semibold text-gray-900">{profile.name}</span>}
            {profile.target_role && <span className="text-sm text-gray-600">{profile.target_role}</span>}
            {profile.experience_level != null && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[profile.experience_level]}`}>
                {LEVEL_LABELS[profile.experience_level]}
              </span>
            )}
          </div>
          {activeVersion?.cv_analysis && (
            <p className="text-xs text-gray-500 italic line-clamp-2">{activeVersion.cv_analysis}</p>
          )}
          {lastUpdated && (
            <p className="text-xs text-gray-400">Resume last updated {lastUpdated}</p>
          )}
        </div>
        <Link to="/profile/resume"
          className="text-xs px-3 py-1.5 border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded-lg font-medium whitespace-nowrap flex-shrink-0 transition-colors">
          Edit
        </Link>
      </div>
    </div>
  )
}

export function DashboardPage() {
  const [credits, setCredits] = useState<number | undefined>(undefined)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)

  useEffect(() => {
    getProfile()
      .then(p => {
        setCredits(p.company_research_credits ?? 0)
        setProfileSummary(p)
      })
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

      <ResumeCard profile={profileSummary} />

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
