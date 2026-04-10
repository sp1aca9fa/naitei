import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { CompanyResearchCard } from '../components/CompanyResearchCard'
import { getProfile, getJobs, getApplications, getInsights } from '../lib/api'
import { LEVEL_LABELS, LEVEL_COLORS } from './ProfileResumePage'

// --- Interfaces ---

interface JobMatch {
  id: string
  title: string
  company: string | null
  ai_score: number
}

interface FollowUpItem {
  id: string
  jobTitle: string
  company: string | null
  daysSince: number
}

interface PrepNeededItem {
  id: string
  jobTitle: string
  company: string | null
}

interface DashboardStats {
  topUnappliedMatches: JobMatch[]
  applicationsByStage: Record<string, number>
  weeklyStats: { analyzed: number; applied: number; interviews: number }
  followUpNeeded: FollowUpItem[]
  interviewPrepNeeded: PrepNeededItem[]
}

interface SkillGap {
  skill: string
  frequency: number
  avg_score: number
  impact: number
}

interface ProfileSummary {
  name: string | null
  target_role: string | null
  experience_level: number | null
  active_resume_version_id: string | null
  resume_versions: Array<{
    id: string; label: string; created_at: string; cv_analysis?: string
    key_strengths?: string[]; focus_skills?: string[]
  }> | null
}

// --- Helpers ---

function computeStats(jobs: any[], applications: any[]): DashboardStats {
  const now = new Date()
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

  const appliedJobIds = new Set(
    applications
      .filter(a => ['applied', 'interview', 'offer'].includes(a.status))
      .map(a => a.job_id)
  )

  const topUnappliedMatches = jobs
    .filter(j => j.scoring_status === 'scored' && j.ai_score != null && !appliedJobIds.has(j.id))
    .sort((a, b) => b.ai_score - a.ai_score)
    .slice(0, 3)
    .map(j => ({ id: j.id, title: j.title, company: j.company ?? null, ai_score: j.ai_score }))

  const weeklyStats = {
    analyzed: jobs.filter(j => j.scored_at && new Date(j.scored_at) >= oneWeekAgo).length,
    applied: applications.filter(a => a.applied_at && new Date(a.applied_at) >= oneWeekAgo).length,
    interviews: applications.filter(a => a.status === 'interview' && a.updated_at && new Date(a.updated_at) >= oneWeekAgo).length,
  }

  const stageList = ['saved', 'applied', 'interview', 'offer']
  const applicationsByStage: Record<string, number> = {}
  for (const stage of stageList) {
    applicationsByStage[stage] = applications.filter(a => a.status === stage).length
  }

  const followUpNeeded = applications
    .filter(a => a.status === 'applied' && a.applied_at && new Date(a.applied_at) <= twoWeeksAgo)
    .map(a => ({
      id: a.id,
      jobTitle: (a.jobs as any)?.title ?? 'Unknown job',
      company: (a.jobs as any)?.company ?? null,
      daysSince: Math.floor((now.getTime() - new Date(a.applied_at).getTime()) / (1000 * 60 * 60 * 24)),
    }))
    .sort((a, b) => b.daysSince - a.daysSince)

  const interviewPrepNeeded = applications
    .filter(a => a.status === 'interview' && !a.interview_prep_generated_at)
    .map(a => ({
      id: a.id,
      jobTitle: (a.jobs as any)?.title ?? 'Unknown job',
      company: (a.jobs as any)?.company ?? null,
    }))

  return { topUnappliedMatches, applicationsByStage, weeklyStats, followUpNeeded, interviewPrepNeeded }
}

function scoreColor(score: number) {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-500'
}

function scoreBadge(score: number) {
  if (score >= 75) return 'bg-green-50 text-green-700 border-green-200'
  if (score >= 50) return 'bg-yellow-50 text-yellow-700 border-yellow-200'
  return 'bg-red-50 text-red-600 border-red-200'
}

