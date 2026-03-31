import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile, uploadResume } from '@/lib/api'

interface ScoreWeights {
  skills: number
  language: number
  company: number
  location: number
  growth: number
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
  experience_summary: string | null
  score_weights: ScoreWeights | null
  blocklist_words: string[] | null
  active_resume_version_id: string | null
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
    setUploading(true)
    setUploadMsg(null)
    try {
      const res = await uploadResume(file)
      setProfile(res.profile)
      setUploadMsg({ type: 'ok', text: `Parsed successfully. Detected ${res.parsed.skills?.length ?? 0} skills.` })
    } catch (err) {
      setUploadMsg({ type: 'err', text: err instanceof Error ? err.message : 'Upload failed' })
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
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

        {profile?.active_resume_version_id ? (
          <div className="text-sm text-gray-600">
            <p className="font-medium text-gray-800">{profile.name ?? 'Name not detected'}</p>
            {profile.experience_years != null && (
              <p>{profile.experience_years} year{profile.experience_years !== 1 ? 's' : ''} experience</p>
            )}
            {profile.skills && profile.skills.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {profile.skills.map(s => (
                  <span key={s} className="bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">No resume uploaded yet.</p>
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
