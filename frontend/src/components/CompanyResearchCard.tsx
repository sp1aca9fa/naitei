import { useState, useEffect, useRef } from 'react'
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

export function CompanyResearchCard({ companyName: initialCompany }: { companyName?: string } = {}) {
  const [query, setQuery] = useState(initialCompany ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [result, setResult] = useState<CompanyResearch | null>(null)
  const [searchedName, setSearchedName] = useState('')
  const [notFound, setNotFound] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const justSelectedRef = useRef(false)

  // Auto-research when company name is provided as prop
  useEffect(() => {
    if (!initialCompany) return
    setSearchedName(initialCompany)
    setGenerating(true)
    researchCompany(initialCompany)
      .then(data => setResult(data))
      .catch(err => {
        const msg = err instanceof Error ? err.message : 'Research failed'
        if (msg.includes('not_found')) setNotFound(true)
        else setError(msg)
      })
      .finally(() => setGenerating(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    const name = query.trim()
    setSearchedName(name)
    setShowDropdown(false)
    setResult(null)
    setNotFound(false)
    setError(null)
    setGenerating(true)
    try {
      const data = await researchCompany(name)
      setResult(data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Research failed'
      if (msg.includes('not_found')) {
        setNotFound(true)
      } else {
        setError(msg)
      }
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">
        Company Research
      </h2>

      {!initialCompany && <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1" ref={containerRef}>
          <input
            type="text"
            placeholder="Company name"
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
          disabled={generating || !query.trim()}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
        >
          {generating ? 'Generating...' : 'Research'}
        </button>
      </form>}

      {generating && <p className="text-sm text-gray-400 mb-4">Loading...</p>}
      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {notFound && (
        <div className="text-sm text-gray-500 border border-gray-200 rounded p-4">
          <p className="font-medium text-gray-700 mb-1">No data found for "{searchedName}"</p>
          <p>
            We don't have this company in our database yet.{' '}
            <span className="text-gray-400">(A page to request manual company registration is coming soon.)</span>
          </p>
        </div>
      )}

      {result && (
        <div className="space-y-5">
          <div>
            <h3 className="text-base font-semibold text-gray-900">{result.company_name}</h3>
            <p className="text-sm text-gray-600 mt-1">{result.overview}</p>
            <p className="text-sm text-gray-500 italic mt-1">{result.known_for}</p>
          </div>

          <Section title="Tech Stack">
            <TagList items={result.tech_stack} color="blue" />
          </Section>

          <Section title="Culture Signals">
            <TagList items={result.culture_signals} color="purple" />
          </Section>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Section title="Green Flags">
              <BulletList items={result.green_flags} color="green" />
            </Section>
            <Section title="Red Flags">
              <BulletList items={result.red_flags} color="red" />
            </Section>
          </div>

          <Section title="Interview Tips">
            <BulletList items={result.interview_tips} color="gray" />
          </Section>

          <Section title="Typical Roles">
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
