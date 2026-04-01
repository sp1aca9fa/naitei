import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { GoogleGenerativeAI } from '@google/generative-ai'

export interface AIProvider {
  name: string
  complete(systemPrompt: string, userPrompt: string): Promise<string>
}

class ClaudeProvider implements AIProvider {
  name = 'claude'
  private client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const msg = await this.client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    const block = msg.content[0]
    if (block.type !== 'text') throw new Error('Unexpected Claude response type')
    return block.text
  }
}

class OpenAIProvider implements AIProvider {
  name = 'openai'
  private client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await this.client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    })
    return res.choices[0].message.content ?? ''
  }
}

class GeminiProvider implements AIProvider {
  name = 'gemini'
  private client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '')

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const model = this.client.getGenerativeModel({ model: 'gemini-2.5-flash' })
    try {
      const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`)
      const candidate = result.response.candidates?.[0]
      if (!candidate) throw new Error(`Gemini returned no candidates. Prompt feedback: ${JSON.stringify(result.response.promptFeedback)}`)
      const text = candidate.content.parts.map(p => p.text ?? '').join('')
      if (!text) throw new Error(`Gemini response empty. Finish reason: ${candidate.finishReason}, safety: ${JSON.stringify(candidate.safetyRatings)}`)
      return text
    } catch (err) {
      console.error('[GeminiProvider] error:', err)
      if (err && typeof err === 'object') {
        const e = err as Record<string, unknown>
        console.error('[GeminiProvider] error details:', JSON.stringify({
          message: e['message'],
          status: e['status'],
          statusText: e['statusText'],
          errorDetails: e['errorDetails'],
          body: e['body'],
        }, null, 2))
      }
      throw err
    }
  }
}

class OllamaProvider implements AIProvider {
  name = 'ollama'
  private baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434'

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL ?? 'llama3',
        stream: false,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
      }),
    })
    const data = await res.json() as { message: { content: string } }
    return data.message.content
  }
}

export const MOCK_COMPANY_RESEARCH: Record<string, object> = {
  'Mercari': {
    company_name: 'Mercari',
    overview: 'Mercari is Japan\'s largest C2C marketplace app, founded in 2013 and publicly listed on the Tokyo Stock Exchange. It operates in Japan and the US with thousands of employees.',
    known_for: 'Known for being one of Japan\'s first unicorn startups and for building a highly scalable microservices platform.',
    tech_stack: ['Go', 'TypeScript', 'React', 'Kubernetes', 'GCP', 'Spanner', 'gRPC', 'microservices'],
    culture_signals: ['English-friendly (official company language is English)', 'Strong engineering culture', 'Flexible remote work', 'Fast-paced startup mindset despite scale', 'Open source contributors'],
    green_flags: ['Large engineering org with mentorship opportunities', 'English as official language lowers language barrier', 'Strong technical reputation helps your resume', 'Internal mobility between teams'],
    red_flags: ['High performance bar -- competitive hiring', 'Microservices complexity may overwhelm juniors', 'Large company can mean slower onboarding'],
    interview_tips: ['Brush up on system design basics even for junior roles', 'Be ready to discuss your approach to code quality and testing', 'English interviews are standard -- practice technical English', 'They value culture-add, so prepare "why Mercari" clearly'],
    typical_roles: ['Frontend Engineer', 'Backend Engineer (Go)', 'iOS/Android Engineer', 'SRE', 'Data Engineer'],
  },
  'SmartNews': {
    company_name: 'SmartNews',
    overview: 'SmartNews is a Tokyo-based news aggregation app with over 50 million downloads globally. It uses ML to surface relevant news to users in Japan and the US.',
    known_for: 'Known for its ML-driven content ranking and being one of Japan\'s few truly bilingual tech companies.',
    tech_stack: ['Python', 'Java', 'Kotlin', 'Swift', 'AWS', 'Spark', 'Kafka', 'machine learning pipelines'],
    culture_signals: ['Bilingual environment (Japanese and English)', 'Data-driven decision making', 'Research-oriented engineering teams', 'Relatively flat hierarchy'],
    green_flags: ['Exposure to ML/data engineering early in career', 'Strong international team composition', 'Clear product mission'],
    red_flags: ['ML-heavy stack may not suit pure frontend devs', 'Smaller engineering team means less specialization', 'US/Japan timezone coordination can be demanding'],
    interview_tips: ['Show interest in data and personalization problems', 'Be ready for both technical and product-sense questions', 'Prepare examples of working with or processing data'],
    typical_roles: ['Backend Engineer', 'ML Engineer', 'iOS/Android Engineer', 'Data Scientist'],
  },
}

const MOCK_RESUMES: Record<string, object> = {
  'Maria Santos': {
    name: 'Maria Santos',
    skills: ['HTML', 'CSS', 'JavaScript', 'TypeScript', 'React', 'Tailwind CSS', 'Git', 'Figma', 'Jest', 'Node.js', 'SQL', 'Accessibility'],
    experience_years: 10,
    experience_by_domain: [
      { domain: 'Education / Teaching', years: 8 },
      { domain: 'Web Development', years: 2 },
    ],
    experience_summary: '8 years as a mathematics teacher followed by 2 years in web development (freelance and startup).',
    education: 'B.Ed. in Mathematics Education, University of the Philippines, 2014; Web Development Bootcamp, Le Wagon Tokyo, 2023',
    notable_projects: ['EduTech interactive learning modules', 'Freelance portfolio and landing page sites', 'School-wide grade tracking tool'],
    languages_spoken: ['English', 'Japanese', 'Filipino'],
  },
  'Kenji Watanabe': {
    name: 'Kenji Watanabe',
    skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'HTML', 'CSS', 'Git', 'PostgreSQL', 'Express', 'REST APIs'],
    experience_years: 6,
    experience_by_domain: [
      { domain: 'Web Development', years: 2 },
      { domain: 'Digital Marketing', years: 4 },
    ],
    experience_summary: '2 years of web development (frontend and Node.js backend) after a 4-year career in digital marketing.',
    education: 'BA in Business Administration, Waseda University, 2018',
    notable_projects: ['E-commerce redesign', 'Internal CRM dashboard'],
    languages_spoken: ['Japanese', 'English'],
  },
}

class MockProvider implements AIProvider {
  name = 'mock'

  async complete(_systemPrompt: string, userPrompt: string): Promise<string> {
    // Company research mock
    if (userPrompt.includes('Research the company')) {
      const match = Object.keys(MOCK_COMPANY_RESEARCH).find(name => userPrompt.includes(name))
      const data = match ? MOCK_COMPANY_RESEARCH[match] : {
        ...MOCK_COMPANY_RESEARCH['Mercari'],
        company_name: 'Unknown Company',
        overview: 'Limited information available for this company. The details below are generic placeholders.',
      }
      console.log(`[MockProvider] returning mock company research for: ${(data as { company_name: string }).company_name}`)
      return JSON.stringify(data)
    }
    // Resume parse mock
    const match = Object.keys(MOCK_RESUMES).find(name => userPrompt.includes(name))
    const data = match ? MOCK_RESUMES[match] : MOCK_RESUMES['Kenji Watanabe']
    console.log(`[MockProvider] returning mock JSON for: ${(data as { name: string }).name}`)
    return JSON.stringify(data)
  }
}

export function getAIProvider(): AIProvider {
  switch (process.env.AI_PROVIDER) {
    case 'openai': return new OpenAIProvider()
    case 'gemini': return new GeminiProvider()
    case 'ollama': return new OllamaProvider()
    case 'mock':   return new MockProvider()
    default:       return new ClaudeProvider()
  }
}

export function getAIProviders(): AIProvider[] {
  const providers = process.env.AI_PROVIDERS?.split(',') ?? [process.env.AI_PROVIDER ?? 'claude']
  return providers.map(p => {
    switch (p.trim()) {
      case 'openai': return new OpenAIProvider()
      case 'gemini': return new GeminiProvider()
      case 'ollama': return new OllamaProvider()
      default:       return new ClaudeProvider()
    }
  })
}

function defaultAggregator(results: string[]): string {
  // Phase 7 will implement proper consensus logic — for now just return first
  return results[0]
}

export async function runWithConsensus(
  systemPrompt: string,
  userPrompt: string,
  aggregator: (results: string[]) => string = defaultAggregator
): Promise<{ result: string; confidence: 'high' | 'low'; disagreement: boolean }> {
  const providers = getAIProviders()
  if (providers.length === 1) {
    return { result: await providers[0].complete(systemPrompt, userPrompt), confidence: 'high', disagreement: false }
  }
  const results = await Promise.all(providers.map(p => p.complete(systemPrompt, userPrompt)))
  return { result: aggregator(results), confidence: 'high', disagreement: false }
}
