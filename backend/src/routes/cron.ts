import { Router, Request, Response } from 'express'
import axios from 'axios'
import * as cheerio from 'cheerio'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'
import { scoreJob } from '../services/scoreJob'

const router = Router()

const APP_URL = process.env.FRONTEND_URL || 'http://localhost:5173'

function verifyCronSecret(req: Request, res: Response): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    // No secret configured — only allow in development
    if (process.env.NODE_ENV === 'production') {
      res.status(401).json({ error: 'CRON_SECRET not configured' })
      return false
    }
    return true
  }
  const auth = req.headers.authorization
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}

function followUpTemplate(status: 'applied' | 'interview', title: string, company: string | null): string {
  const position = company ? `${title} at ${company}` : title
  if (status === 'interview') {
    return `Subject: Thank you — ${title} interview${company ? ` at ${company}` : ''}

Hi [Name],

Thank you for taking the time to meet with me regarding the ${position} role. I really enjoyed our conversation and learning more about the team and the opportunity.

I wanted to follow up to see if there are any updates on the next steps, and to reiterate my strong interest in joining ${company ?? 'your team'}.

Please don't hesitate to reach out if you need any additional information from me.

Best regards,
[Your name]`
  }
  return `Subject: Following up — ${title} application${company ? ` at ${company}` : ''}

Hi [Hiring Manager],

I hope you're doing well. I'm writing to follow up on my application for the ${position} role, which I submitted ${company ? `to ${company} ` : ''}a little while ago.

I remain very enthusiastic about this opportunity and would love to hear if there are any updates or next steps.

Thank you for your time and consideration.

Best regards,
[Your name]`
}

type AppEntry = { title: string; company: string | null; days: number }

function savedSection(apps: AppEntry[]): string {
  const rows = apps.map(a => `
    <div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #f5f5f5;">
      <strong style="color:#111;font-size:14px;">${a.title}</strong>
      ${a.company ? `<span style="color:#666;font-size:13px;"> — ${a.company}</span>` : ''}
      <br>
      <span style="color:#999;font-size:12px;">Saved ${a.days} day${a.days !== 1 ? 's' : ''} ago with no action</span>
    </div>`).join('')
  return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:14px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;">Saved — no action taken</h2>
      ${rows}
    </div>`
}

function templateSection(status: 'applied' | 'interview', apps: AppEntry[]): string {
  const label = status === 'interview' ? 'Interview — pending follow-up' : 'Applied — pending follow-up'
  const blocks = apps.map(a => {
    const template = followUpTemplate(status, a.title, a.company)
    return `
    <div style="margin-bottom:20px;">
      <div style="margin-bottom:8px;">
        <strong style="color:#111;font-size:14px;">${a.title}</strong>
        ${a.company ? `<span style="color:#666;font-size:13px;"> — ${a.company}</span>` : ''}
        <span style="color:#999;font-size:12px;margin-left:8px;">No update for ${a.days} day${a.days !== 1 ? 's' : ''}</span>
      </div>
      <div style="background:#f8f8f8;border:1px solid #e5e5e5;border-radius:8px;padding:14px;">
        <p style="color:#888;font-size:11px;margin:0 0 8px;">Suggested follow-up — select all and copy</p>
        <pre style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:12px;color:#333;margin:0;white-space:pre-wrap;line-height:1.6;">${template}</pre>
      </div>
    </div>`
  }).join('')
  return `
    <div style="margin-bottom:28px;">
      <h2 style="font-size:14px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:.05em;margin:0 0 12px;">${label}</h2>
      ${blocks}
    </div>`
}

function followUpEmailHtml(sections: { saved: AppEntry[]; applied: AppEntry[]; interview: AppEntry[] }): string {
  const total = sections.saved.length + sections.applied.length + sections.interview.length
  const body = [
    sections.saved.length ? savedSection(sections.saved) : '',
    sections.applied.length ? templateSection('applied', sections.applied) : '',
    sections.interview.length ? templateSection('interview', sections.interview) : '',
  ].join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9f9f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5e5;padding:32px;">
    <h1 style="font-size:20px;color:#111;margin:0 0 8px;">Follow-up reminder</h1>
    <p style="color:#666;font-size:14px;margin:0 0 24px;">
      ${total} application${total !== 1 ? 's' : ''} need${total === 1 ? 's' : ''} your attention.
    </p>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 24px;">
    ${body}
    <div style="margin-top:4px;">
      <a href="${APP_URL}/applications"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">
        Open Applications
      </a>
    </div>
    <p style="color:#bbb;font-size:11px;margin-top:24px;">
      You're receiving this because you enabled follow-up reminders in your Naitei profile.
      <a href="${APP_URL}/profile" style="color:#bbb;">Manage settings</a>
    </p>
  </div>
</body>
</html>`
}

