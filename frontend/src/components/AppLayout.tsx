import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/context/AuthContext'
import { getProfile, updateProfile } from '@/lib/api'

function UserDropdown({ hasResume }: { hasResume: boolean }) {
  const { user, signOut } = useAuth()
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const initial = (user?.email ?? '?')[0].toUpperCase()

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative w-8 h-8 rounded-full bg-blue-600 text-white text-sm font-semibold flex items-center justify-center hover:bg-blue-700 focus:outline-none"
      >
        {initial}
        {!hasResume && (
          <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 bg-white border border-gray-200 rounded shadow-md z-20">
          {!hasResume && (
            <div className="px-4 py-2 text-xs text-amber-700 bg-amber-50 border-b border-amber-100">
              {t('userMenu.resumeNotSetUp')}
            </div>
          )}
          <div className="px-4 py-2 text-xs text-gray-400 truncate border-b border-gray-100">{user?.email}</div>
          <Link to="/profile/weights" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('userMenu.scoreWeights')}</Link>
          <Link to="/profile/filters" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('userMenu.filtersBlocklist')}</Link>
          <Link to="/profile/notifications" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">{t('userMenu.emailNotifications')}</Link>
          <div className="border-t border-gray-100 mt-1">
            <button onClick={signOut} className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">{t('userMenu.signOut')}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function ApplicationsDropdown() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
      >
        {t('nav.applications')}
        <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-white border border-gray-200 rounded shadow-md z-20">
          <Link to="/applications" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {t('nav.pipeline')}
          </Link>
          <Link to="/interview-prep" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {t('nav.interviewPrep')}
          </Link>
          <Link to="/optimizations" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {t('nav.cvOptimizations')}
          </Link>
        </div>
      )}
    </div>
  )
}

function JobsDropdown() {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-1"
      >
        {t('nav.jobs')}
        <svg className="w-3 h-3 text-gray-400" viewBox="0 0 12 12" fill="currentColor">
          <path d="M6 8L1 3h10L6 8z" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-36 bg-white border border-gray-200 rounded shadow-md z-20">
          <Link to="/jobs" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {t('nav.myJobs')}
          </Link>
          <Link to="/jobs/analyze" onClick={() => setOpen(false)} className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
            {t('nav.analyzeJob')}
          </Link>
        </div>
      )}
    </div>
  )
}

function LanguageToggle() {
  const { i18n } = useTranslation()
  const lang = i18n.language.startsWith('ja') ? 'ja' : 'en'

  function toggle() {
    const next = lang === 'en' ? 'ja' : 'en'
    i18n.changeLanguage(next)
    updateProfile({ language: next }).catch(() => {})
  }

  return (
    <button
      onClick={toggle}
      className="text-xs font-semibold px-2 py-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors"
    >
      {lang === 'en' ? 'JP' : 'EN'}
    </button>
  )
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const { t, i18n } = useTranslation()
  const [hasResume, setHasResume] = useState(true)

  useEffect(() => {
    getProfile().then(p => {
      setHasResume(!!p.active_resume_version_id)
      if (p.language && p.language !== i18n.language) {
        i18n.changeLanguage(p.language)
      }
    }).catch(() => {})

    function handleResumeStatusChange(e: Event) {
      setHasResume((e as CustomEvent<{ hasResume: boolean }>).detail.hasResume)
    }
    window.addEventListener('resume-status-changed', handleResumeStatusChange)
    return () => window.removeEventListener('resume-status-changed', handleResumeStatusChange)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link to="/dashboard"><h1 className="text-lg font-bold text-gray-900 hover:text-gray-700 transition-colors">Naitei</h1></Link>
          <LanguageToggle />
        </div>
        <div className="flex items-center gap-4">
          <Link to="/dashboard" className="text-sm text-gray-600 hover:text-gray-900">{t('nav.dashboard')}</Link>
          <JobsDropdown />
          <ApplicationsDropdown />
          <Link to="/insights" className="text-sm text-gray-600 hover:text-gray-900">{t('nav.insights')}</Link>
          <Link to="/profile/resume" className="text-sm px-3 py-1 border border-blue-200 rounded-lg text-blue-600 hover:bg-blue-50 font-medium transition-colors">{t('nav.resume')}</Link>
          <UserDropdown hasResume={hasResume} />
        </div>
      </header>
      {children}
    </div>
  )
}
