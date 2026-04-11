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

  // Resolve active resume version for key_strengths, focus_skills, and raw text
  const activeVersion = Array.isArray(profile.resume_versions)
    ? (profile.resume_versions as any[]).find(v => v.id === profile.active_resume_version_id) ?? null
    : null
  const keyStrengths: string[] = activeVersion?.key_strengths ?? []
  const focusSkills: string[] = activeVersion?.focus_skills ?? []
  // activeVersion.text reflects any in-app edits; raw_resume_text is always the original upload.
  // They're set together on upload, so if experience_summary exists this should too.
  const rawResumeText: string | null = activeVersion?.text ?? profile.raw_resume_text ?? null
  if (!rawResumeText) {
    console.warn('[scoreJob] raw_resume_text missing for user', userId, '— ATS scoring will be skipped')
  }

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
      rawResumeText,
      preferredLanguageEnv: profile.preferred_language_env ?? 'any',
      locationArea: profile.location_area ?? '',
      workStyle: Array.isArray(profile.work_style) ? profile.work_style.join(', ') : '',
      experienceLevel: profile.experience_level ?? 1,
      keyStrengths,
      focusSkills,
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
    console.error('[scoreJob] JSON parse failed. Raw response (first 500 chars):', aiRaw.slice(0, 500))
    await supabase.from('jobs').update({ scoring_status: 'failed' }).eq('id', jobId)
    throw new Error('AI returned invalid JSON')
  }

  // Validate
  const validation = JobScoreSchema.safeParse(aiJson)
  if (!validation.success) {
    console.error('[scoreJob] schema validation failed:', JSON.stringify(validation.error.errors, null, 2))
    console.error('[scoreJob] parsed AI JSON:', JSON.stringify(aiJson, null, 2).slice(0, 1000))
    await supabase.from('jobs').update({ scoring_status: 'failed' }).eq('id', jobId)
    throw new Error('AI response failed schema validation')
  }

  const rawResult = validation.data

  // Remove from missing_skills any skill confirmed present via key_strengths or focus_skills.
  // Gemini occasionally lists skills the user has as missing — this is a deterministic safeguard.
  const ownedSkillsLower = new Set([
    ...keyStrengths.map(s => s.toLowerCase()),
    ...focusSkills.map(s => s.toLowerCase()),
  ])
  const result = ownedSkillsLower.size > 0
    ? { ...rawResult, fit: { ...rawResult.fit, missing_skills: rawResult.fit.missing_skills.filter(s => !ownedSkillsLower.has(s.toLowerCase())) } }
    : rawResult

  // Save all score fields back to the job row
  const { error: updateError } = await supabase.from('jobs').update({
    scoring_status: 'scored',
    scored_at: new Date().toISOString(),
    // Fit score — technical qualification (maps to ai_score for cards/filtering/dashboard)
    ai_score: result.fit.score,
    ai_score_breakdown: {
      skills_match: result.fit.skills_match,
      seniority_match: result.fit.seniority_match,
      experience_relevance: result.fit.experience_relevance,
    },
    ai_summary: result.fit.summary,
    ai_green_flags: result.fit.green_flags,
    ai_red_flags: result.fit.red_flags,
    matched_skills: result.fit.matched_skills,
    missing_skills: result.fit.missing_skills,
    ai_recommendation: result.fit.recommendation,
    ai_recommendation_reason: result.fit.recommendation_reason,
    salary_assessment: result.fit.salary_assessment,
    application_effort: result.fit.application_effort,
    tech_debt_signal: result.fit.tech_debt_signal,
    language_env: result.fit.language_env_detected,
    // ATS score — keyword screening from raw CV
    ats_score: result.ats?.score ?? null,
    ats_issues: result.ats?.improvements ?? [],
    ats_details: result.ats ?? { skipped: true, reason: 'no_raw_resume' },
    resume_version_used: profile.active_resume_version_id ?? null,
  }).eq('id', jobId)

  if (updateError) {
    throw new Error(`Failed to save score: ${updateError.message}`)
  }

  return result
}
