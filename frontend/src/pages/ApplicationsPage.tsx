import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { getApplications, updateApplication, getProfile, generateInterviewPrep, generateCoverLetter } from '../lib/api'

type AppStatus = 'saved' | 'applied' | 'interview' | 'offer' | 'removed'
type BonusType = '1_salary' | '2_salary' | '3_salary' | 'manual'

interface InterviewPrep {
  key_topics: string[]
  likely_questions: { question: string; tip: string }[]
  talking_points: string[]
  concerns_to_address: { potential_concern: string; how_to_address: string }[]
}

interface Application {
  id: string
  status: AppStatus
  created_at: string
  updated_at: string
  applied_at: string | null
  follow_up_date: string | null
  interview_round: number
  recruiter_name: string | null
  notes: string | null
  offer_monthly_salary: number | null
  offer_annual_salary: number | null
  offer_bonus_type: BonusType | null
  offer_bonus_amount: number | null
  offer_bonus_times: number | null
  offer_notes: string | null
  cover_letter: string | null
  cover_letter_generated_at: string | null
  interview_prep: InterviewPrep | null
  interview_prep_generated_at: string | null
  job_id: string
  jobs: {
    id: string
    title: string
    company: string | null
    ai_score: number | null
    ai_recommendation: string | null
    source: string | null
  } | null
}

const COLUMNS: { key: AppStatus; label: string }[] = [
  { key: 'saved', label: 'Saved' },
  { key: 'applied', label: 'Applied' },
  { key: 'interview', label: 'Interview' },
  { key: 'offer', label: 'Offer' },
]

const PREV_STATUS: Partial<Record<AppStatus, AppStatus>> = {
  applied: 'saved',
  interview: 'applied',
  offer: 'interview',
}

const NEXT_STATUS: Partial<Record<AppStatus, AppStatus>> = {
  saved: 'applied',
  applied: 'interview',
  interview: 'offer',
}

const NEXT_LABEL: Partial<Record<AppStatus, string>> = {
  saved: 'Mark Applied',
  applied: 'Got Interview',
  interview: 'Got Offer',
}

const REC_COLORS: Record<string, string> = {
  apply_now: 'bg-green-50 text-green-700',
  apply_with_tailoring: 'bg-yellow-50 text-yellow-700',
  save_for_later: 'bg-gray-100 text-gray-600',
  skip: 'bg-red-50 text-red-500',
}

const REC_LABELS: Record<string, string> = {
  apply_now: 'Apply now',
  apply_with_tailoring: 'Tailor first',
  save_for_later: 'Save for later',
  skip: 'Skip',
}

// ── Tax calculation (Tokyo, Japan estimates) ──────────────────────────────────

function employmentIncomeDeduction(gross: number): number {
  if (gross <= 1_625_000) return 550_000
  if (gross <= 1_800_000) return Math.floor(gross * 0.4)
  if (gross <= 3_600_000) return Math.floor(gross * 0.3) + 180_000
  if (gross <= 6_600_000) return Math.floor(gross * 0.2) + 540_000
  if (gross <= 8_500_000) return Math.floor(gross * 0.1) + 1_200_000
  return 1_950_000
}

function calcIncomeTax(taxable: number): number {
  if (taxable <= 0) return 0
  let tax = 0
  if (taxable <= 1_950_000) tax = taxable * 0.05
  else if (taxable <= 3_300_000) tax = taxable * 0.10 - 97_500
  else if (taxable <= 6_950_000) tax = taxable * 0.20 - 427_500
  else if (taxable <= 9_000_000) tax = taxable * 0.23 - 636_000
  else if (taxable <= 18_000_000) tax = taxable * 0.33 - 1_536_000
  else if (taxable <= 40_000_000) tax = taxable * 0.40 - 2_796_000
  else tax = taxable * 0.45 - 4_796_000
  return Math.floor(tax * 1.021) // +2.1% reconstruction surtax
}