// POST /cron/follow-up-reminders
// Called daily by Vercel Cron. Sends one digest email per user with stale applications.
router.post('/follow-up-reminders', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return

  // Fetch all profiles with email notifications enabled
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, notify_saved_enabled, notify_saved_days, notify_applied_enabled, notify_applied_days, notify_interview_enabled, notify_interview_days')
    .eq('email_notifications_enabled', true)

  if (profilesError) return res.status(500).json({ error: profilesError.message })
  if (!profiles || profiles.length === 0) return res.json({ sent: 0, skipped: 0 })

  let sent = 0
  let skipped = 0

  for (const profile of profiles) {
    const { notify_saved_enabled, notify_saved_days, notify_applied_enabled, notify_applied_days, notify_interview_enabled, notify_interview_days } = profile

    // Skip if nothing is enabled
    if (!notify_saved_enabled && !notify_applied_enabled && !notify_interview_enabled) { skipped++; continue }

    // Get email from auth — single source of truth
    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(profile.user_id)
    const email = user?.email
    if (userError || !email) { skipped++; continue }

    async function fetchStale(status: string, days: number): Promise<AppEntry[]> {
      const cutoff = new Date(Date.now() - days * 86400 * 1000).toISOString()
      const { data } = await supabase
        .from('applications')
        .select('updated_at, jobs(title, company)')
        .eq('user_id', profile.user_id)
        .eq('status', status)
        .lt('updated_at', cutoff)
      return (data ?? []).map(a => {
        const job = a.jobs as unknown as { title: string; company: string | null } | null
        const daysSince = Math.floor((Date.now() - new Date(a.updated_at).getTime()) / 86400000)
        return { title: job?.title ?? 'Untitled', company: job?.company ?? null, days: daysSince }
      })
    }

    const [saved, applied, interview] = await Promise.all([
      notify_saved_enabled ? fetchStale('saved', notify_saved_days ?? 14) : Promise.resolve([]),
      notify_applied_enabled ? fetchStale('applied', notify_applied_days ?? 7) : Promise.resolve([]),
      notify_interview_enabled ? fetchStale('interview', notify_interview_days ?? 7) : Promise.resolve([]),
    ])

    const total = saved.length + applied.length + interview.length
    if (total === 0) { skipped++; continue }

    try {
      await sendEmail({
        to: email,
        subject: `${total} application${total !== 1 ? 's' : ''} need${total === 1 ? 's' : ''} a follow-up`,
        html: followUpEmailHtml({ saved, applied, interview }),
      })
      sent++
    } catch (err) {
      console.error(`[cron] Failed to send to ${email}:`, err)
      skipped++
    }
  }

  console.log(`[cron/follow-up-reminders] sent=${sent} skipped=${skipped}`)
  return res.json({ sent, skipped })
})

// --- Auto-fetch helpers ---

interface RemotiveJob {
  id: number
  url: string
  title: string
  company_name: string
  description: string
  publication_date: string
}

interface RemoteOkJob {
  url: string
  position: string
  company: string
  description: string
  date: string
  salary_min?: number
  salary_max?: number
}

async function fetchRemotiveJobs(): Promise<RemotiveJob[]> {
  const response = await axios.get('https://remotive.com/api/remote-jobs?category=software-dev', { timeout: 15000 })
  return (response.data?.jobs ?? []) as RemotiveJob[]
}

async function fetchRemoteOkJobs(): Promise<RemoteOkJob[]> {
  const response = await axios.get('https://remoteok.com/api', {
    timeout: 15000,
    headers: { 'User-Agent': 'naitei-job-dashboard/1.0' },
  })
  return ((response.data as unknown[]).filter((j): j is RemoteOkJob => !!(j as RemoteOkJob).url && !!(j as RemoteOkJob).position)) as RemoteOkJob[]
}

