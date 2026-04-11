import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile, uploadResume, previewResumeVersion, deleteResumeVersion, updateResumeVersion } from '@/lib/api'

interface DomainEntry { domain: string; years: number }
interface SkillEntry { name: string; level: 1 | 2 | 3 | 4 | 5 }

export const LEVEL_LABELS: Record<number, string> = { 1: 'Exposure', 2: 'Foundational', 3: 'Working', 4: 'Proficient', 5: 'Expert' }
const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: 'Tutorials, read docs, hello world',
  2: 'Bootcamp, structured course, basic projects',
  3: 'Built real things independently, ~2-3 years active use',
  4: 'Complex production work, can mentor others, ~4-5 years',
  5: 'Deep mastery, leads/architects, 6+ years',
}
export const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-blue-50 text-blue-700',
  3: 'bg-indigo-50 text-indigo-700',
  4: 'bg-violet-50 text-violet-700',
  5: 'bg-purple-100 text-purple-800',
}

function notifyResumeStatus(profile: { active_resume_version_id: string | null } | null) {
  window.dispatchEvent(new CustomEvent('resume-status-changed', {
    detail: { hasResume: !!profile?.active_resume_version_id },
  }))
}

interface ResumeVersion {
  id: string; label: string; text: string; created_at: string
  skills_matrix?: SkillEntry[]; cv_analysis?: string
  key_strengths?: string[]; focus_skills?: string[]
}

interface Profile {
  id: string; name: string | null; skills: string[] | null
  experience_years: number | null; experience_by_domain: DomainEntry[] | null
  experience_summary: string | null; target_role: string | null
  target_role_years: number | null; experience_level: number | null
  active_resume_version_id: string | null; resume_versions: ResumeVersion[] | null
}

interface ReviewState {
  name: string; skills_matrix: SkillEntry[]; cv_analysis: string
  experience_years: number; experience_by_domain: DomainEntry[]
  experience_summary: string; target_role: string; target_role_years: number
  experience_level: 1 | 2 | 3 | 4 | 5; oldProfile: Profile | null
  isManualEdit?: boolean; versionId?: string; editingVersionId: string | null
  key_strengths: string[]; focus_skills: string[]; raw_text: string
}

