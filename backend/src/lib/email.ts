import { Resend } from 'resend'

// Configured entirely through env vars — swap from sandbox to production by setting EMAIL_FROM
// RESEND_API_KEY  — your Resend API key
// EMAIL_FROM      — sender address (default: Resend sandbox onboarding@resend.dev)
// EMAIL_FROM_NAME — sender display name (default: Naitei)

const FROM_ADDRESS = process.env.EMAIL_FROM || 'onboarding@resend.dev'
const FROM_NAME = process.env.EMAIL_FROM_NAME || 'Naitei'
const FROM = `${FROM_NAME} <${FROM_ADDRESS}>`

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  if (!process.env.RESEND_API_KEY) {
    console.log(`[email] RESEND_API_KEY not set — skipping. Would send to ${to}: "${subject}"`)
    return
  }

  const resend = new Resend(process.env.RESEND_API_KEY)
  const { error } = await resend.emails.send({ from: FROM, to, subject, html })
  if (error) throw new Error(`Resend error: ${error.message}`)
}