// POST /cron/auto-fetch — daily fetch from Remotive + RemoteOK for all users
// Called by Vercel Cron. Fetches APIs once, distributes to each user with skills.
router.post('/auto-fetch', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, skills')
    .not('skills', 'is', null)

  if (profilesError) return res.status(500).json({ error: profilesError.message })

  const activeProfiles = (profiles ?? []).filter(p => Array.isArray(p.skills) && p.skills.length > 0)
  if (activeProfiles.length === 0) return res.json({ users: 0, imported: 0, failed: 0 })

  // Fetch both sources once
  let remotiveJobs: RemotiveJob[] = []
  let remoteOkJobs: RemoteOkJob[] = []
  try {
    ;[remotiveJobs, remoteOkJobs] = await Promise.all([fetchRemotiveJobs(), fetchRemoteOkJobs()])
  } catch (err) {
    console.error('[cron/auto-fetch] API fetch failed:', err)
    return res.status(502).json({ error: 'Failed to fetch from job sources' })
  }

  const now = Date.now()
  let totalImported = 0
  let totalFailed = 0

  for (const profile of activeProfiles) {
    const userId = profile.user_id
    const userSkills: string[] = profile.skills

    // Get existing URLs for this user
    const { data: existingRows } = await supabase
      .from('jobs')
      .select('url')
      .eq('user_id', userId)
      .not('url', 'is', null)
    const existingUrls = new Set((existingRows ?? []).map((j: { url: string }) => j.url))

    const jobIdsToScore: string[] = []

    // Remotive
    for (const rj of remotiveJobs) {
      if (!rj.url || existingUrls.has(rj.url)) continue
      const description = rj.description
        ? cheerio.load(rj.description).text().replace(/\s+/g, ' ').trim().slice(0, 8000)
        : ''
      if (description.length < 50) continue
      const postedAt = rj.publication_date ? new Date(rj.publication_date) : null
      const isRecent = postedAt ? (now - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false
      const descLower = description.toLowerCase()
      const hasSkillMatch = userSkills.some(s => descLower.includes(s.toLowerCase()))

      if (!hasSkillMatch) {
        await supabase.from('jobs').upsert({
          user_id: userId,
          title: (rj.title ?? 'Remote Job').slice(0, 200),
          company: rj.company_name?.slice(0, 200) ?? null,
          description_raw: description,
          url: rj.url,
          source: 'remotive',
          posted_at: postedAt?.toISOString() ?? null,
          is_recent: isRecent,
          scoring_status: 'skipped',
        }, { onConflict: 'user_id,url', ignoreDuplicates: true })
        continue
      }

      // Limit to 3 per source per user in cron (vs 20 for manual import)
      if (jobIdsToScore.filter(id => id.startsWith('r:')).length >= 3) continue

      const { data: job, error: insertError } = await supabase.from('jobs').insert({
        user_id: userId,
        title: (rj.title ?? 'Remote Job').slice(0, 200),
        company: rj.company_name?.slice(0, 200) ?? null,
        description_raw: description,
        url: rj.url,
        source: 'remotive',
        posted_at: postedAt?.toISOString() ?? null,
        is_recent: isRecent,
        scoring_status: 'pending',
      }).select('id').single()

      if (insertError || !job) { totalFailed++; continue }
      jobIdsToScore.push(`r:${job.id}`)
      existingUrls.add(rj.url)
    }

    // RemoteOK
    for (const rj of remoteOkJobs) {
      if (!rj.url || existingUrls.has(rj.url)) continue
      const description = rj.description
        ? cheerio.load(rj.description).text().replace(/\s+/g, ' ').trim().slice(0, 8000)
        : ''
      if (description.length < 50) continue
      const postedAt = rj.date ? new Date(rj.date) : null
      const isRecent = postedAt ? (now - postedAt.getTime()) < 24 * 60 * 60 * 1000 : false
      const descLower = description.toLowerCase()
      const hasSkillMatch = userSkills.some(s => descLower.includes(s.toLowerCase()))

      if (!hasSkillMatch) {
        await supabase.from('jobs').upsert({
          user_id: userId,
          title: (rj.position ?? 'Remote Job').slice(0, 200),
          company: rj.company?.slice(0, 200) ?? null,
          description_raw: description,
          url: rj.url,
          source: 'remoteok',
          posted_at: postedAt?.toISOString() ?? null,
          is_recent: isRecent,
          salary_min: rj.salary_min ?? null,
          salary_max: rj.salary_max ?? null,
          scoring_status: 'skipped',
        }, { onConflict: 'user_id,url', ignoreDuplicates: true })
        continue
      }

      if (jobIdsToScore.filter(id => id.startsWith('k:')).length >= 3) continue

      const { data: job, error: insertError } = await supabase.from('jobs').insert({
        user_id: userId,
        title: (rj.position ?? 'Remote Job').slice(0, 200),
        company: rj.company?.slice(0, 200) ?? null,
        description_raw: description,
        url: rj.url,
        source: 'remoteok',
        posted_at: postedAt?.toISOString() ?? null,
        is_recent: isRecent,
        salary_min: rj.salary_min ?? null,
        salary_max: rj.salary_max ?? null,
        scoring_status: 'pending',
      }).select('id').single()

      if (insertError || !job) { totalFailed++; continue }
      jobIdsToScore.push(`k:${job.id}`)
      existingUrls.add(rj.url)
    }

    // Score all queued jobs for this user
    for (const prefixedId of jobIdsToScore) {
      const jobId = prefixedId.slice(2)
      try {
        await scoreJob(jobId, userId)
        totalImported++
      } catch {
        totalFailed++
      }
    }
  }

  console.log(`[cron/auto-fetch] users=${activeProfiles.length} imported=${totalImported} failed=${totalFailed}`)
  return res.json({ users: activeProfiles.length, imported: totalImported, failed: totalFailed })
})