function LevelTooltip() {
  return (
    <div className="absolute z-10 left-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-gray-700 mb-2">Skill level guide</p>
      <table className="w-full border-collapse">
        <tbody>
          {[1,2,3,4,5].map(l => (
            <tr key={l} className="border-t border-gray-100 first:border-0">
              <td className="py-1 pr-2 font-medium text-gray-800 whitespace-nowrap">{l} — {LEVEL_LABELS[l]}</td>
              <td className="py-1 text-gray-500">{LEVEL_DESCRIPTIONS[l]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SkillLevelSelector({ level, onChange, large = false }: { level: number; onChange: (l: 1|2|3|4|5) => void; large?: boolean }) {
  const [showTooltip, setShowTooltip] = useState(false)
  const btnClass = large ? 'text-sm px-3 py-1.5' : 'text-xs px-2 py-0.5'
  return (
    <div className="relative flex items-center gap-0.5" onMouseLeave={() => setShowTooltip(false)}>
      {[1,2,3,4,5].map(l => (
        <button key={l} type="button" onClick={() => onChange(l as 1|2|3|4|5)} onMouseEnter={() => setShowTooltip(true)}
          className={`${btnClass} rounded font-medium border transition-colors ${level === l ? LEVEL_COLORS[l] + ' border-transparent' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'}`}
        >{l}</button>
      ))}
      {showTooltip && <LevelTooltip />}
    </div>
  )
}

function DragHandle() {
  return (
    <svg className="w-3 h-3 text-gray-300 flex-shrink-0" viewBox="0 0 12 12" fill="currentColor">
      <circle cx="3.5" cy="2.5" r="1.2"/><circle cx="8.5" cy="2.5" r="1.2"/>
      <circle cx="3.5" cy="6" r="1.2"/><circle cx="8.5" cy="6" r="1.2"/>
      <circle cx="3.5" cy="9.5" r="1.2"/><circle cx="8.5" cy="9.5" r="1.2"/>
    </svg>
  )
}

function autoKeyStrengths(skills: SkillEntry[]): string[] {
  if (skills.length === 0) return []
  const maxLevel = Math.max(...skills.map(s => s.level))
  return skills.filter(s => s.level === maxLevel).map(s => s.name)
}

export function ProfileResumePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [newSkillInput, setNewSkillInput] = useState('')
  const [showViewRawCv, setShowViewRawCv] = useState(false)
  const [showEditRawCv, setShowEditRawCv] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const [dragPoolSkillName, setDragPoolSkillName] = useState<string | null>(null)
  const [dragOverSection, setDragOverSection] = useState<'key_strengths' | 'focus_skills' | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProfile().then((p: Profile) => setProfile(p)).catch(() => {})
  }, [])

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const oldProfile = profile
    setUploading(true)
    setUploadMsg(null)
    setReview(null)
    try {
      const res = await uploadResume(file, file.name)
      setProfile(res.profile)
      notifyResumeStatus(res.profile)
      const uploadedSkills = res.parsed.skills ?? []
      setReview({
        name: res.parsed.name ?? '',
        skills_matrix: uploadedSkills,
        cv_analysis: res.parsed.cv_analysis ?? '',
        experience_years: res.parsed.experience_years ?? 0,
        experience_by_domain: res.parsed.experience_by_domain ?? [],
        experience_summary: res.parsed.experience_summary ?? '',
        target_role: res.parsed.target_role ?? '',
        target_role_years: res.parsed.target_role_years ?? 0,
        experience_level: (res.parsed.experience_level ?? 1) as 1|2|3|4|5,
        oldProfile,
        editingVersionId: res.version_id ?? null,
        key_strengths: autoKeyStrengths(uploadedSkills),
        focus_skills: [],
        raw_text: res.profile?.resume_versions?.find((v: ResumeVersion) => v.id === res.version_id)?.text ?? '',
      })
    } catch (err) {
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleSaveCorrections() {
    if (!review) return
    setSaving(true)
    try {
      const body: Record<string, unknown> = {
        name: review.name,
        experience_years: review.experience_years,
        experience_by_domain: review.experience_by_domain,
        experience_summary: review.experience_summary,
        target_role: review.target_role,
        target_role_years: review.target_role_years,
        experience_level: review.experience_level,
      }
      if (review.versionId) body.active_resume_version_id = review.versionId
      const updated = await updateProfile(body)
      if (review.editingVersionId) {
        await updateResumeVersion(review.editingVersionId, {
          skills_matrix: review.skills_matrix,
          cv_analysis: review.cv_analysis,
          key_strengths: review.key_strengths,
          focus_skills: review.focus_skills,
          text: review.raw_text,
        })
      }
      setProfile(updated)
      notifyResumeStatus(updated)
      setReview(null)
    } catch (err) {
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  async function handleRevertReview() {
    if (!review?.oldProfile) return
    setSaving(true)
    try {
      const old = review.oldProfile
      const updated = await updateProfile({
        name: old.name ?? '',
        experience_years: old.experience_years ?? 0,
        experience_by_domain: old.experience_by_domain ?? [],
        experience_summary: old.experience_summary ?? '',
        target_role: old.target_role ?? '',
        target_role_years: old.target_role_years ?? 0,
        experience_level: (old.experience_level ?? 1) as 1|2|3|4|5,
      })
      setProfile(updated)
      notifyResumeStatus(updated)
      setReview(null)
    } catch (err) {
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Revert failed' })
    } finally {
      setSaving(false)
    }
  }

  async function handleLoadVersion(versionId: string) {
    const oldProfile = profile
    const storedVersion = profile?.resume_versions?.find(v => v.id === versionId)
    if (storedVersion?.skills_matrix) {
      setReview({
        name: oldProfile?.name ?? '',
        skills_matrix: storedVersion.skills_matrix,
        cv_analysis: storedVersion.cv_analysis ?? '',
        experience_years: oldProfile?.experience_years ?? 0,
        experience_by_domain: oldProfile?.experience_by_domain ?? [],
        experience_summary: oldProfile?.experience_summary ?? '',
        target_role: oldProfile?.target_role ?? '',
        target_role_years: oldProfile?.target_role_years ?? 0,
        experience_level: ((oldProfile?.experience_level ?? 1) as 1|2|3|4|5),
        oldProfile, versionId, editingVersionId: versionId,
        key_strengths: storedVersion.key_strengths ?? autoKeyStrengths(storedVersion.skills_matrix),
        focus_skills: storedVersion.focus_skills ?? [],
        raw_text: storedVersion.text ?? '',
      })
      return
    }
    setUploading(true)
    setUploadMsg(null)
    setReview(null)
    try {
      const res = await previewResumeVersion(versionId)
      const previewSkills = res.parsed.skills ?? []
      setReview({
        name: res.parsed.name ?? '',
        skills_matrix: previewSkills,
        cv_analysis: res.parsed.cv_analysis ?? '',
        experience_years: res.parsed.experience_years ?? 0,
        experience_by_domain: res.parsed.experience_by_domain ?? [],
        experience_summary: res.parsed.experience_summary ?? '',
        target_role: res.parsed.target_role ?? '',
        target_role_years: res.parsed.target_role_years ?? 0,
        experience_level: ((res.parsed.experience_level ?? 1) as 1|2|3|4|5),
        oldProfile, versionId, editingVersionId: versionId,
        key_strengths: autoKeyStrengths(previewSkills),
        focus_skills: [],
        raw_text: oldProfile?.resume_versions?.find(v => v.id === versionId)?.text ?? '',
      })
    } catch (err) {
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Failed to load version' })
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteVersion(versionId: string) {
    try {
      const updated = await deleteResumeVersion(versionId)
      setProfile(updated)
      notifyResumeStatus(updated)
      setConfirmDeleteId(null)
    } catch (err) {
      setConfirmDeleteId(null)
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Delete failed' })
    }
  }

  function handleSkillDrop(targetIndex: number) {
    if (dragIndex === null || dragIndex === targetIndex || !review) return
    const u = [...review.skills_matrix]
    const [moved] = u.splice(dragIndex, 1)
    u.splice(targetIndex, 0, moved)
    setReview({ ...review, skills_matrix: u })
    setDragIndex(null)
    setDragOverIndex(null)
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Resume</h1>
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">

        {/* Profile summary (read-only) */}
        {profile?.active_resume_version_id && !review && (() => {
          const activeVersion = profile.resume_versions?.find(v => v.id === profile.active_resume_version_id)
          return (
            <div className="text-sm text-gray-600 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <p className="font-semibold text-gray-900">{profile.name ?? 'Name not detected'}</p>
                  {profile.target_role && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-700">{profile.target_role}</span>
                      {profile.experience_level != null && (
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[profile.experience_level]}`}>
                          {LEVEL_LABELS[profile.experience_level]}
                        </span>
                      )}
                      {profile.target_role_years != null && (
                        <span className="text-xs text-gray-400">{profile.target_role_years} year{profile.target_role_years !== 1 ? 's' : ''} in field</span>
                      )}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {profile.experience_by_domain && profile.experience_by_domain.length > 0 && (
                      <p className="text-xs text-gray-400">
                        {profile.experience_by_domain.map(d => `${d.domain} (${d.years}y)`).join(' · ')}
                      </p>
                    )}
                    {profile.experience_years != null && (
                      <p className="text-xs text-gray-400">{profile.experience_years} year{profile.experience_years !== 1 ? 's' : ''} total</p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => {
                    const editSkills = activeVersion?.skills_matrix ?? []
                    setReview({
                      name: profile.name ?? '',
                      skills_matrix: editSkills,
                      cv_analysis: activeVersion?.cv_analysis ?? '',
                      experience_years: profile.experience_years ?? 0,
                      experience_by_domain: profile.experience_by_domain ?? [],
                      experience_summary: profile.experience_summary ?? '',
                      target_role: profile.target_role ?? '',
                      target_role_years: profile.target_role_years ?? 0,
                      experience_level: ((profile.experience_level ?? 1) as 1|2|3|4|5),
                      oldProfile: profile, isManualEdit: true,
                      editingVersionId: profile.active_resume_version_id,
                      key_strengths: activeVersion?.key_strengths ?? autoKeyStrengths(editSkills),
                      focus_skills: activeVersion?.focus_skills ?? [],
                      raw_text: activeVersion?.text ?? '',
                    })
                  }}
                  className="text-xs px-3 py-1.5 bg-white border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded-lg font-medium transition-colors flex-shrink-0"
                >Edit</button>
              </div>

              {activeVersion?.cv_analysis && (
                <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">{activeVersion.cv_analysis}</p>
              )}

              {activeVersion?.skills_matrix && activeVersion.skills_matrix.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Skills</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-1.5">
                    {activeVersion.skills_matrix.map(s => (
                      <div key={s.name} className="flex items-center justify-between gap-2 min-w-0">
                        <span className="text-xs text-gray-800 truncate">{s.name}</span>
                        <span title={`${LEVEL_LABELS[s.level]}: ${LEVEL_DESCRIPTIONS[s.level]}`}
                          className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0 ${LEVEL_COLORS[s.level]}`}>
                          {LEVEL_LABELS[s.level]}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {activeVersion?.key_strengths && activeVersion.key_strengths.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <p className="text-xs font-medium text-gray-500">Key Strengths</p>
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
                    <p className="text-xs font-medium text-gray-500">Focus Skills</p>
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

              {activeVersion?.text && (
                <div>
                  <button
                    onClick={() => setShowViewRawCv(v => !v)}
                    className="text-xs text-gray-400 hover:text-gray-600 font-medium"
                  >
                    {showViewRawCv ? 'Hide raw CV' : 'Raw CV'}
                  </button>
                  {showViewRawCv && (
                    <textarea
                      readOnly
                      value={activeVersion.text}
                      rows={14}
                      className="mt-2 w-full text-xs font-mono border border-gray-200 rounded-lg px-3 py-2 bg-gray-50 text-gray-600 resize-y focus:outline-none"
                    />
                  )}
                </div>
              )}
            </div>
          )
        })()}

        {/* Review / edit panel */}
        {review && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-5 space-y-5">
            <div>
              <p className="font-semibold text-amber-800 text-sm">{review.isManualEdit ? 'Edit profile data' : 'Review extracted data'}</p>
              <p className="text-xs text-amber-700 mt-0.5">{review.isManualEdit ? 'Make your changes and save.' : 'Correct anything that looks wrong, then save.'}</p>
            </div>

            {/* Two-column: profile fields */}
            <div className="flex gap-6">
              {/* Left: name, target role, years in role, level */}
              <div className="flex-1 space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Name</label>
                  <input type="text" value={review.name} onChange={e => setReview({ ...review, name: e.target.value })}
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  {review.oldProfile?.name && review.oldProfile.name !== review.name && (
                    <p className="text-xs text-gray-400">Previously: {review.oldProfile.name}</p>
                  )}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-medium text-gray-600">Target role <span className="text-gray-400 font-normal">(AI inferred)</span></label>
                  <input type="text" value={review.target_role} onChange={e => setReview({ ...review, target_role: e.target.value })}
                    placeholder="e.g. Software Engineer"
                    className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>

                <div className="flex items-start justify-between">
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center text-xs font-medium text-gray-600 h-5">Years in role</label>
                    <input type="number" min={0} value={review.target_role_years}
                      onChange={e => setReview({ ...review, target_role_years: Math.max(0, Number(e.target.value)) })}
                      className="w-16 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="flex items-center text-xs font-medium text-gray-600">
                      Level in target role: <span className={`inline-flex items-center text-xs px-1.5 py-0.5 rounded font-medium ${LEVEL_COLORS[review.experience_level]}`}>{LEVEL_LABELS[review.experience_level]}</span>
                    </label>
                    <SkillLevelSelector level={review.experience_level} onChange={l => setReview({ ...review, experience_level: l })} large />
                  </div>
                </div>
              </div>

              {/* Right: experience breakdown, total experience */}
              <div className="flex-1 space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-medium text-gray-600">Experience breakdown</label>
                  {review.experience_by_domain.map((d, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={d.domain}
                        onChange={e => { const u = [...review.experience_by_domain]; u[i] = { ...d, domain: e.target.value }; setReview({ ...review, experience_by_domain: u }) }}
                        placeholder="Domain"
                        className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="number" min={0} value={d.years}
                        onChange={e => { const u = [...review.experience_by_domain]; u[i] = { ...d, years: Math.max(0, Number(e.target.value)) }; setReview({ ...review, experience_by_domain: u, experience_years: u.reduce((s, x) => s + x.years, 0) }) }}
                        className="w-14 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                      <span className="text-xs text-gray-500">yrs</span>
                      <button onClick={() => { const u = review.experience_by_domain.filter((_, j) => j !== i); setReview({ ...review, experience_by_domain: u, experience_years: u.reduce((s, x) => s + x.years, 0) }) }}
                        className="text-xs text-red-500 hover:text-red-700 font-bold px-1">x</button>
                    </div>
                  ))}
                  <button onClick={() => setReview({ ...review, experience_by_domain: [...review.experience_by_domain, { domain: '', years: 0 }] })}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add domain</button>
                </div>

                <div className="flex items-center gap-2 border-t border-gray-200 pt-2">
                  <span className="flex-1 text-sm font-medium text-gray-600">Total experience</span>
                  <input type="number" min={0} value={review.experience_years}
                    onChange={e => setReview({ ...review, experience_years: Math.max(0, Number(e.target.value)) })}
                    className="w-14 text-sm border border-gray-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-gray-500">yrs</span>
                  <span className="w-4 flex-shrink-0" />
                </div>
              </div>
            </div>

            {/* AI analysis — full width */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">AI analysis <span className="text-gray-400 font-normal">(editable)</span></label>
              <textarea value={review.cv_analysis} onChange={e => setReview({ ...review, cv_analysis: e.target.value })}
                rows={4} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* Technical skills — full width */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-medium text-gray-600">Technical skills</label>
                <span className="relative group">
                  <span className="text-xs text-gray-400 cursor-help border-b border-dashed border-gray-300">drag to reorder</span>
                  <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 w-52 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
                    Order is saved but doesn't affect job match scoring.
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {review.skills_matrix.map((s, i) => {
                  const inFocus = review.focus_skills.includes(s.name)
                  return (
                    <div key={i}
                      draggable
                      onDragStart={() => { setDragIndex(i); setDragPoolSkillName(s.name) }}
                      onDragOver={e => { e.preventDefault(); setDragOverIndex(i) }}
                      onDragLeave={() => setDragOverIndex(null)}
                      onDrop={() => handleSkillDrop(i)}
                      onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); setDragPoolSkillName(null); setDragOverSection(null) }}
                      className={`bg-white rounded-lg p-2 w-[190px] space-y-1.5 cursor-grab active:cursor-grabbing transition-all border
                        ${dragIndex === i ? 'opacity-40 border-gray-200' : dragOverIndex === i ? 'border-blue-400 shadow-sm' : 'border-gray-200'}`}
                    >
                      <div className="flex items-center gap-1">
                        <DragHandle />
                        <input type="text" value={s.name}
                          onChange={e => { const u = [...review.skills_matrix]; u[i] = { ...s, name: e.target.value }; setReview({ ...review, skills_matrix: u }) }}
                          className="flex-1 min-w-0 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-gray-50" />
                        <button
                          title={inFocus ? 'Remove from Focus Skills' : 'Add to Focus Skills'}
                          onClick={() => setReview({ ...review, focus_skills: inFocus ? review.focus_skills.filter(n => n !== s.name) : [...review.focus_skills, s.name] })}
                          className={`flex-shrink-0 leading-none text-lg ${inFocus ? 'text-teal-400 hover:text-teal-500' : 'text-gray-200 hover:text-teal-400'}`}
                        >★</button>
                      </div>
                      <div className="flex items-center justify-between">
                        <SkillLevelSelector level={s.level} onChange={l => { const u = [...review.skills_matrix]; u[i] = { ...s, level: l }; setReview({ ...review, skills_matrix: u }) }} />
                        <button onClick={() => setReview({ ...review, skills_matrix: review.skills_matrix.filter((_, j) => j !== i) })}
                          className="text-xs text-red-300 hover:text-red-500 font-bold flex-shrink-0 leading-none ml-2">×</button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="flex gap-2 pt-1">
                <input type="text" value={newSkillInput} onChange={e => setNewSkillInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      const name = newSkillInput.trim()
                      if (name && !review.skills_matrix.some(s => s.name === name)) {
                        setReview({ ...review, skills_matrix: [...review.skills_matrix, { name, level: 1 }] })
                        setNewSkillInput('')
                      }
                    }
                  }}
                  placeholder="Add skill..."
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                <button onClick={() => {
                  const name = newSkillInput.trim()
                  if (name && !review.skills_matrix.some(s => s.name === name)) {
                    setReview({ ...review, skills_matrix: [...review.skills_matrix, { name, level: 1 }] })
                    setNewSkillInput('')
                  }
                }} className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium">Add</button>
              </div>
            </div>

            {/* Key Strengths */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-gray-600">Key Strengths</label>
                <span className="relative group">
                  <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center cursor-help font-medium select-none">?</span>
                  <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 w-64 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
                    The skills you're most experienced in. The AI uses these to assess how well your background fits a role, regardless of where you want to take your career.
                  </span>
                </span>
                <span className="text-xs text-gray-400">(drag skills here, or auto-filled from highest level)</span>
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOverSection('key_strengths') }}
                onDragLeave={() => setDragOverSection(null)}
                onDrop={() => {
                  if (dragPoolSkillName && !review.key_strengths.includes(dragPoolSkillName)) {
                    setReview({ ...review, key_strengths: [...review.key_strengths, dragPoolSkillName] })
                  }
                  setDragOverSection(null)
                }}
                className={`min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded-lg border-2 border-dashed transition-colors
                  ${dragOverSection === 'key_strengths' ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-gray-50'}`}
              >
                {review.key_strengths.length === 0 && (
                  <span className="text-xs text-gray-400 self-center">Drop skills here</span>
                )}
                {review.key_strengths.map(name => (
                  <span key={name} className="flex items-center gap-1 text-xs bg-purple-50 text-purple-700 border border-purple-200 rounded-full px-2.5 py-0.5">
                    {name}
                    <button onClick={() => setReview({ ...review, key_strengths: review.key_strengths.filter(n => n !== name) })}
                      className="text-purple-300 hover:text-red-500 transition-colors ml-0.5" title="Remove from Key Strengths">
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 10l8-8M2 2l8 8"/></svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Focus Skills */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <label className="text-xs font-medium text-gray-600">Focus Skills</label>
                <span className="relative group">
                  <span className="w-3.5 h-3.5 rounded-full bg-gray-200 text-gray-500 text-[10px] flex items-center justify-center cursor-help font-medium select-none">?</span>
                  <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 w-72 rounded bg-gray-800 px-2.5 py-1.5 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity leading-relaxed">
                    Skills you want to build your career around going forward. Even if you're stronger elsewhere, the AI will favor jobs that put these to use. Great for signaling a stack transition -- for example, strong in Ruby on Rails but want to move to JavaScript.
                  </span>
                </span>
                <span className="text-xs text-gray-400">(star or drag skills here)</span>
              </div>
              <div
                onDragOver={e => { e.preventDefault(); setDragOverSection('focus_skills') }}
                onDragLeave={() => setDragOverSection(null)}
                onDrop={() => {
                  if (dragPoolSkillName && !review.focus_skills.includes(dragPoolSkillName)) {
                    setReview({ ...review, focus_skills: [...review.focus_skills, dragPoolSkillName] })
                  }
                  setDragOverSection(null)
                }}
                className={`min-h-[44px] flex flex-wrap gap-1.5 p-2 rounded-lg border-2 border-dashed transition-colors
                  ${dragOverSection === 'focus_skills' ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-gray-50'}`}
              >
                {review.focus_skills.length === 0 && (
                  <span className="text-xs text-gray-400 self-center">Star or drop skills here</span>
                )}
                {review.focus_skills.map(name => (
                  <span key={name} className="flex items-center gap-1 text-xs bg-teal-50 text-teal-800 border border-teal-200 rounded-full px-2.5 py-0.5">
                    <span className="text-teal-400 text-sm leading-none">★</span>
                    {name}
                    <button onClick={() => setReview({ ...review, focus_skills: review.focus_skills.filter(n => n !== name) })}
                      className="text-teal-300 hover:text-red-500 transition-colors ml-0.5" title="Remove from Focus Skills">
                      <svg className="w-3 h-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 10l8-8M2 2l8 8"/></svg>
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Raw CV */}
            <div>
              <button
                onClick={() => setShowEditRawCv(v => !v)}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                {showEditRawCv ? 'Hide raw CV' : 'Raw CV'}
              </button>
              {showEditRawCv && (
                <div className="mt-2 space-y-1">
                  <p className="text-xs text-gray-400">Changes to raw CV text affect ATS scoring on future job analyses.</p>
                  <textarea
                    value={review.raw_text}
                    onChange={e => setReview({ ...review, raw_text: e.target.value })}
                    rows={14}
                    className="w-full text-xs font-mono border border-gray-300 rounded-lg px-3 py-2 bg-white text-gray-700 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>

            {review.versionId && <p className="text-xs text-amber-700">Saving will make this the active version.</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={handleSaveCorrections} disabled={saving}
                className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              {review.oldProfile?.active_resume_version_id && (
                <button onClick={handleRevertReview} disabled={saving}
                  className="text-sm px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium disabled:opacity-50">
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        {/* Resume versions list */}
        {profile?.resume_versions && profile.resume_versions.length > 0 && !review && (
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">Versions</p>
            {[...profile.resume_versions].reverse().map(v => {
              const isActive = v.id === profile.active_resume_version_id
              const uploadedAt = new Date(v.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
              return (
                <div key={v.id} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <div>
                    <span className={`font-medium ${isActive ? 'text-blue-800' : 'text-gray-700'}`}>{v.label}</span>
                    <span className="text-xs text-gray-400 ml-2">{uploadedAt}</span>
                    {isActive && <span className="text-xs text-blue-600 ml-2">active</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isActive && confirmDeleteId !== v.id && (
                      <button onClick={() => handleLoadVersion(v.id)} disabled={uploading}
                        className="text-xs px-2 py-1 bg-white border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded font-medium transition-colors disabled:opacity-50">Load</button>
                    )}
                    {confirmDeleteId === v.id ? (
                      <span className="flex items-center gap-1">
                        <span className="text-xs text-gray-600">Delete?</span>
                        <button onClick={() => handleDeleteVersion(v.id)} className="text-xs px-2 py-0.5 bg-red-500 hover:bg-red-600 text-white rounded font-medium">Yes</button>
                        <button onClick={() => setConfirmDeleteId(null)} className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded font-medium">No</button>
                      </span>
                    ) : (
                      <button onClick={() => setConfirmDeleteId(v.id)} className="text-xs px-2 py-1 text-red-400 hover:text-red-600 font-medium transition-colors">Delete</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {profile?.active_resume_version_id ? 'Upload new version' : 'Upload PDF resume'}
          </label>
          <input ref={fileRef} type="file" accept="application/pdf" onChange={handleResumeUpload} disabled={uploading}
            className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50" />
          {uploading && <p className="text-sm text-gray-500 mt-1">Extracting and parsing...</p>}
          {uploadMsg && (
            <p className={`text-sm mt-1 ${uploadMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>{uploadMsg.text}</p>
          )}
        </div>

      </section>
    </div>
  )
}
