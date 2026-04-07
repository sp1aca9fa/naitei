import { useState, useEffect } from 'react'
import { getInsights } from '../lib/api'

interface BucketJob {
  id: string
  title: string
  company: string | null
  ai_score: number
}

interface Insights {
  skillGaps: { skill: string; frequency: number; avg_score: number; impact: number; jobs: BucketJob[] }[]
  demandedSkills: { skill: string; frequency: number }[]
  scoreDistribution: { label: string; count: number; jobs: BucketJob[] }[]
  topCompanies: { company: string; count: number; avg_score: number; jobs: { id: string; title: string; ai_score: number }[] }[]
}

const LEARNING_LINKS: Record<string, string> = {
  'typescript': 'https://www.typescriptlang.org/docs/',
  'react': 'https://react.dev/learn',
  'node.js': 'https://nodejs.org/en/learn',
  'nodejs': 'https://nodejs.org/en/learn',
  'python': 'https://docs.python.org/3/tutorial/',
  'go': 'https://go.dev/learn/',
  'rust': 'https://doc.rust-lang.org/book/',
  'docker': 'https://docs.docker.com/get-started/',
  'kubernetes': 'https://kubernetes.io/docs/tutorials/',
  'aws': 'https://aws.amazon.com/getting-started/',
  'gcp': 'https://cloud.google.com/docs',
  'azure': 'https://learn.microsoft.com/en-us/azure/',
  'terraform': 'https://developer.hashicorp.com/terraform/tutorials',
  'graphql': 'https://graphql.org/learn/',
  'postgresql': 'https://www.postgresql.org/docs/',
  'postgres': 'https://www.postgresql.org/docs/',
  'mysql': 'https://dev.mysql.com/doc/',
  'redis': 'https://redis.io/docs/',
  'java': 'https://dev.java/learn/',
  'kotlin': 'https://kotlinlang.org/docs/getting-started.html',
  'swift': 'https://swift.org/documentation/',
  'vue': 'https://vuejs.org/guide/introduction.html',
  'vue.js': 'https://vuejs.org/guide/introduction.html',
  'angular': 'https://angular.dev/tutorials',
  'next.js': 'https://nextjs.org/docs',
  'nextjs': 'https://nextjs.org/docs',
  'django': 'https://docs.djangoproject.com/en/stable/intro/',
  'fastapi': 'https://fastapi.tiangolo.com/tutorial/',
  'spring': 'https://spring.io/guides',
  'git': 'https://git-scm.com/book/en/v2',
  'linux': 'https://linuxjourney.com/',
  'ruby': 'https://www.ruby-lang.org/en/documentation/',
  'rails': 'https://guides.rubyonrails.org/',
  'scala': 'https://docs.scala-lang.org/',
  'elixir': 'https://elixir-lang.org/getting-started/introduction.html',
  'flutter': 'https://docs.flutter.dev/',
  'react native': 'https://reactnative.dev/docs/getting-started',
}

function learnLink(skill: string): string | null {
  const key = skill.toLowerCase()
  if (LEARNING_LINKS[key]) return LEARNING_LINKS[key]
  for (const [k, v] of Object.entries(LEARNING_LINKS)) {
    if (key.includes(k) || k.includes(key)) return v
  }
  return null
}

function scoreColor(score: number) {
  if (score >= 75) return 'text-green-600'
  if (score >= 50) return 'text-yellow-600'
  return 'text-red-500'
}

const IMPACT_TOOLTIP = `How much learning this skill could move the needle on your job search.

Formula:
  score_factor = max(0, avg_match - 30)² / 4900
  freq_factor  = job_count ^ 0.75
  impact       = score_factor × freq_factor × 10

score_factor is quadratic — skills with a low average match score (below ~50) are penalised heavily, since those jobs are a stretch regardless. freq_factor grows super-linearly — a skill required by 10 jobs counts for significantly more than one required by 2.

Result is roughly 0–100. Higher = more likely to open doors.`

type SkillSortKey = 'frequency' | 'avg_score' | 'impact'
type CompanySortKey = 'count' | 'avg_score'

