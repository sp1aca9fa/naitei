import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile, uploadResume, previewResumeVersion, deleteResumeVersion, updateResumeVersion } from '@/lib/api'

interface DomainEntry { domain: string; years: number }
interface SkillEntry { name: string; level: 1 | 2 | 3 | 4 | 5 }

const LEVEL_LABELS: Record<number, string> = { 1: 'Exposure', 2: 'Foundational', 3: 'Working', 4: 'Proficient', 5: 'Expert' }
const LEVEL_DESCRIPTIONS: Record<number, string> = {
  1: 'Tutorials, read docs, hello world',
  2: 'Bootcamp, structured course, basic projects',
  3: 'Built real things independently, ~2-3 years active use',
  4: 'Complex production work, can mentor others, ~4-5 years',
  5: 'Deep mastery, leads/architects, 6+ years',
}
const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-100 text-gray-600',
  2: 'bg-blue-50 text-blue-700',
  3: 'bg-indigo-50 text-indigo-700',
  4: 'bg-violet-50 text-violet-700',
  5: 'bg-purple-100 text-purple-800',
}

interface ResumeVersion {
  id: string; label: string; text: string; created_at: string
  skills_matrix?: SkillEntry[]; cv_analysis?: string
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

function SkillLevelSelector({ level, onChange }: { level: number; onChange: (l: 1|2|3|4|5) => void }) {
  const [showTooltip, setShowTooltip] = useState(false)
  return (
    <div className="relative flex items-center gap-0.5" onMouseLeave={() => setShowTooltip(false)}>
      {[1,2,3,4,5].map(l => (
        <button key={l} type="button" onClick={() => onChange(l as 1|2|3|4|5)} onMouseEnter={() => setShowTooltip(true)}
          title={`${LEVEL_LABELS[l]}: ${LEVEL_DESCRIPTIONS[l]}`}
          className={`text-xs px-2 py-0.5 rounded font-medium border transition-colors ${level === l ? LEVEL_COLORS[l] + ' border-transparent' : 'bg-white border-gray-200 text-gray-400 hover:border-gray-400'}`}
        >{l}</button>
      ))}
      {showTooltip && <LevelTooltip />}
    </div>
  )
}

export function ProfileResumePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [newSkillInput, setNewSkillInput] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
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
      setReview({
        name: res.parsed.name ?? '',
        skills_matrix: res.parsed.skills ?? [],
        cv_analysis: res.parsed.cv_analysis ?? '',
        experience_years: res.parsed.experience_years ?? 0,
        experience_by_domain: res.parsed.experience_by_domain ?? [],
        experience_summary: res.parsed.experience_summary ?? '',
        target_role: res.parsed.target_role ?? '',
        target_role_years: res.parsed.target_role_years ?? 0,
        experience_level: (res.parsed.experience_level ?? 1) as 1|2|3|4|5,
        oldProfile,
        editingVersionId: res.version_id ?? null,
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
        await updateResumeVersion(review.editingVersionId, { skills_matrix: review.skills_matrix, cv_analysis: review.cv_analysis })
      }
      setProfile(updated)
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
      })
      return
    }
    setUploading(true)
    setUploadMsg(null)
    setReview(null)
    try {
      const res = await previewResumeVersion(versionId)
      setReview({
        name: res.parsed.name ?? '',
        skills_matrix: res.parsed.skills ?? [],
        cv_analysis: res.parsed.cv_analysis ?? '',
        experience_years: res.parsed.experience_years ?? 0,
        experience_by_domain: res.parsed.experience_by_domain ?? [],
        experience_summary: res.parsed.experience_summary ?? '',
        target_role: res.parsed.target_role ?? '',
        target_role_years: res.parsed.target_role_years ?? 0,
        experience_level: ((res.parsed.experience_level ?? 1) as 1|2|3|4|5),
        oldProfile, versionId, editingVersionId: versionId,
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
      setConfirmDeleteId(null)
    } catch (err) {
      setConfirmDeleteId(null)
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Delete failed' })
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Resume</h1>
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">

        {/* Profile summary (read-only) */}
        {profile?.active_resume_version_id && !review && (() => {
          const activeVersion = profile.resume_versions?.find(v => v.id === profile.active_resume_version_id)
          return (
            <div className="text-sm text-gray-600 space-y-3">
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-800">{profile.name ?? 'Name not detected'}</p>
                <button
                  onClick={() => setReview({
                    name: profile.name ?? '',
                    skills_matrix: activeVersion?.skills_matrix ?? [],
                    cv_analysis: activeVersion?.cv_analysis ?? '',
                    experience_years: profile.experience_years ?? 0,
                    experience_by_domain: profile.experience_by_domain ?? [],
                    experience_summary: profile.experience_summary ?? '',
                    target_role: profile.target_role ?? '',
                    target_role_years: profile.target_role_years ?? 0,
                    experience_level: ((profile.experience_level ?? 1) as 1|2|3|4|5),
                    oldProfile: profile, isManualEdit: true,
                    editingVersionId: profile.active_resume_version_id,
                  })}
                  className="text-xs px-3 py-1 bg-white border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded-lg font-medium transition-colors"
                >Edit</button>
              </div>

              {profile.target_role && (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-gray-800">{profile.target_role}</span>
                  {profile.experience_level != null && (
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${LEVEL_COLORS[profile.experience_level]}`}>
                      {LEVEL_LABELS[profile.experience_level]}
                    </span>
                  )}
                  {profile.target_role_years != null && (
                    <span className="text-xs text-gray-400">{profile.target_role_years} yr{profile.target_role_years !== 1 ? 's' : ''} in field</span>
                  )}
                </div>
              )}

              {profile.experience_years != null && (
                <p className="text-xs text-gray-500">{profile.experience_years} year{profile.experience_years !== 1 ? 's' : ''} total experience</p>
              )}
              {profile.experience_by_domain && profile.experience_by_domain.length > 0 && (
                <ul className="space-y-0.5">
                  {profile.experience_by_domain.map(d => (
                    <li key={d.domain} className="text-xs text-gray-500">{d.domain}: {d.years} yr{d.years !== 1 ? 's' : ''}</li>
                  ))}
                </ul>
              )}

              {activeVersion?.cv_analysis && (
                <p className="text-xs text-gray-500 italic border-l-2 border-gray-200 pl-3">{activeVersion.cv_analysis}</p>
              )}

              {activeVersion?.skills_matrix && activeVersion.skills_matrix.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-gray-600 mb-1.5">Skills</p>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {activeVersion.skills_matrix.map(s => (
                      <div key={s.name} className="flex items-center justify-between gap-1 min-w-0">
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
            </div>
          )
        })()}

        {/* Review / edit panel */}
        {review && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-4">
            <div>
              <p className="font-semibold text-amber-800 text-sm">{review.isManualEdit ? 'Edit profile data' : 'Review extracted data'}</p>
              <p className="text-xs text-amber-700 mt-0.5">{review.isManualEdit ? 'Make your changes and save.' : 'Correct anything that looks wrong, then save.'}</p>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Name</label>
              <input type="text" value={review.name} onChange={e => setReview({ ...review, name: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              {review.oldProfile?.name && review.oldProfile.name !== review.name && (
                <p className="text-xs text-gray-400">Previously: {review.oldProfile.name}</p>
              )}
            </div>

            {/* Experience years */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Total years of experience</label>
              <input type="number" min={0} value={review.experience_years}
                onChange={e => setReview({ ...review, experience_years: Math.max(0, Number(e.target.value)) })}
                className="w-24 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Domain breakdown */}
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
                    className="w-16 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <span className="text-xs text-gray-500">yrs</span>
                  <button onClick={() => { const u = review.experience_by_domain.filter((_, j) => j !== i); setReview({ ...review, experience_by_domain: u, experience_years: u.reduce((s, x) => s + x.years, 0) }) }}
                    className="text-xs text-red-500 hover:text-red-700 font-bold px-1">x</button>
                </div>
              ))}
              <button onClick={() => setReview({ ...review, experience_by_domain: [...review.experience_by_domain, { domain: '', years: 0 }] })}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium">+ Add domain</button>
            </div>

            {/* Target role */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Target role <span className="text-gray-400 font-normal">(AI inferred — edit if incorrect)</span></label>
              <input type="text" value={review.target_role} onChange={e => setReview({ ...review, target_role: e.target.value })}
                placeholder="e.g. Software Engineer"
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>

            {/* Years in target role + experience level */}
            <div className="flex gap-4 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Years in target role</label>
                <input type="number" min={0} value={review.target_role_years}
                  onChange={e => setReview({ ...review, target_role_years: Math.max(0, Number(e.target.value)) })}
                  className="w-24 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-600">Level in target role</label>
                <SkillLevelSelector level={review.experience_level} onChange={l => setReview({ ...review, experience_level: l })} />
                <p className="text-xs text-gray-400">{LEVEL_LABELS[review.experience_level]}: {LEVEL_DESCRIPTIONS[review.experience_level]}</p>
              </div>
            </div>

            {/* Skills matrix — 2-col grid with sliders */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Technical skills</label>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {review.skills_matrix.map((s, i) => (
                  <div key={i} className="space-y-0.5 min-w-0">
                    <div className="flex items-center gap-1">
                      <input type="text" value={s.name}
                        onChange={e => { const u = [...review.skills_matrix]; u[i] = { ...s, name: e.target.value }; setReview({ ...review, skills_matrix: u }) }}
                        className="flex-1 min-w-0 text-xs border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500" />
                      <button onClick={() => setReview({ ...review, skills_matrix: review.skills_matrix.filter((_, j) => j !== i) })}
                        className="text-xs text-red-400 hover:text-red-600 font-bold flex-shrink-0 leading-none">×</button>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <input type="range" min={1} max={5} step={1} value={s.level}
                        onChange={e => { const u = [...review.skills_matrix]; u[i] = { ...s, level: Number(e.target.value) as 1|2|3|4|5 }; setReview({ ...review, skills_matrix: u }) }}
                        className="flex-1 h-1 accent-blue-600 cursor-pointer" />
                      <span title={`${LEVEL_LABELS[s.level]}: ${LEVEL_DESCRIPTIONS[s.level]}`}
                        className={`text-xs px-1.5 py-0.5 rounded font-medium whitespace-nowrap flex-shrink-0 ${LEVEL_COLORS[s.level]}`}>
                        {LEVEL_LABELS[s.level]}
                      </span>
                    </div>
                  </div>
                ))}
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

            {/* CV Analysis */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">AI analysis <span className="text-gray-400 font-normal">(editable)</span></label>
              <textarea value={review.cv_analysis} onChange={e => setReview({ ...review, cv_analysis: e.target.value })}
                rows={3} className="w-full text-sm border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>

            {/* Actions */}
            {review.versionId && <p className="text-xs text-amber-700">Saving will make this the active version.</p>}
            <div className="flex flex-wrap gap-2 pt-1">
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
            <p className="text-xs font-medium text-gray-600">Versions</p>
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
