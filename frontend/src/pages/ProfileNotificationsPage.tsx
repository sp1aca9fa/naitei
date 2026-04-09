import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile } from '@/lib/api'

export function ProfileNotificationsPage() {
  const [notifyDigestEnabled, setNotifyDigestEnabled] = useState(false)
  const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false)
  const [notifySavedEnabled, setNotifySavedEnabled] = useState(false)
  const [notifySavedDays, setNotifySavedDays] = useState(14)
  const [notifyAppliedEnabled, setNotifyAppliedEnabled] = useState(true)
  const [notifyAppliedDays, setNotifyAppliedDays] = useState(7)
  const [notifyInterviewEnabled, setNotifyInterviewEnabled] = useState(true)
  const [notifyInterviewDays, setNotifyInterviewDays] = useState(7)

  const lastSaved = useRef<Record<string, unknown> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getProfile()
      .then((p: {
        notify_digest_enabled: boolean | null
        email_notifications_enabled: boolean | null
        notify_saved_enabled: boolean | null; notify_saved_days: number | null
        notify_applied_enabled: boolean | null; notify_applied_days: number | null
        notify_interview_enabled: boolean | null; notify_interview_days: number | null
      }) => {
        const vals = {
          digest: p.notify_digest_enabled ?? false,
          enabled: p.email_notifications_enabled ?? false,
          savedEnabled: p.notify_saved_enabled ?? false, savedDays: p.notify_saved_days ?? 14,
          appliedEnabled: p.notify_applied_enabled ?? true, appliedDays: p.notify_applied_days ?? 7,
          interviewEnabled: p.notify_interview_enabled ?? true, interviewDays: p.notify_interview_days ?? 7,
        }
        lastSaved.current = vals
        setNotifyDigestEnabled(vals.digest)
        setEmailNotificationsEnabled(vals.enabled)
        setNotifySavedEnabled(vals.savedEnabled)
        setNotifySavedDays(vals.savedDays)
        setNotifyAppliedEnabled(vals.appliedEnabled)
        setNotifyAppliedDays(vals.appliedDays)
        setNotifyInterviewEnabled(vals.interviewEnabled)
        setNotifyInterviewDays(vals.interviewDays)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!lastSaved.current) return
    const current = {
      digest: notifyDigestEnabled, enabled: emailNotificationsEnabled,
      savedEnabled: notifySavedEnabled, savedDays: notifySavedDays,
      appliedEnabled: notifyAppliedEnabled, appliedDays: notifyAppliedDays,
      interviewEnabled: notifyInterviewEnabled, interviewDays: notifyInterviewDays,
    }
    if (JSON.stringify(current) === JSON.stringify(lastSaved.current)) return
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(async () => {
      try {
        await updateProfile({
          notify_digest_enabled: notifyDigestEnabled,
          email_notifications_enabled: emailNotificationsEnabled,
          notify_saved_enabled: notifySavedEnabled, notify_saved_days: notifySavedDays,
          notify_applied_enabled: notifyAppliedEnabled, notify_applied_days: notifyAppliedDays,
          notify_interview_enabled: notifyInterviewEnabled, notify_interview_days: notifyInterviewDays,
        })
        lastSaved.current = current
      } catch { /* silent */ }
    }, 500)
    return () => { if (timer.current) clearTimeout(timer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notifyDigestEnabled, emailNotificationsEnabled, notifySavedEnabled, notifySavedDays, notifyAppliedEnabled, notifyAppliedDays, notifyInterviewEnabled, notifyInterviewDays])

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Email Notifications</h1>
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <p className="text-xs text-gray-500">Receive reminders by email so you don't miss important updates even when you're not using the app.</p>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={notifyDigestEnabled} onChange={e => setNotifyDigestEnabled(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <div>
            <span className="text-sm font-medium text-gray-700">Daily job digest</span>
            <p className="text-xs text-gray-400">Receive a daily email with your job hunt status summary.</p>
          </div>
        </label>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={emailNotificationsEnabled} onChange={e => setEmailNotificationsEnabled(e.target.checked)} className="w-4 h-4 accent-blue-600" />
          <span className="text-sm font-medium text-gray-700">Enable follow-up reminders</span>
        </label>

        {emailNotificationsEnabled && (
          <div className="pl-2 ml-2 border-l-2 border-gray-100 space-y-4">
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={notifySavedEnabled} onChange={e => setNotifySavedEnabled(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <div>
                  <span className="text-sm text-gray-700">Saved jobs with no action</span>
                  <p className="text-xs text-gray-400">Remind me when a saved job hasn't been moved forward.</p>
                </div>
              </label>
              {notifySavedEnabled && (
                <div className="pl-7 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Notify after</span>
                  <input type="number" min={1} max={90} value={notifySavedDays} onChange={e => setNotifySavedDays(Math.max(1, Math.min(90, Number(e.target.value))))} className="w-14 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" />
                  <span className="text-xs text-gray-500">days with no action</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={notifyAppliedEnabled} onChange={e => setNotifyAppliedEnabled(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <div>
                  <span className="text-sm text-gray-700">Applied — no response</span>
                  <p className="text-xs text-gray-400">Remind me to follow up when an applied job has had no update.</p>
                </div>
              </label>
              {notifyAppliedEnabled && (
                <div className="pl-7 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Notify after</span>
                  <input type="number" min={1} max={90} value={notifyAppliedDays} onChange={e => setNotifyAppliedDays(Math.max(1, Math.min(90, Number(e.target.value))))} className="w-14 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" />
                  <span className="text-xs text-gray-500">days with no update</span>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={notifyInterviewEnabled} onChange={e => setNotifyInterviewEnabled(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                <div>
                  <span className="text-sm text-gray-700">Interview — no update</span>
                  <p className="text-xs text-gray-400">Remind me to follow up after an interview with no update.</p>
                </div>
              </label>
              {notifyInterviewEnabled && (
                <div className="pl-7 flex items-center gap-2">
                  <span className="text-xs text-gray-500">Notify after</span>
                  <input type="number" min={1} max={90} value={notifyInterviewDays} onChange={e => setNotifyInterviewDays(Math.max(1, Math.min(90, Number(e.target.value))))} className="w-14 text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500 text-center" />
                  <span className="text-xs text-gray-500">days with no update</span>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  )
}