export function InsightsPage() {
  const [insights, setInsights] = useState<Insights | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hoveredBucket, setHoveredBucket] = useState<string | null>(null)
  const [hoveredSkill, setHoveredSkill] = useState<string | null>(null)
  const [skillSort, setSkillSort] = useState<SkillSortKey>('frequency')
  const [companySort, setCompanySort] = useState<CompanySortKey>('count')
  const [hoveredCompany, setHoveredCompany] = useState<string | null>(null)

  function toggleSort(key: SkillSortKey) {
    setSkillSort(key)
  }

  useEffect(() => {
    getInsights()
      .then(setInsights)
      .catch(e => setError(e.message))
  }, [])

  const maxDist = insights
    ? Math.max(...insights.scoreDistribution.map(b => b.count), 1)
    : 1

  const maxImpact = insights
    ? Math.max(...insights.skillGaps.map(s => s.impact), 1)
    : 1

  if (error) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-12">
        <p className="text-red-500 text-sm">{error}</p>
      </main>
    )
  }

  return (
    <main className="max-w-3xl mx-auto px-6 py-12 space-y-10">
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Insights</h2>
        <p className="text-sm text-gray-400">Aggregated from your scored jobs. No AI — pure data.</p>
      </div>

      {/* Skill Gap Tracker */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Skill Gap Tracker</h3>
        {!insights ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : insights.skillGaps.length === 0 ? (
          <p className="text-sm text-gray-400">No data yet. Score some jobs first.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wide">Skill</th>
                  {(['frequency', 'avg_score', 'impact'] as SkillSortKey[]).map(key => {
                    const labels: Record<SkillSortKey, string> = { frequency: 'Jobs', avg_score: 'Avg match', impact: 'Impact' }
                    const active = skillSort === key
                    return key === 'impact' ? (
                      <th key={key} className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wide">
                        <span className="relative group inline-flex items-center justify-center gap-1">
                          <button
                            onClick={() => toggleSort('impact')}
                            className={`uppercase tracking-wide ${active ? 'text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                          >
                            Impact{active && ' ↓'}
                          </button>
                          <span className="text-gray-300 hover:text-gray-500 cursor-default">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 2a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm0 3.5c.55 0 1 .45 1 1V11a1 1 0 0 1-2 0V7.5c0-.55.45-1 1-1z"/>
                            </svg>
                          </span>
                          <span className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-72 bg-gray-900 text-white text-xs rounded-lg p-3 opacity-0 group-hover:opacity-100 pointer-events-none z-20 whitespace-pre-line leading-relaxed font-normal normal-case tracking-normal text-left">
                            {IMPACT_TOOLTIP}
                          </span>
                        </span>
                      </th>
                    ) : (
                      <th key={key} className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wide">
                        <button
                          onClick={() => toggleSort(key)}
                          className={`uppercase tracking-wide ${active ? 'text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          {labels[key]}{active && ' ↓'}
                        </button>
                      </th>
                    )
                  })}
                  <th className="text-center px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wide">Learn</th>
                </tr>
              </thead>
              <tbody>
                {[...insights.skillGaps].sort((a, b) => b[skillSort] - a[skillSort]).map(({ skill, frequency, avg_score, impact, jobs: skillJobs }, i) => {
                  const link = learnLink(skill)
                  return (
                    <tr
                      key={skill}
                      className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} relative`}
                      onMouseEnter={() => setHoveredSkill(skill)}
                      onMouseLeave={() => setHoveredSkill(null)}
                    >
                      <td className="px-4 py-2.5 font-medium text-gray-800 relative">
                        {skill}
                        {hoveredSkill === skill && skillJobs.length > 0 && (
                          <div className="absolute left-0 top-full mt-0.5 z-10 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                            <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
                              {frequency} job{frequency !== 1 ? 's' : ''} missing {skill}
                              {frequency > 10 ? ' (top 10 shown)' : ''}
                            </p>
                            <ul className="space-y-1.5">
                              {skillJobs.map(j => (
                                <li key={j.id} className="flex items-start gap-2">
                                  <span className={`text-xs font-semibold shrink-0 mt-0.5 ${scoreColor(j.ai_score)}`}>
                                    {j.ai_score}%
                                  </span>
                                  <span className="text-xs text-gray-700 leading-tight">
                                    {j.title}
                                    {j.company && <span className="text-gray-400"> — {j.company}</span>}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-center text-gray-600">{frequency}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className="text-xs text-gray-400">{avg_score}%</span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`text-xs font-semibold ${
                          impact >= maxImpact * 0.7 ? 'text-green-600' :
                          impact >= maxImpact * 0.35 ? 'text-yellow-600' :
                          'text-gray-400'
                        }`}>
                          {impact}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-center">
                        {link ? (
                          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-xs">
                            Learn
                          </a>
                        ) : (
                          <a
                            href={`https://www.coursera.org/search?query=${encodeURIComponent(skill)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-gray-400 hover:text-blue-600 text-xs"
                          >
                            Search
                          </a>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Score Distribution + Most Demanded */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Match Score Distribution */}
        <div>
          <h3 className="text-base font-semibold text-gray-800 mb-3">Match Score Distribution</h3>
          {!insights ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              {insights.scoreDistribution.map(({ label, count, jobs: bucketJobs }) => (
                <div
                  key={label}
                  className="relative flex items-center gap-3 cursor-default"
                  onMouseEnter={() => count > 0 && setHoveredBucket(label)}
                  onMouseLeave={() => setHoveredBucket(null)}
                >
                  <span className="text-xs text-gray-500 w-14 shrink-0">{label}</span>
                  <div className="flex-1 bg-gray-100 rounded-full h-2">
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all"
                      style={{ width: count === 0 ? '0%' : `${Math.max(4, Math.round((count / maxDist) * 100))}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-600 w-6 text-right">{count}</span>

                  {hoveredBucket === label && bucketJobs.length > 0 && (
                    <div className="absolute left-0 top-full mt-1 z-10 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                      <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
                        {label} — {count} job{count !== 1 ? 's' : ''}
                        {count > 10 ? ' (top 10 shown)' : ''}
                      </p>
                      <ul className="space-y-1.5">
                        {bucketJobs.map(j => (
                          <li key={j.id} className="flex items-start gap-2">
                            <span className="text-xs font-semibold text-blue-600 shrink-0 mt-0.5">{j.ai_score}%</span>
                            <span className="text-xs text-gray-700 leading-tight">
                              {j.title}
                              {j.company && <span className="text-gray-400"> — {j.company}</span>}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Most Demanded Skills */}
        <div>
          <h3 className="text-base font-semibold text-gray-800 mb-3">Most Demanded Skills</h3>
          {!insights ? (
            <p className="text-sm text-gray-400">Loading...</p>
          ) : insights.demandedSkills.length === 0 ? (
            <p className="text-sm text-gray-400">No data yet.</p>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex flex-wrap gap-2">
                {insights.demandedSkills.slice(0, 20).map(({ skill, frequency }) => (
                  <span
                    key={skill}
                    className="inline-flex items-center gap-1 text-xs bg-blue-50 text-blue-700 border border-blue-200 rounded-full px-2.5 py-1"
                  >
                    {skill}
                    <span className="text-blue-400 font-medium">{frequency}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Top Companies Hiring */}
      <section>
        <h3 className="text-base font-semibold text-gray-800 mb-3">Companies Hiring Most</h3>
        {!insights ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : insights.topCompanies.length === 0 ? (
          <p className="text-sm text-gray-400">No data yet.</p>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left px-4 py-2.5 text-xs text-gray-400 font-medium uppercase tracking-wide">Company</th>
                  {(['count', 'avg_score'] as CompanySortKey[]).map(key => {
                    const labels: Record<CompanySortKey, string> = { count: 'Jobs', avg_score: 'Avg Match' }
                    const active = companySort === key
                    return (
                      <th key={key} className="text-center px-4 py-2.5 text-xs font-medium uppercase tracking-wide">
                        <button
                          onClick={() => setCompanySort(key)}
                          className={`uppercase tracking-wide ${active ? 'text-gray-800' : 'text-gray-400 hover:text-gray-600'}`}
                        >
                          {labels[key]}{active && ' ↓'}
                        </button>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {[...insights.topCompanies].sort((a, b) => b[companySort] - a[companySort]).map(({ company, count, avg_score, jobs: companyJobs }, i) => (
                  <tr
                    key={company}
                    className={`${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'} relative`}
                    onMouseEnter={() => setHoveredCompany(company)}
                    onMouseLeave={() => setHoveredCompany(null)}
                  >
                    <td className="px-4 py-2.5 font-medium text-gray-800 relative">
                      {company}
                      {hoveredCompany === company && companyJobs.length > 0 && (
                        <div className="absolute left-0 top-full mt-0.5 z-10 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3">
                          <p className="text-xs text-gray-400 mb-2 font-medium uppercase tracking-wide">
                            {count} job{count !== 1 ? 's' : ''} at {company}
                            {count > 10 ? ' (top 10 shown)' : ''}
                          </p>
                          <ul className="space-y-1.5">
                            {companyJobs.map(j => (
                              <li key={j.id} className="flex items-start gap-2">
                                <span className={`text-xs font-semibold shrink-0 mt-0.5 ${scoreColor(j.ai_score)}`}>
                                  {j.ai_score}%
                                </span>
                                <span className="text-xs text-gray-700 leading-tight">{j.title}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center text-gray-600">{count}</td>
                    <td className={`px-4 py-2.5 text-center font-semibold ${scoreColor(avg_score)}`}>
                      {avg_score}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  )
}
