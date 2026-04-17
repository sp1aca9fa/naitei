import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { searchCompanies, researchCompany } from '../lib/api'

interface CompanyResearch {
  company_name: string
  overview: string
  known_for: string
  tech_stack: string[]
  culture_signals: string[]
  green_flags: string[]
  red_flags: string[]
  interview_tips: string[]
  typical_roles: string[]
}

interface Suggestion {
  id: string
  name: string
  research: CompanyResearch
}

export function CompanyResearchCard({ companyName: initialCompany, credits }: { companyName?: string; credits?: number } = {}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState(initialCompany ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [result, setResult] = useState<CompanyResearch | null>(null)
  const [searchedName, setSearchedName] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [noCredits, setNoCredits] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableCredits, setAvailableCredits] = useState(credits ?? 0)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const justSelectedRef = useRef(false)

  useEffect(() => {
    if (credits !== undefined) setAvailableCredits(credits)
  }, [credits])

  // Debounced search for dropdown
  useEffect(() => {
    if (justSelectedRef.current) {
      justSelectedRef.current = false
      return
    }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.length < 2) {
      setSuggestions([])
      setShowDropdown(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await searchCompanies(query) as Suggestion[]
        setSuggestions(data)
        setShowDropdown(data.length > 0)
      } catch {
        // silent — suggestions are best-effort
      }
    }, 300)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [query])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function selectSuggestion(s: Suggestion) {
    justSelectedRef.current = true
    setQuery(s.name)
    setResult(s.research)
    setSearchedName(s.name)
    setNotFound(false)
    setError(null)
    setShowDropdown(false)
  }

  async function doResearch(name: string) {
    setSearchedName(name)
    setShowDropdown(false)
    setResult(null)
    setNotFound(false)
    setNoCredits(false)
    setError(null)
    setGenerating(true)
    try {
      const data = await researchCompany(name)
      setResult(data)
      setAvailableCredits(c => Math.max(0, c - 1))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Research failed'
      if (msg.includes('not_found')) setNotFound(true)
      else if (msg.includes('no_credits')) { setNoCredits(true); setAvailableCredits(0) }
      else setError(msg)
    } finally {
      setGenerating(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    await doResearch(query.trim())
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">{t('company.title')}</h2>
        <span className="text-xs text-gray-400">{t('company.credits', { count: availableCredits })}</span>
      </div>

      {/* Dashboard mode: search form */}
      {!initialCompany && credits !== undefined && availableCredits <= 0 && (
        <p className="text-xs text-gray-400 mb-3">{t('company.noCredits')}</p>
      )}
      {!initialCompany && <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1" ref={containerRef}>
          <input
            type="text"
            placeholder={t('company.placeholder')}
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setResult(null)
              setNotFound(false)
              setError(null)
            }}
            onFocus={() => { if (suggestions.length > 0) setShowDropdown(true) }}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {showDropdown && (
            <ul className="absolute z-10 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-md max-h-48 overflow-y-auto">
              {suggestions.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                    onMouseDown={() => selectSuggestion(s)}
                  >
                    {s.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="submit"
          disabled={generating || !query.trim() || availableCredits <= 0}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {generating ? t('common.generating') : t('company.research')}
        </button>
      </form>}

      {/* Job detail mode: request button */}
      {initialCompany && !result && !generating && (
        <div className="mb-4">
          <button
            onClick={() => doResearch(initialCompany)}
            disabled={generating || availableCredits <= 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('company.requestResearch')}
          </button>
          {availableCredits <= 0 && (
            <p className="text-xs text-gray-400 mt-2">{t('company.noCredits')}</p>
          )}
        </div>
      )}

      {generating && (
        <div className="mb-4 space-y-1">
          <p className="text-sm text-gray-500">{t('company.researching')}</p>
          <div className="w-full h-1 bg-gray-100 rounded overflow-hidden">
            <div className="h-1 bg-blue-400 rounded animate-pulse w-2/3" />
          </div>
        </div>
      )}
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
      {noCredits && (
        <p className="text-sm text-gray-500 mb-4">{t('company.noCredits')}</p>
      )}

      {notFound && (
        <div className="text-sm text-gray-500 border border-gray-200 rounded p-4">
          <p className="font-medium text-gray-700 mb-1">{t('company.notFoundTitle', { name: searchedName })}</p>
          <p>{t('company.notFoundDesc')}</p>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{result.company_name}</h3>
            <p className="text-sm text-gray-600 mt-1">{result.overview}</p>
            <p className="text-sm text-gray-500 italic mt-1">{result.known_for}</p>
          </div>

          <Section title={t('company.techStack')}>
            <TagList items={result.tech_stack} color="blue" />
          </Section>

          <Section title={t('company.cultureSignals')}>
            <TagList items={result.culture_signals} color="purple" />
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section title={t('company.greenFlags')}>
              <BulletList items={result.green_flags} color="green" />
            </Section>
            <Section title={t('company.redFlags')}>
              <BulletList items={result.red_flags} color="red" />
            </Section>
          </div>

          <Section title={t('company.interviewTips')}>
            <BulletList items={result.interview_tips} color="gray" />
          </Section>

          <Section title={t('company.typicalRoles')}>
            <TagList items={result.typical_roles} color="gray" />
          </Section>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{title}</h4>
      {children}
    </div>
  )
}

function TagList({ items, color }: { items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    purple: 'bg-purple-50 text-purple-700',
    gray: 'bg-gray-100 text-gray-700',
  }
  const cls = colorMap[color] ?? colorMap.gray
  return (
    <div className="flex flex-wrap gap-2">
      {items.map(item => (
        <span key={item} className={`text-xs px-2 py-1 rounded ${cls}`}>{item}</span>
      ))}
    </div>
  )
}

function BulletList({ items, color }: { items: string[]; color: string }) {
  const colorMap: Record<string, string> = {
    green: 'text-green-600',
    red: 'text-red-500',
    gray: 'text-gray-600',
  }
  const cls = colorMap[color] ?? colorMap.gray
  return (
    <ul className="space-y-1">
      {items.map(item => (
        <li key={item} className={`text-sm flex gap-2 ${cls}`}>
          <span className="mt-0.5 shrink-0">{color === 'green' ? '+' : color === 'red' ? '-' : '•'}</span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}
