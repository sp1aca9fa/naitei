import axios from 'axios'
import * as cheerio from 'cheerio'

interface ScrapeResult {
  description: string
  title?: string
  company?: string
  postedAt?: Date
}

const DESCRIPTION_SELECTORS = [
  '[data-testid="job-description"]',
  '.job-description',
  '#job-description',
  '[class*="jobDescription"]',
  '[class*="job-detail"]',
  '[class*="jobDetail"]',
  '[class*="description"]',
  'article',
  'main',
]

const TITLE_SELECTORS = [
  'h1',
  '[data-testid="job-title"]',
  '[class*="jobTitle"]',
  '[class*="job-title"]',
]

const COMPANY_SELECTORS = [
  '[data-testid="company-name"]',
  '[class*="companyName"]',
  '[class*="company-name"]',
]

const LOGIN_KEYWORDS = ['sign in', 'log in', 'login', 'create account', 'join now', 'register']

export async function scrapeJobUrl(url: string): Promise<ScrapeResult> {
  let html: string
  try {
    const res = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1)',
        'Accept': 'text/html',
      },
      maxRedirects: 5,
    })
    html = res.data
  } catch {
    throw new Error('fetch_failed')
  }

  const $ = cheerio.load(html)

  // Login wall check — do this before removing anything
  const pageTitle = $('title').first().text().toLowerCase()
  if (LOGIN_KEYWORDS.some(kw => pageTitle.includes(kw))) {
    throw new Error('login_wall')
  }

  // Parse JSON-LD BEFORE removing script tags
  let jsonLd: Record<string, unknown> | null = null
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLd) return
    try {
      const parsed = JSON.parse($(el).text())
      if (parsed['@type'] === 'JobPosting' || parsed.hiringOrganization || parsed.title) {
        jsonLd = parsed
      }
    } catch { /* ignore malformed JSON-LD */ }
  })

  // Remove noise
  $('script, style, noscript, iframe, nav, footer, header, [role="banner"], [role="navigation"], ' +
    '[class*="breadcrumb"], [class*="sidebar"], [class*="related"], ' +
    '[class*="similar"], [class*="recommend"], aside').remove()

  // Insert newlines around block elements so text extraction preserves structure
  $('p, li, h1, h2, h3, h4, h5, h6, br, tr, div, section, article').each((_, el) => {
    $(el).prepend('\n').append('\n')
  })

  function readableText(el: ReturnType<typeof $>): string {
    return el.text()
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  }

  // Prefer JSON-LD description if available (cleanest source)
  let description = ''
  if (jsonLd?.description && typeof jsonLd.description === 'string') {
    const ldDesc = cheerio.load(jsonLd.description).text()
      .replace(/\s+/g, ' ').trim()
    if (ldDesc.length > 200) description = ldDesc
  }

  // Fall back to DOM selectors
  if (!description) {
    for (const sel of DESCRIPTION_SELECTORS) {
      const el = $(sel).first()
      if (el.length) {
        description = readableText(el)
        if (description.length > 200) break
      }
    }
  }

  // Final fallback: full body text
  if (description.length < 200) {
    description = readableText($('body'))
  }

  if (description.length < 50) throw new Error('parse_failed')

  description = description.slice(0, 8000)

  // Extract title
  let title: string | undefined
  for (const sel of TITLE_SELECTORS) {
    const text = $(sel).first().text().trim()
    if (text) { title = text.slice(0, 200); break }
  }
  if (!title && jsonLd?.title) title = String(jsonLd.title).slice(0, 200)

  // Extract company
  let company: string | undefined
  for (const sel of COMPANY_SELECTORS) {
    const text = $(sel).first().text().trim()
    if (text) { company = text.slice(0, 200); break }
  }
  if (!company) {
    const og = $('meta[property="og:site_name"]').attr('content')?.trim()
    if (og) company = og.slice(0, 200)
  }
  if (!company) {
    const twitterTitle = $('meta[property="twitter:title"]').attr('content')?.trim()
    if (twitterTitle) {
      const match = twitterTitle.match(/ by (.+)$/)
      if (match) company = match[1].trim().slice(0, 200)
    }
  }
  if (!company && jsonLd?.hiringOrganization) {
    const org = jsonLd.hiringOrganization
    company = (typeof org === 'object' ? (org as Record<string, unknown>).name : org) as string
    company = String(company).slice(0, 200)
  }

  // Extract datePosted from JSON-LD
  let postedAt: Date | undefined
  if (jsonLd?.datePosted && typeof jsonLd.datePosted === 'string') {
    const d = new Date(jsonLd.datePosted)
    if (!isNaN(d.getTime())) postedAt = d
  }

  return { description, title, company, postedAt }
}
