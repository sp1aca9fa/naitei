import { Router, Request, Response } from 'express'
import { supabase } from '../lib/supabase'
import { sendEmail } from '../lib/email'

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

export default router
