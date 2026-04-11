import { supabase } from '../lib/supabase'
import { getScoringAIProvider } from './ai/provider'
import { JobScoreSchema, JobScore } from './ai/schemas'
import { SCORE_JOB_SYSTEM, scoreJobPrompt } from '../prompts/score-job'
import { parseAIJson } from './ai/parseJson'

export async function scoreJob(jobId: string, userId: string): Promise<JobScore> {
  // Fetch job (must belong to this user)
  const { data: job, error: jobError } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', jobId)
    .eq('user_id', userId)
    .single()

  if (jobError || !job) throw new Error('Job not found')

  // Fetch profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (profileError || !profile) throw new Error('Profile not found')

  // Blocklist pre-filter — skip AI, mark as skipped
  const blocklist: string[] = profile.blocklist_words ?? []
  const description = (job.description_raw ?? '').toLowerCase()
const blocklistHit = blocklist.find(w => description.includes(w.toLowerCase()))
  if (blocklistHit) {
    await supabase.from('jobs').update({ scoring_status: 'skipped' }).eq('id', jobId)
    const err = new Error(`skipped: blocklist match "${blocklistHit}"`)
    ;(err as Error & { code: string }).code = 'skipped'
    throw err
  }

  // Mark pending
  await supabase.from('jobs').update({ scoring_status: 'pending' }).eq('id', jobId)

  const weights = profile.score_weights ?? {
    skills: 30, language: 20, company: 20, location: 15, growth: 15,
  }

  // Resolve active resume version for key_strengths and focus_skills
  const activeVersion = Array.isArray(profile.resume_versions)
    ? (profile.resume_versions as any[]).find(v => v.id === profile.active_resume_version_id) ?? null
    : null
  const keyStrengths: string[] = activeVersion?.key_strengths ?? []
  const focusSkills: string[] = activeVersion?.focus_skills ?? []

  // Call AI
  const ai = getScoringAIProvider()
  let aiRaw: string
  try {
    if (!profile.experience_summary) throw new Error('No resume summary found. Please upload a CV first.')
    const resumeText = profile.experience_summary

    const maxChars = process.env.JOB_DESCRIPTION_MAX_CHARS ? parseInt(process.env.JOB_DESCRIPTION_MAX_CHARS) : undefined
    const rawDescription = job.description_raw ?? ''
    const jobDescription = maxChars ? rawDescription.slice(0, maxChars) : rawDescription

    aiRaw = await ai.complete(SCORE_JOB_SYSTEM, scoreJobPrompt({
      resumeText,
      preferredLanguageEnv: profile.preferred_language_env ?? 'any',
      locationArea: profile.location_area ?? '',
      workStyle: Array.isArray(profile.work_style) ? profile.work_style.join(', ') : '',
      experienceLevel: profile.experience_level ?? 1,
      keyStrengths,
      focusSkills,
      weights,
      jobDescription,
    }))
  } catch (err) {
    await supabase.from('jobs').update({ scoring_status: 'failed' }).eq('id', jobId)
    throw err
  }

  // Parse JSON
  let aiJson: unknown
  try {
    aiJson = parseAIJson(aiRaw)
  } catch {
    await supabase.from('jobs').update({ scoring_status: 'failed' }).eq('id', jobId)
    throw new Error('AI returned invalid JSON')
  }

  // Validate
  const validation = JobScoreSchema.safeParse(aiJson)
  if (!validation.success) {
    await supabase.from('jobs').update({ scoring_status: 'failed' }).eq('id', jobId)
    throw new Error('AI response failed schema validation')
  }

  const result = validation.data

  // Save all score fields back to the job row
  const { error: updateError } = await supabase.from('jobs').update({
    scoring_status: 'scored',
    scored_at: new Date().toISOString(),
    language_env: result.score.language_env_detected,
    ai_score: result.score.total,
    ai_score_breakdown: result.score.breakdown,
    ai_summary: result.score.summary,
    ai_green_flags: result.score.green_flags,
    ai_red_flags: result.score.red_flags,
    ai_recommendation: result.score.recommendation,
    ai_recommendation_reason: result.score.recommendation_reason,
    matched_skills: result.score.matched_skills,
    missing_skills: result.score.missing_skills,
    salary_assessment: result.score.salary_assessment,
    application_effort: result.score.application_effort,
    tech_debt_signal: result.score.tech_debt_signal,
    ats_score: result.ats.ats_score,
    ats_issues: [...result.ats.formatting_issues, ...result.ats.section_header_issues],
    ats_details: result.ats,
    resume_version_used: profile.active_resume_version_id ?? null,
  }).eq('id', jobId)

  if (updateError) {
    throw new Error(`Failed to save score: ${updateError.message}`)
  }

  return result
}
