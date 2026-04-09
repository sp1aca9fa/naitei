import { useState, useEffect, useRef } from 'react'
import { getProfile, updateProfile } from '@/lib/api'

export function ProfileFiltersPage() {
  const [blocklist, setBlocklist] = useState<string[]>([])
  const [newBlockword, setNewBlockword] = useState('')
  const [displayMinScore, setDisplayMinScore] = useState(50)
  const [displayShowSkipped, setDisplayShowSkipped] = useState(false)
  const [recentThresholdHours, setRecentThresholdHours] = useState(48)

  const lastBlocklist = useRef<string[] | null>(null)
  const lastDisplay = useRef<{ min: number; skipped: boolean; hours: number } | null>(null)
  const blocklistTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const displayTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    getProfile()
      .then((p: { blocklist_words: string[] | null; display_min_score: number | null; display_show_skipped: boolean | null; recent_threshold_hours: number | null }) => {
        const bl = p.blocklist_words ?? []
        const min = p.display_min_score ?? 50
        const skipped = p.display_show_skipped ?? false
        const hours = p.recent_threshold_hours ?? 48
        lastBlocklist.current = bl
        lastDisplay.current = { min, skipped, hours }
        setBlocklist(bl)
        setDisplayMinScore(min)
        setDisplayShowSkipped(skipped)
        setRecentThresholdHours(hours)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!lastBlocklist.current) return
    if (JSON.stringify(blocklist) === JSON.stringify(lastBlocklist.current)) return
    if (blocklistTimer.current) clearTimeout(blocklistTimer.current)
    blocklistTimer.current = setTimeout(async () => {
      try {
        await updateProfile({ blocklist_words: blocklist })
        lastBlocklist.current = blocklist
      } catch { /* silent */ }
    }, 300)
    return () => { if (blocklistTimer.current) clearTimeout(blocklistTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocklist])

  useEffect(() => {
    if (!lastDisplay.current) return
    const current = { min: displayMinScore, skipped: displayShowSkipped, hours: recentThresholdHours }
    if (JSON.stringify(current) === JSON.stringify(lastDisplay.current)) return
    if (displayTimer.current) clearTimeout(displayTimer.current)
    displayTimer.current = setTimeout(async () => {
      try {
        await updateProfile({ display_min_score: displayMinScore, display_show_skipped: displayShowSkipped, recent_threshold_hours: recentThresholdHours })
        lastDisplay.current = current
      } catch { /* silent */ }
    }, 500)
    return () => { if (displayTimer.current) clearTimeout(displayTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayMinScore, displayShowSkipped, recentThresholdHours])

  function addBlockword() {
    const w = newBlockword.trim().toLowerCase()
    if (!w || blocklist.includes(w)) return
    setBlocklist([...blocklist, w])
    setNewBlockword('')
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Filters</h1>

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
          <button onClick={addBlockword} className="text-sm px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-gray-700 font-medium">Add</button>
        </div>
        {blocklist.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {blocklist.map(w => (
              <span key={w} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-1 rounded-full">
                {w}
                <button onClick={() => setBlocklist(blocklist.filter(b => b !== w))} className="hover:text-red-900 font-bold">x</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Display filters */}
      <section className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <h2 className="text-lg font-semibold text-gray-800">Job List Filters</h2>
        <p className="text-xs text-gray-500">Control which jobs appear in your list by default.</p>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Minimum match score</span>
            <span className="font-mono text-gray-600">{displayMinScore}</span>
          </div>
          <input
            type="range" min={0} max={100} value={displayMinScore}
            onChange={e => setDisplayMinScore(Number(e.target.value))}
            className="w-full accent-blue-600"
          />
          <p className="text-xs text-gray-400">Jobs scored below this will be hidden. Set to 0 to show all.</p>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox" checked={displayShowSkipped}
            onChange={e => setDisplayShowSkipped(e.target.checked)}
            className="w-4 h-4 accent-blue-600"
          />
          <div>
            <span className="text-sm text-gray-700">Show jobs recommended to skip</span>
            <p className="text-xs text-gray-400">Hidden by default. Enable to see jobs the AI flagged as not a good fit.</p>
          </div>
        </label>

        <div className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-700">Recent badge threshold</span>
            <span className="font-mono text-gray-600">{recentThresholdHours}h</span>
          </div>
          <select
            value={recentThresholdHours}
            onChange={e => setRecentThresholdHours(Number(e.target.value))}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={24}>24h — within the last day</option>
            <option value={48}>48h — within the last 2 days (recommended)</option>
            <option value={72}>72h — within the last 3 days</option>
            <option value={168}>7 days — within the last week</option>
          </select>
          <p className="text-xs text-gray-400">Jobs posted within this window show a "Recent" badge.</p>
        </div>
      </section>
    </div>
  )
}