// --- Daily digest helpers ---

function topJobsDigestHtml(
  jobs: { id: string; title: string; company: string | null; ai_score: number; ai_recommendation: string | null; url: string | null }[],
  appUrl: string
): string {
  const rows = jobs.map(j => {
    const rec = j.ai_recommendation === 'apply_now' ? 'Apply now' :
      j.ai_recommendation === 'apply_with_tailoring' ? 'Apply with tailoring' : ''
    return `
    <div style="margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #f5f5f5;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
        <span style="background:#dcfce7;color:#16a34a;font-size:11px;font-weight:600;padding:2px 8px;border-radius:99px;">${j.ai_score}%</span>
        ${rec ? `<span style="color:#888;font-size:12px;">${rec}</span>` : ''}
      </div>
      <strong style="color:#111;font-size:14px;">${j.title}</strong>
      ${j.company ? `<span style="color:#666;font-size:13px;"> — ${j.company}</span>` : ''}
      <br>
      ${j.url ? `<a href="${j.url}" style="color:#2563eb;font-size:12px;text-decoration:none;">View job posting</a>` : ''}
    </div>`
  }).join('')

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f9f9f9;margin:0;padding:32px 16px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e5e5e5;padding:32px;">
    <h1 style="font-size:20px;color:#111;margin:0 0 8px;">Top jobs for you today</h1>
    <p style="color:#666;font-size:14px;margin:0 0 24px;">
      ${jobs.length} new job${jobs.length !== 1 ? 's' : ''} scored above your threshold.
    </p>
    <hr style="border:none;border-top:1px solid #f0f0f0;margin:0 0 24px;">
    ${rows}
    <div style="margin-top:4px;">
      <a href="${appUrl}/jobs"
         style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:500;">
        View all jobs
      </a>
    </div>
    <p style="color:#bbb;font-size:11px;margin-top:24px;">
      You're receiving this because you have email notifications enabled in your Naitei profile.
      <a href="${appUrl}/profile" style="color:#bbb;">Manage settings</a>
    </p>
  </div>
</body>
</html>`
}

// POST /cron/daily-digest — send top newly-scored jobs above threshold to users
// Called by Vercel Cron after auto-fetch. Sends jobs scored in last 24h above display_min_score.
router.post('/daily-digest', async (req: Request, res: Response) => {
  if (!verifyCronSecret(req, res)) return

  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('user_id, display_min_score')
    .eq('email_notifications_enabled', true)

  if (profilesError) return res.status(500).json({ error: profilesError.message })
  if (!profiles || profiles.length === 0) return res.json({ sent: 0, skipped: 0 })

  const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  let sent = 0
  let skipped = 0

  for (const profile of profiles) {
    const threshold = profile.display_min_score ?? 60

    const { data: topJobs } = await supabase
      .from('jobs')
      .select('id, title, company, ai_score, ai_recommendation, url')
      .eq('user_id', profile.user_id)
      .eq('scoring_status', 'scored')
      .gte('ai_score', threshold)
      .gte('scored_at', cutoff)
      .order('ai_score', { ascending: false })
      .limit(10)

    if (!topJobs || topJobs.length === 0) { skipped++; continue }

    const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(profile.user_id)
    const email = user?.email
    if (userError || !email) { skipped++; continue }

    try {
      await sendEmail({
        to: email,
        subject: `${topJobs.length} top job${topJobs.length !== 1 ? 's' : ''} matching your profile today`,
        html: topJobsDigestHtml(topJobs, APP_URL),
      })
      sent++
    } catch (err) {
      console.error(`[cron/daily-digest] Failed to send to ${email}:`, err)
      skipped++
    }
  }

  console.log(`[cron/daily-digest] sent=${sent} skipped=${skipped}`)
  return res.json({ sent, skipped })
})

export default router