// --- ResumeCard ---

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
          {lastUpdated && (
            <div className="flex gap-2 items-end">
              <p className="text-sm font-semibold text-gray-600 uppercase tracking-wide leading-none">Resume</p>
              <span className="text-xs text-gray-400 italic leading-none">last updated {lastUpdated}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {profile.target_role && <span className="text-sm text-gray-600">{profile.target_role}</span>}
            {profile.experience_level != null && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[profile.experience_level]}`}>
                {LEVEL_LABELS[profile.experience_level]}
              </span>
            )}
          </div>
          {activeVersion?.cv_analysis && (
            <p className="text-xs text-gray-500 italic">{activeVersion.cv_analysis}</p>
          )}
        </div>
        <Link to="/profile/resume"
          className="text-xs px-3 py-1.5 border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded-lg font-medium whitespace-nowrap flex-shrink-0 transition-colors">
          Edit
        </Link>
      </div>
      {(activeVersion?.key_strengths?.length || activeVersion?.focus_skills?.length) ? (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          {activeVersion?.key_strengths && activeVersion.key_strengths.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Key Strengths</p>
                <span className="relative group">
                  <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center cursor-help font-medium select-none">?</span>
                  <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 w-64 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
                    The skills you're most experienced in. The AI uses these to assess how well your background fits a role, regardless of where you want to take your career.
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeVersion.key_strengths.map(name => (
                  <span key={name} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5">{name}</span>
                ))}
              </div>
            </div>
          )}
          {activeVersion?.focus_skills && activeVersion.focus_skills.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Focus Skills</p>
                <span className="relative group">
                  <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center cursor-help font-medium select-none">?</span>
                  <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 w-72 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
                    Skills you want to build your career around going forward. Even if you're stronger elsewhere, the AI will favor jobs that put these to use. Great for signaling a stack transition -- for example, strong in Ruby on Rails but want to move to JavaScript.
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {activeVersion.focus_skills.map(name => (
                  <span key={name} className="flex items-center gap-1 text-xs bg-teal-50 text-teal-800 border border-teal-200 rounded-full px-2.5 py-0.5">
                    <span className="text-teal-400 text-sm leading-none">★</span>{name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="mt-2">
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Key Strengths</p>
        </div>
      )}
    </div>
  )
}

// --- DashboardPage ---

export function DashboardPage() {
  const [credits, setCredits] = useState<number | undefined>(undefined)
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [profileSummary, setProfileSummary] = useState<ProfileSummary | null>(null)
  const [skillGaps, setSkillGaps] = useState<SkillGap[] | null>(null)

  useEffect(() => {
    Promise.all([
      getProfile(),
      getJobs(),
      getApplications(),
      getInsights().catch(() => null),
    ]).then(([profile, jobs, apps, insights]) => {
      setCredits(profile.company_research_credits ?? 0)
      setProfileSummary(profile)
      setStats(computeStats(jobs, apps))
      if (insights) setSkillGaps(insights.skillGaps.slice(0, 3))
    }).catch(() => {})
  }, [])

  const stageList = ['saved', 'applied', 'interview', 'offer']
  const stageLabels: Record<string, string> = { saved: 'Saved', applied: 'Applied', interview: 'Interview', offer: 'Offer' }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Dashboard</h2>
        <p className="text-sm text-gray-400">Your job search at a glance.</p>
      </div>

      <ResumeCard profile={profileSummary} />

      {/* Action alerts — only render when there's something to flag */}
      {stats && (stats.followUpNeeded.length > 0 || stats.interviewPrepNeeded.length > 0) && (
        <div className="space-y-2">
          {stats.followUpNeeded.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-orange-200 flex items-center justify-center flex-shrink-0 text-orange-700 font-bold text-xs mt-0.5">!</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-orange-800">
                  {stats.followUpNeeded.length} application{stats.followUpNeeded.length !== 1 ? 's' : ''} may need a follow-up
                </p>
                <div className="mt-1 space-y-0.5">
                  {stats.followUpNeeded.slice(0, 2).map(item => (
                    <p key={item.id} className="text-xs text-orange-700">
                      <Link to="/applications" className="font-medium hover:underline">{item.jobTitle}</Link>
                      {item.company && <span> at {item.company}</span>}
                      <span className="text-orange-500"> — {item.daysSince} days ago</span>
                    </p>
                  ))}
                  {stats.followUpNeeded.length > 2 && (
                    <Link to="/applications" className="text-xs text-orange-600 underline">
                      +{stats.followUpNeeded.length - 2} more
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}
          {stats.interviewPrepNeeded.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-blue-200 flex items-center justify-center flex-shrink-0 text-blue-700 font-bold text-xs mt-0.5">i</div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-blue-800">
                  {stats.interviewPrepNeeded.length} interview{stats.interviewPrepNeeded.length !== 1 ? 's' : ''} without prep started
                </p>
                <div className="mt-1 space-y-0.5">
                  {stats.interviewPrepNeeded.map(item => (
                    <p key={item.id} className="text-xs text-blue-700">
                      <Link to="/applications" className="font-medium hover:underline">{item.jobTitle}</Link>
                      {item.company && <span> at {item.company}</span>}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Top unapplied matches */}
      <div className="bg-white border border-gray-200 rounded-xl p-5">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Top Matches to Apply</p>
        {!stats ? (
          <p className="text-sm text-gray-300">Loading...</p>
        ) : stats.topUnappliedMatches.length === 0 ? (
          <p className="text-sm text-gray-400">
            No strong matches pending —{' '}
            <Link to="/jobs" className="underline hover:text-gray-600">import or analyze more jobs</Link>.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {stats.topUnappliedMatches.map((job, i) => (
              <div key={job.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                <span className="text-xs text-gray-300 w-4 flex-shrink-0 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link to={`/jobs/${job.id}`} className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block">
                    {job.title}
                  </Link>
                  {job.company && <p className="text-xs text-gray-400 truncate">{job.company}</p>}
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${scoreBadge(job.ai_score)}`}>
                  {job.ai_score}%
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* This week + Pipeline */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">This Week</p>
          {!stats ? (
            <p className="text-sm text-gray-300">Loading...</p>
          ) : (
            <div className="space-y-3">
              {([
                { label: 'Analyzed', value: stats.weeklyStats.analyzed },
                { label: 'Applied', value: stats.weeklyStats.applied },
                { label: 'Interviews', value: stats.weeklyStats.interviews },
              ] as const).map(({ label, value }) => (
                <div key={label} className="flex items-baseline justify-between">
                  <span className="text-xs text-gray-500">{label}</span>
                  <span className="text-2xl font-bold text-gray-900">{value}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-4">Pipeline</p>
          {!stats ? (
            <p className="text-sm text-gray-300">Loading...</p>
          ) : (
            <div className="space-y-2.5">
              {(() => {
                const maxCount = Math.max(...stageList.map(s => stats.applicationsByStage[s] ?? 0), 1)
                return stageList.map(stage => {
                  const count = stats.applicationsByStage[stage] ?? 0
                  return (
                    <div key={stage} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16 flex-shrink-0">{stageLabels[stage]}</span>
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-400 rounded-full" style={{ width: `${Math.round((count / maxCount) * 100)}%` }} />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-4 text-right">{count}</span>
                    </div>
                  )
                })
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Top skill gaps — only when insights data is available */}
      {skillGaps && skillGaps.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Top Skill Gaps</p>
            <Link to="/insights" className="text-xs text-blue-500 hover:text-blue-700">Full analysis →</Link>
          </div>
          <div className="grid grid-cols-3 gap-6">
            {skillGaps.map(gap => (
              <div key={gap.skill} className="space-y-2">
                <p className="text-sm font-semibold text-gray-800 truncate" title={gap.skill}>{gap.skill}</p>
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Required by</span>
                    <span className="font-medium text-gray-700">{gap.frequency} job{gap.frequency !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Avg match</span>
                    <span className={`font-medium ${scoreColor(gap.avg_score)}`}>{gap.avg_score}%</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-gray-400">Impact</span>
                    <span className="font-semibold text-purple-600">{gap.impact}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <CompanyResearchCard credits={credits} />
    </main>
  )
}
