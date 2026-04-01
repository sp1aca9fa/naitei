import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile, uploadResume } from '@/lib/api'

interface ScoreWeights {
  skills: number
  language: number
  company: number
  location: number
  growth: number
}

interface DomainEntry {
  domain: string
  years: number
}

interface Profile {
  id: string
  name: string | null
  email: string | null
  location_area: string | null
  preferred_language_env: string | null
  work_style: string | null
  skills: string[] | null
  experience_years: number | null
  experience_by_domain: DomainEntry[] | null
  experience_summary: string | null
  score_weights: ScoreWeights | null
  blocklist_words: string[] | null
  active_resume_version_id: string | null
}

interface ReviewState {
  name: string
  skills: string[]
  experience_years: number
  experience_by_domain: DomainEntry[]
  experience_summary: string
  oldProfile: Profile | null
  isManualEdit?: boolean
}

const DEFAULT_WEIGHTS: ScoreWeights = { skills: 30, language: 25, company: 20, location: 15, growth: 10 }

export function ProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [weights, setWeights] = useState<ScoreWeights>(DEFAULT_WEIGHTS)
  const [blocklist, setBlocklist] = useState<string[]>([])
  const [newBlockword, setNewBlockword] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [uploadMsg, setUploadMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [saveMsg, setSaveMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [review, setReview] = useState<ReviewState | null>(null)
  const [skillInput, setSkillInput] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProfile()
      .then((p: Profile) => {
        setProfile(p)
        setWeights(p.score_weights ?? DEFAULT_WEIGHTS)
        setBlocklist(p.blocklist_words ?? [])
      })
      .catch(() => {})
  }, [])

  async function handleResumeUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const oldProfile = profile
    setUploading(true)
    setUploadMsg(null)
    setReview(null)
    try {
      const res = await uploadResume(file)
      setProfile(res.profile)
      setReview({
        name: res.parsed.name ?? '',
        skills: res.parsed.skills ?? [],
        experience_years: res.parsed.experience_years ?? 0,
        experience_by_domain: res.parsed.experience_by_domain ?? [],
        experience_summary: res.parsed.experience_summary ?? '',
        oldProfile,
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
      const updated = await updateProfile({
        name: review.name,
        skills: review.skills,
        experience_years: review.experience_years,
        experience_by_domain: review.experience_by_domain,
        experience_summary: review.experience_summary,
      })
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
        skills: old.skills ?? [],
        experience_years: old.experience_years ?? 0,
        experience_by_domain: old.experience_by_domain ?? [],
        experience_summary: old.experience_summary ?? '',
      })
      setProfile(updated)
      setReview(null)
    } catch (err) {
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Revert failed' })
    } finally {
      setSaving(false)
    }
  }

  function addReviewSkill() {
    const s = skillInput.trim()
    if (!s || !review || review.skills.includes(s)) return
    setReview({ ...review, skills: [...review.skills, s] })
    setSkillInput('')
  }

  async function handleSavePreferences() {
    setSaving(true)
    setSaveMsg(null)
    try {
      const updated = await updateProfile({ score_weights: weights, blocklist_words: blocklist })
      setProfile(updated)
      setSaveMsg({ type: 'ok', text: 'Saved.' })
    } catch (err) {
      setSaveMsg({ type: 'err', text: err instanceof Error ? err.message : 'Save failed' })
    } finally {
      setSaving(false)
    }
  }

  function addBlockword() {
    const w = newBlockword.trim().toLowerCase()
    if (!w || blocklist.includes(w)) return
    setBlocklist([...blocklist, w])
    setNewBlockword('')
  }

  function removeBlockword(w: string) {
    setBlocklist(blocklist.filter(b => b !== w))
  }

  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Profile</h1>

      {/* Resume */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Resume</h2>

        {profile?.active_resume_version_id && !review && (
          <div className="text-sm text-gray-600">
            <div className="flex items-center justify-between mb-1">
              <p className="font-medium text-gray-800">{profile.name ?? 'Name not detected'}</p>
              <button
                onClick={() => setReview({
                  name: profile.name ?? '',
                  skills: profile.skills ?? [],
                  experience_years: profile.experience_years ?? 0,
                  experience_by_domain: profile.experience_by_domain ?? [],
                  experience_summary: profile.experience_summary ?? '',
                  oldProfile: profile,
                  isManualEdit: true,
                })}
                className="text-xs px-3 py-1 bg-white border border-gray-300 hover:border-blue-400 hover:text-blue-600 text-gray-600 rounded-lg font-medium transition-colors"
              >Edit</button>
            </div>
            {profile.experience_years != null && (
              <p>{profile.experience_years} year{profile.experience_years !== 1 ? 's' : ''} experience total</p>
            )}
            {profile.experience_by_domain && profile.experience_by_domain.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {profile.experience_by_domain.map(d => (
                  <li key={d.domain} className="text-xs text-gray-500">
                    {d.domain}: {d.years} year{d.years !== 1 ? 's' : ''}
                  </li>
                ))}
              </ul>
            )}
            {profile.skills && profile.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {profile.skills.map(s => (
                  <span key={s} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Review panel */}
        {review && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-4 space-y-4">
            <div>
              <p className="font-semibold text-amber-800 text-sm">{review.isManualEdit ? 'Edit profile data' : 'Review extracted data'}</p>
              <p className="text-xs text-amber-700 mt-0.5">{review.isManualEdit ? 'Make your changes and save.' : 'Correct anything that looks wrong, then save.'}</p>
            </div>

            {/* Name */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Name</label>
              <input
                type="text"
                value={review.name}
                onChange={e => setReview({ ...review, name: e.target.value })}
                className="w-full text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {review.oldProfile?.name && review.oldProfile.name !== review.name && (
                <p className="text-xs text-gray-400">Previously: {review.oldProfile.name}</p>
              )}
            </div>

            {/* Experience years */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-600">Total years of experience</label>
              <input
                type="number"
                min={0}
                value={review.experience_years}
                onChange={e => setReview({ ...review, experience_years: Math.max(0, Number(e.target.value)) })}
                className="w-24 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {review.oldProfile?.experience_years != null && review.oldProfile.experience_years !== review.experience_years && (
                <p className="text-xs text-gray-400">Previously: {review.oldProfile.experience_years}</p>
              )}
            </div>

            {/* Domain breakdown (editable) */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Experience breakdown</label>
              {review.experience_by_domain.map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={d.domain}
                    onChange={e => {
                      const updated = [...review.experience_by_domain]
                      updated[i] = { ...d, domain: e.target.value }
                      setReview({ ...review, experience_by_domain: updated })
                    }}
                    placeholder="Domain"
                    className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <input
                    type="number"
                    min={0}
                    value={d.years}
                    onChange={e => {
                      const updated = [...review.experience_by_domain]
                      updated[i] = { ...d, years: Math.max(0, Number(e.target.value)) }
                      setReview({ ...review, experience_by_domain: updated, experience_years: updated.reduce((s, x) => s + x.years, 0) })
                    }}
                    className="w-16 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">yrs</span>
                  <button
                    onClick={() => {
                      const updated = review.experience_by_domain.filter((_, j) => j !== i)
                      setReview({ ...review, experience_by_domain: updated, experience_years: updated.reduce((s, x) => s + x.years, 0) })
                    }}
                    className="text-xs text-red-500 hover:text-red-700 font-bold px-1"
                  >x</button>
                </div>
              ))}
              <button
                onClick={() => setReview({ ...review, experience_by_domain: [...review.experience_by_domain, { domain: '', years: 0 }] })}
                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
              >+ Add domain</button>
              {review.oldProfile?.experience_by_domain && review.oldProfile.experience_by_domain.length > 0 && (
                <p className="text-xs text-gray-400">
                  Previously: {review.oldProfile.experience_by_domain.map(d => `${d.domain} (${d.years}y)`).join(', ')}
                </p>
              )}
            </div>

            {/* Skills */}
            <div className="space-y-2">
              <label className="text-xs font-medium text-gray-600">Skills</label>
              <div className="flex flex-wrap gap-1">
                {review.skills.map(s => {
                  const isNew = !review.oldProfile?.skills?.includes(s)
                  return (
                    <span
                      key={s}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${isNew && review.oldProfile?.active_resume_version_id ? 'bg-green-50 text-green-700' : 'bg-blue-50 text-blue-700'}`}
                    >
                      {s}
                      <button
                        onClick={() => setReview({ ...review, skills: review.skills.filter(x => x !== s) })}
                        className="hover:opacity-70 font-bold leading-none"
                      >x</button>
                    </span>
                  )
                })}
                {/* Removed skills shown as strikethrough */}
                {review.oldProfile?.skills?.filter(s => !review.skills.includes(s)).map(s => (
                  <span key={s} className="inline-flex items-center gap-1 bg-gray-100 text-gray-400 text-xs px-2 py-0.5 rounded-full line-through">
                    {s}
                    <button
                      onClick={() => setReview({ ...review, skills: [...review.skills, s] })}
                      title="Restore"
                      className="hover:text-gray-600 font-bold leading-none no-underline"
                    >+</button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={skillInput}
                  onChange={e => setSkillInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addReviewSkill()}
                  placeholder="Add skill..."
                  className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  onClick={addReviewSkill}
                  className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium"
                >Add</button>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                onClick={handleSaveCorrections}
                disabled={saving}
                className="text-sm px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
              {review.oldProfile?.active_resume_version_id && (
                <button
                  onClick={handleRevertReview}
                  disabled={saving}
                  className="text-sm px-4 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium disabled:opacity-50"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {profile?.active_resume_version_id ? 'Upload new version' : 'Upload PDF resume'}
          </label>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf"
            onChange={handleResumeUpload}
            disabled={uploading}
            className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
          />
          {uploading && <p className="text-sm text-gray-500 mt-1">Extracting and parsing...</p>}
          {uploadMsg && (
            <p className={`text-sm mt-1 ${uploadMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
              {uploadMsg.text}
            </p>
          )}
        </div>
      </section>

      {/* Score weights */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-800">Score Weights</h2>
          <span className={`text-sm font-medium ${totalWeight === 100 ? 'text-green-600' : 'text-amber-600'}`}>
            Total: {totalWeight}/100
          </span>
        </div>
        <p className="text-xs text-gray-500">Adjust how each category affects your job-fit score.</p>

        {(Object.entries(weights) as [keyof ScoreWeights, number][]).map(([key, val]) => (
          <div key={key} className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="capitalize text-gray-700">{key === 'language' ? 'Language / Env' : key}</span>
              <span className="font-mono text-gray-600">{val}</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={val}
              onChange={e => setWeights({ ...weights, [key]: Number(e.target.value) })}
              className="w-full accent-blue-600"
            />
          </div>
        ))}
      </section>

      {/* Blocklist */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Blocklist Words</h2>
        <p className="text-xs text-gray-500">Jobs containing these phrases will be skipped before scoring (saves AI tokens).</p>

        <div className="flex gap-2">
          <input
            type="text"
            value={newBlockword}
            onChange={e => setNewBlockword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addBlockword()}
            placeholder="e.g. 10 years experience"
            className="flex-1 text-sm border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={addBlockword}
            className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium"
          >
            Add
          </button>
        </div>

        {blocklist.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {blocklist.map(w => (
              <span key={w} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-1 rounded-full">
                {w}
                <button onClick={() => removeBlockword(w)} className="hover:text-red-900 font-bold">x</button>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center gap-4">
        <button
          onClick={handleSavePreferences}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save preferences'}
        </button>
        {saveMsg && (
          <p className={`text-sm ${saveMsg.type === 'ok' ? 'text-green-600' : 'text-red-600'}`}>
            {saveMsg.text}
          </p>
        )}
      </div>
    </div>
  )
}