function calcNetPay(grossAnnual: number) {
  const socialInsurance = Math.round(grossAnnual * 0.1475) // ~14.75% employee share
  const empDeduction = employmentIncomeDeduction(grossAnnual)
  const taxableIncome = Math.max(0, grossAnnual - empDeduction - 480_000 - socialInsurance)
  const incomeTax = calcIncomeTax(taxableIncome)
  const residentTax = Math.round(taxableIncome * 0.10)
  const totalDeductions = socialInsurance + incomeTax + residentTax
  return { socialInsurance, incomeTax, residentTax, totalDeductions, netAnnual: grossAnnual - totalDeductions }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const AI_DELAY_MS = parseFloat(import.meta.env.VITE_AI_REQUEST_DELAY_HOURS ?? import.meta.env.VITE_RESCORE_DELAY_HOURS ?? '24') * 3600 * 1000

function aiActionAvailableAt(generatedAt: string | null): Date | null {
  if (!generatedAt || AI_DELAY_MS <= 0) return null
  const available = new Date(new Date(generatedAt).getTime() + AI_DELAY_MS)
  return available > new Date() ? available : null
}

function formatAvailableIn(d: Date): string {
  const diffMs = d.getTime() - Date.now()
  const diffHours = diffMs / (3600 * 1000)
  if (diffHours >= 1) return `${Math.ceil(diffHours)}h`
  return `${Math.ceil(diffMs / 60000)}m`
}

function formatDate(iso: string | null): string {
  if (!iso) return ''
  return new Date(iso).toISOString().split('T')[0]
}

function toISODate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toISOString()
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString()
}

function formatJPY(n: number): string {
  return '¥' + n.toLocaleString('en-US')
}

function isStale(app: Application): boolean {
  if (!['applied', 'interview'].includes(app.status)) return false
  return (Date.now() - new Date(app.updated_at).getTime()) / 86400000 > 7
}

function followUpStatus(app: Application): 'overdue' | 'soon' | null {
  if (!app.follow_up_date) return null
  const diff = (new Date(app.follow_up_date).getTime() - Date.now()) / 86400000
  if (diff < 0) return 'overdue'
  if (diff <= 3) return 'soon'
  return null
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null
  const cls = score >= 70 ? 'text-green-700 bg-green-50' : score >= 50 ? 'text-yellow-700 bg-yellow-50' : 'text-red-600 bg-red-50'
  return <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${cls}`}>{score}</span>
}

// ── Offer details section ─────────────────────────────────────────────────────

function PrepSection({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{title}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-xs text-gray-600 flex gap-2">
            <span className="text-gray-300 shrink-0">•</span>{item}
          </li>
        ))}
      </ul>
    </div>
  )
}

function OfferDetails({ app, onUpdate }: { app: Application; onUpdate: (id: string, fields: Partial<Application>) => void }) {
  const [monthly, setMonthly] = useState(app.offer_monthly_salary?.toString() ?? '')
  const [annual, setAnnual] = useState(app.offer_annual_salary?.toString() ?? '')
  const [hasBonus, setHasBonus] = useState(app.offer_bonus_type !== null)
  const [bonusType, setBonusType] = useState<BonusType>(app.offer_bonus_type ?? '1_salary')
  const [bonusManual, setBonusManual] = useState(app.offer_bonus_amount?.toString() ?? '')
  const [bonusTimes, setBonusTimes] = useState(app.offer_bonus_times?.toString() ?? '2')
  const [bonusTimesCustom, setBonusTimesCustom] = useState(
    app.offer_bonus_times && app.offer_bonus_times > 3 ? app.offer_bonus_times.toString() : ''
  )
  const [offerNotes, setOfferNotes] = useState(app.offer_notes ?? '')

  const annualBase = parseInt(annual) || (parseInt(monthly) || 0) * 12
  const monthlyBase = parseInt(monthly) || 0

  function bonusPerPayment(): number {
    if (!hasBonus) return 0
    if (bonusType === '1_salary') return monthlyBase
    if (bonusType === '2_salary') return monthlyBase * 2
    if (bonusType === '3_salary') return monthlyBase * 3
    if (bonusType === 'manual') return parseInt(bonusManual) || 0
    return 0
  }

  function bonusTimesCount(): number {
    if (bonusTimes === 'custom') return parseInt(bonusTimesCustom) || 1
    return parseInt(bonusTimes) || 1
  }

  const totalBonus = bonusPerPayment() * bonusTimesCount()
  const totalGross = annualBase + totalBonus
  const tax = totalGross > 0 ? calcNetPay(totalGross) : null

  function saveBonus(overrides: Partial<{ type: BonusType; manual: string; times: string; timesCustom: string; has: boolean }> = {}) {
    const resolvedHas = overrides.has ?? hasBonus
    const resolvedType = overrides.type ?? bonusType
    const resolvedManual = overrides.manual ?? bonusManual
    const resolvedTimes = overrides.times ?? bonusTimes
    const resolvedTimesCustom = overrides.timesCustom ?? bonusTimesCustom
    const timesVal = resolvedTimes === 'custom' ? (parseInt(resolvedTimesCustom) || 1) : (parseInt(resolvedTimes) || 1)
    onUpdate(app.id, {
      offer_bonus_type: resolvedHas ? resolvedType : null,
      offer_bonus_amount: resolvedHas && resolvedType === 'manual' ? (parseInt(resolvedManual) || null) : null,
      offer_bonus_times: resolvedHas ? timesVal : null,
    })
  }

  function handleMonthlyBlur(val: string) {
    const n = parseInt(val) || null
    const annualCalc = n ? n * 12 : null
    setAnnual(annualCalc?.toString() ?? '')
    onUpdate(app.id, { offer_monthly_salary: n, offer_annual_salary: annualCalc })
  }

  function handleAnnualBlur(val: string) {
    const n = parseInt(val) || null
    const monthlyCalc = n ? Math.round(n / 12) : null
    setMonthly(monthlyCalc?.toString() ?? '')
    onUpdate(app.id, { offer_annual_salary: n, offer_monthly_salary: monthlyCalc })
  }

  const inputCls = "w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
  const labelCls = "text-xs text-gray-400 block mb-0.5"
  const radioCls = "flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer"

  const timesOptions = [
    { value: '1', label: 'Once' },
    { value: '2', label: 'Twice' },
    { value: '3', label: '3 times' },
    { value: 'custom', label: 'Custom' },
  ]

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Monthly salary (JPY)</label>
          <input
            type="number"
            value={monthly}
            onChange={e => { setMonthly(e.target.value); setAnnual(e.target.value ? (parseInt(e.target.value) * 12).toString() : '') }}
            onBlur={e => handleMonthlyBlur(e.target.value)}
            placeholder="e.g. 350000"
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Annual base (JPY)</label>
          <input
            type="number"
            value={annual}
            onChange={e => { setAnnual(e.target.value); setMonthly(e.target.value ? Math.round(parseInt(e.target.value) / 12).toString() : '') }}
            onBlur={e => handleAnnualBlur(e.target.value)}
            placeholder="e.g. 4200000"
            className={inputCls}
          />
        </div>
      </div>

      <div>
        <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={hasBonus} onChange={e => { setHasBonus(e.target.checked); saveBonus({ has: e.target.checked }) }} className="rounded" />
          Includes bonus
        </label>

        {hasBonus && (
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 pl-1">
            {/* Amount column */}
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">Amount per payment</p>
              {(['1_salary', '2_salary', '3_salary', 'manual'] as const).map(opt => (
                <label key={opt} className={radioCls}>
                  <input type="radio" name={`bonus-type-${app.id}`} checked={bonusType === opt}
                    onChange={() => { setBonusType(opt); saveBonus({ type: opt }) }} />
                  {opt === '1_salary' && '1 month salary'}
                  {opt === '2_salary' && '2 months salary'}
                  {opt === '3_salary' && '3 months salary'}
                  {opt === 'manual' && 'Custom amount'}
                </label>
              ))}
              {bonusType === 'manual' && (
                <input type="number" value={bonusManual}
                  onChange={e => setBonusManual(e.target.value)}
                  onBlur={e => saveBonus({ manual: e.target.value })}
                  placeholder="Amount (JPY)" className={inputCls} />
              )}
            </div>

            {/* Times column */}
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">Paid per year</p>
              {timesOptions.map(opt => (
                <label key={opt.value} className={radioCls}>
                  <input type="radio" name={`bonus-times-${app.id}`} checked={bonusTimes === opt.value}
                    onChange={() => { setBonusTimes(opt.value); saveBonus({ times: opt.value }) }} />
                  {opt.label}
                </label>
              ))}
              {bonusTimes === 'custom' && (
                <input type="number" value={bonusTimesCustom} min={1}
                  onChange={e => setBonusTimesCustom(e.target.value)}
                  onBlur={e => saveBonus({ timesCustom: e.target.value })}
                  placeholder="Times/year" className={inputCls} />
              )}
            </div>
          </div>
        )}
      </div>

      {tax && totalGross > 0 && (
        <div className="bg-white border border-gray-200 rounded p-3 space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>Annual base</span><span>{formatJPY(annualBase)}</span>
          </div>
          {hasBonus && totalBonus > 0 && (
            <div className="flex justify-between text-xs text-gray-500">
              <span>Bonus ({bonusTimesCount()}x/yr)</span><span>{formatJPY(totalBonus)}</span>
            </div>
          )}
          <div className="flex justify-between text-xs font-medium text-gray-700 border-t border-gray-100 pt-1 mt-1">
            <span>Total gross</span><span>{formatJPY(totalGross)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Social insurance (~14.75%)</span><span>-{formatJPY(tax.socialInsurance)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Income tax</span><span>-{formatJPY(tax.incomeTax)}</span>
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>Resident tax (~10%)</span><span>-{formatJPY(tax.residentTax)}</span>
          </div>
          <div className="flex justify-between text-xs font-semibold text-gray-800 border-t border-gray-100 pt-1 mt-1">
            <span>Est. annual take-home</span><span>{formatJPY(tax.netAnnual)}</span>
          </div>
          <div className="flex justify-between text-xs font-semibold text-blue-700">
            <span>Est. monthly take-home</span><span>{formatJPY(Math.round(tax.netAnnual / 12))}</span>
          </div>
          <p className="text-xs text-gray-300 pt-1">Estimates based on Tokyo, Japan average rates. Not a substitute for professional advice.</p>
        </div>
      )}

      <div>
        <label className={labelCls}>Other benefits / notes</label>
        <textarea
          value={offerNotes}
          onChange={e => setOfferNotes(e.target.value)}
          onBlur={e => { const v = e.target.value.trim() || null; if (v !== app.offer_notes) onUpdate(app.id, { offer_notes: v }) }}
          placeholder="Remote/hybrid, equity, health insurance, visa support..."
          rows={2}
          className={`${inputCls} resize-none`}
        />
      </div>
    </div>
  )
}

// ── Application card ──────────────────────────────────────────────────────────

function ApplicationCard({
  app,
  followUpDays,
  generatingPrep,
  generatingCoverLetter,
  onUpdate,
  onMove,
  onGeneratePrep,
  onGenerateCoverLetter,
}: {
  app: Application
  followUpDays: number
  generatingPrep: boolean
  generatingCoverLetter: boolean
  onUpdate: (id: string, fields: Partial<Application>) => void
  onMove: (id: string, status: AppStatus, extra?: Record<string, unknown>) => void
  onGeneratePrep: (force: boolean) => void
  onGenerateCoverLetter: (force: boolean) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [offerExpanded, setOfferExpanded] = useState(false)
  const [coverLetterExpanded, setCoverLetterExpanded] = useState(false)
  const [prepExpanded, setPrepExpanded] = useState(false)
  const [recruiterName, setRecruiterName] = useState(app.recruiter_name ?? '')
  const [notes, setNotes] = useState(app.notes ?? '')
  const [coverLetterText, setCoverLetterText] = useState(app.cover_letter ?? '')
  const [copied, setCopied] = useState(false)
  const prevId = useRef(app.id)

  useEffect(() => {
    if (prevId.current !== app.id) {
      setRecruiterName(app.recruiter_name ?? '')
      setNotes(app.notes ?? '')
      prevId.current = app.id
    }
  }, [app.id])

  // Sync cover letter text when generated (same card, new content)
  useEffect(() => {
    setCoverLetterText(app.cover_letter ?? '')
  }, [app.cover_letter])

  const job = app.jobs
  const next = NEXT_STATUS[app.status]
  const prev = PREV_STATUS[app.status]
  const fuStatus = followUpStatus(app)

  function handleMove(status: AppStatus) {
    const extra: Record<string, unknown> = {}
    if (status === 'applied' && !app.applied_at) {
      extra.applied_at = new Date().toISOString()
      extra.follow_up_date = addDays(extra.applied_at as string, followUpDays)
    }
    onMove(app.id, status, extra)
  }

  function handleDateChange(field: 'applied_at' | 'follow_up_date', value: string) {
    onUpdate(app.id, { [field]: value ? toISODate(value) : null })
  }

  function handleBlurText(field: 'recruiter_name' | 'notes', value: string) {
    const trimmed = value.trim() || null
    if (trimmed !== app[field]) onUpdate(app.id, { [field]: trimmed })
  }

  function handleRoundChange(delta: number) {
    onUpdate(app.id, { interview_round: Math.max(1, (app.interview_round ?? 1) + delta) })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header — click to expand */}
      <div className="p-3 cursor-pointer select-none hover:bg-gray-50 transition-colors" onClick={() => setExpanded(v => !v)}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <Link
              to={`/jobs/${app.job_id}`}
              className="text-sm font-medium text-gray-900 hover:text-blue-600 truncate block"
              onClick={e => e.stopPropagation()}
            >
              {job?.title ?? 'Untitled'}
            </Link>
            {job?.company && <p className="text-xs text-gray-500 truncate">{job.company}</p>}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <ScoreBadge score={job?.ai_score ?? null} />
            <span className={`text-xs px-1.5 py-0.5 rounded border font-medium transition-colors ${expanded ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'}`}>
              {expanded ? 'Less ▲' : 'More ▼'}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-1">
          {job?.ai_recommendation && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${REC_COLORS[job.ai_recommendation] ?? 'bg-gray-100 text-gray-600'}`}>
              {REC_LABELS[job.ai_recommendation] ?? job.ai_recommendation}
            </span>
          )}
          {app.status === 'interview' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
              Round {app.interview_round ?? 1}
            </span>
          )}
          {isStale(app) && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-orange-50 text-orange-600">No activity 7d+</span>
          )}
          {fuStatus === 'overdue' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600">Follow-up overdue</span>
          )}
          {fuStatus === 'soon' && (
            <span className="text-xs px-1.5 py-0.5 rounded bg-yellow-50 text-yellow-700">Follow-up soon</span>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="border-t border-gray-100 p-3 space-y-2 bg-gray-50" onClick={e => e.stopPropagation()}>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Applied date</label>
              <input
                type="date"
                defaultValue={formatDate(app.applied_at)}
                onChange={e => handleDateChange('applied_at', e.target.value)}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-0.5">Follow-up date</label>
              <input
                type="date"
                defaultValue={formatDate(app.follow_up_date)}
                onChange={e => handleDateChange('follow_up_date', e.target.value)}
                className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Recruiter / contact</label>
            <input
              type="text"
              value={recruiterName}
              onChange={e => setRecruiterName(e.target.value)}
              onBlur={e => handleBlurText('recruiter_name', e.target.value)}
              placeholder="Name, email, or LinkedIn"
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-0.5">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              onBlur={e => handleBlurText('notes', e.target.value)}
              placeholder="Interview prep, feedback, questions to ask..."
              rows={3}
              className="w-full text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
            />
          </div>

          {app.status === 'interview' && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">Interview round:</span>
              <button onClick={() => handleRoundChange(-1)} className="text-xs w-5 h-5 flex items-center justify-center border border-gray-200 rounded hover:bg-gray-100">-</button>
              <span className="text-xs font-medium">{app.interview_round ?? 1}</span>
              <button onClick={() => handleRoundChange(1)} className="text-xs w-5 h-5 flex items-center justify-center border border-gray-200 rounded hover:bg-gray-100">+</button>
            </div>
          )}

          {/* Interview prep — interview column only */}
          {app.status === 'interview' && (() => {
            const prepAvailableAt = aiActionAvailableAt(app.interview_prep_generated_at)
            const prepBlocked = !!prepAvailableAt
            return (
              <div className="border-t border-gray-100 pt-2">
                <button
                  onClick={() => setPrepExpanded(v => !v)}
                  className={`w-full text-xs px-2 py-1.5 rounded border font-medium transition-colors text-left ${prepExpanded ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Interview Prep {prepExpanded ? '▲' : '▼'}
                  {app.interview_prep && <span className="ml-1 text-green-600">✓</span>}
                </button>
                {prepExpanded && (
                  <div className="mt-3 space-y-3">
                    {generatingPrep ? (
                      <p className="text-xs text-gray-400 animate-pulse">Preparing interview guidance...</p>
                    ) : app.interview_prep ? (
                      <>
                        <PrepSection title="Topics to review" items={app.interview_prep.key_topics} />
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Likely questions</p>
                          <div className="space-y-2">
                            {app.interview_prep.likely_questions.map((q, i) => (
                              <div key={i} className="bg-white border border-gray-200 rounded p-2">
                                <p className="text-xs font-medium text-gray-700">{q.question}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{q.tip}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                        <PrepSection title="Talking points" items={app.interview_prep.talking_points} />
                        <div>
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Concerns to address</p>
                          <ul className="space-y-2">
                            {app.interview_prep.concerns_to_address.map((c, i) => (
                              <li key={i} className="text-xs text-gray-600">
                                <span className="font-medium text-gray-700">{c.potential_concern}</span>
                                <span className="block text-gray-500 mt-0.5">{c.how_to_address}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                        <button
                          onClick={() => !prepBlocked && !generatingPrep && onGeneratePrep(true)}
                          disabled={prepBlocked || generatingPrep}
                          className="text-xs text-gray-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {prepBlocked ? `Regenerate available in ${formatAvailableIn(prepAvailableAt!)}` : 'Regenerate'}
                        </button>
                      </>
                    ) : (
                      <div>
                        <p className="text-xs text-gray-400 mb-2">Interview prep could not be generated automatically.</p>
                        <button
                          onClick={() => !generatingPrep && onGeneratePrep(false)}
                          disabled={generatingPrep}
                          className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Generate now
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {/* Cover letter — all statuses */}
          {(() => {
            const clAvailableAt = aiActionAvailableAt(app.cover_letter_generated_at)
            const clBlocked = !!clAvailableAt
            return (
              <div className="border-t border-gray-100 pt-2">
                <button
                  onClick={() => setCoverLetterExpanded(v => !v)}
                  className={`w-full text-xs px-2 py-1.5 rounded border font-medium transition-colors text-left ${coverLetterExpanded ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                  Cover Letter {coverLetterExpanded ? '▲' : '▼'}
                  {app.cover_letter && <span className="ml-1 text-green-600">✓</span>}
                </button>
                {coverLetterExpanded && (
                  <div className="mt-3 space-y-2">
                    {generatingCoverLetter ? (
                      <p className="text-xs text-gray-400 animate-pulse">Generating cover letter...</p>
                    ) : app.cover_letter ? (
                      <>
                        <textarea
                          value={coverLetterText}
                          onChange={e => setCoverLetterText(e.target.value)}
                          onBlur={e => { const v = e.target.value.trim() || null; if (v !== app.cover_letter) onUpdate(app.id, { cover_letter: v }) }}
                          rows={10}
                          className="w-full text-xs border border-gray-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => { navigator.clipboard.writeText(coverLetterText); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                            className="text-xs px-2 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50"
                          >
                            {copied ? 'Copied!' : 'Copy'}
                          </button>
                          <button
                            onClick={() => !clBlocked && !generatingCoverLetter && onGenerateCoverLetter(true)}
                            disabled={clBlocked || generatingCoverLetter}
                            className="text-xs text-gray-400 hover:text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {clBlocked ? `Regenerate available in ${formatAvailableIn(clAvailableAt!)}` : 'Regenerate'}
                          </button>
                        </div>
                      </>
                    ) : (
                      <button
                        onClick={() => !generatingCoverLetter && onGenerateCoverLetter(false)}
                        disabled={generatingCoverLetter}
                        className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Generate Cover Letter
                      </button>
                    )}
                  </div>
                )}
              </div>
            )
          })()}

          {app.status === 'offer' && (
            <div className="border-t border-gray-100 pt-2">
              <button
                onClick={() => setOfferExpanded(v => !v)}
                className={`w-full text-xs px-2 py-1.5 rounded border font-medium transition-colors text-left ${offerExpanded ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
              >
                Offer Details {offerExpanded ? '▲' : '▼'}
              </button>
              {offerExpanded && (
                <div className="mt-3">
                  <OfferDetails app={app} onUpdate={onUpdate} />
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Action row */}
      <div className="px-3 pb-3 pt-1 flex items-center gap-2 flex-wrap">
        {prev && (
          <button onClick={() => handleMove(prev)} className="text-xs px-2 py-1 border border-gray-200 text-gray-500 rounded hover:bg-gray-50">
            ← Back
          </button>
        )}
        {next && (
          <button onClick={() => handleMove(next)} className="text-xs px-2 py-1 bg-blue-600 text-white rounded hover:bg-blue-700">
            {NEXT_LABEL[app.status]}
          </button>
        )}
        <button onClick={() => onMove(app.id, 'removed')} className="text-xs px-2 py-1 text-gray-400 hover:text-red-500 ml-auto">
          Remove
        </button>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [followUpDays, setFollowUpDays] = useState(7)
  const [showRemoved, setShowRemoved] = useState(false)
  const [generatingPrep, setGeneratingPrep] = useState<Record<string, boolean>>({})
  const [generatingCoverLetter, setGeneratingCoverLetter] = useState<Record<string, boolean>>({})

  useEffect(() => {
    Promise.all([getApplications(), getProfile()])
      .then(([appsData, profileData]) => {
        setApps(appsData)
        setFollowUpDays(profileData.follow_up_days ?? 7)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  async function handleUpdate(id: string, fields: Partial<Application>) {
    setApps(prev => prev.map(a => a.id === id ? { ...a, ...fields } : a))
    try {
      const updated = await updateApplication(id, fields as Record<string, unknown>)
      setApps(prev => prev.map(a => a.id === id ? { ...a, ...updated } : a))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save')
    }
  }

  async function handleMove(id: string, status: AppStatus, extra?: Record<string, unknown>) {
    const prevApp = apps.find(a => a.id === id)
    await handleUpdate(id, { status, ...extra } as Partial<Application>)

    // Auto-generate interview prep on first entry to Interview (silent — user can retry manually)
    if (status === 'interview' && prevApp?.status !== 'interview' && !prevApp?.interview_prep) {
      handleGeneratePrep(id, false, true)
    }
  }

  async function handleGeneratePrep(id: string, force: boolean, silent = false) {
    setGeneratingPrep(prev => ({ ...prev, [id]: true }))
    try {
      const result = await generateInterviewPrep(id, force)
      setApps(prev => prev.map(a => a.id === id ? { ...a, interview_prep: result, interview_prep_generated_at: new Date().toISOString() } : a))
    } catch (e) {
      if (!silent) setError(e instanceof Error ? e.message : 'Failed to generate interview prep')
    } finally {
      setGeneratingPrep(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  async function handleGenerateCoverLetter(id: string, force: boolean) {
    setGeneratingCoverLetter(prev => ({ ...prev, [id]: true }))
    try {
      const result = await generateCoverLetter(id, force)
      setApps(prev => prev.map(a => a.id === id ? { ...a, cover_letter: result.cover_letter, cover_letter_generated_at: result.cover_letter_generated_at ?? new Date().toISOString() } : a))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate cover letter')
    } finally {
      setGeneratingCoverLetter(prev => { const n = { ...prev }; delete n[id]; return n })
    }
  }

  const removed = apps.filter(a => a.status === 'removed')
  const active = apps.filter(a => a.status !== 'removed')

  return (
    <main className="max-w-6xl mx-auto px-6 py-12">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Applications</h2>
        <p className="text-sm text-gray-400 mt-1">Track your job application pipeline.</p>
      </div>

      {error && <p className="text-sm text-red-500 mb-4">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : active.length === 0 && removed.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No applications yet.</p>
          <p className="text-xs mt-1">Save a job from its detail page to add it here.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {COLUMNS.map(col => {
              const colApps = active.filter(a => a.status === col.key)
              return (
                <div key={col.key} className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{col.label}</h3>
                    <span className="text-xs text-gray-400">{colApps.length}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    {colApps.length === 0
                      ? <div className="border border-dashed border-gray-200 rounded-lg h-16" />
                      : colApps.map(app => (
                          <ApplicationCard
                            key={app.id}
                            app={app}
                            followUpDays={followUpDays}
                            generatingPrep={!!generatingPrep[app.id]}
                            generatingCoverLetter={!!generatingCoverLetter[app.id]}
                            onUpdate={handleUpdate}
                            onMove={handleMove}
                            onGeneratePrep={(force) => handleGeneratePrep(app.id, force)}
                            onGenerateCoverLetter={(force) => handleGenerateCoverLetter(app.id, force)}
                          />
                        ))
                    }
                  </div>
                </div>
              )
            })}
          </div>

          {removed.length > 0 && (
            <div className="mt-8 border-t border-gray-100 pt-6">
              <button onClick={() => setShowRemoved(v => !v)} className="text-xs text-gray-400 hover:text-gray-600">
                {showRemoved ? 'Hide' : 'Show'} removed ({removed.length})
              </button>
              {showRemoved && (
                <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {removed.map(app => (
                    <div key={app.id} className="bg-white border border-gray-200 rounded-lg p-3 opacity-50">
                      <Link to={`/jobs/${app.job_id}`} className="text-sm text-gray-700 hover:text-blue-600 block truncate">
                        {app.jobs?.title ?? 'Untitled'}
                      </Link>
                      {app.jobs?.company && <p className="text-xs text-gray-400 truncate">{app.jobs.company}</p>}
                      <button onClick={() => handleMove(app.id, 'saved')} className="text-xs text-gray-400 hover:text-gray-700 mt-2">
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </main>
  )
}
