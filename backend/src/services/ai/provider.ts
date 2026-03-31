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
    const result = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`)
    const candidate = result.response.candidates?.[0]
    if (!candidate) throw new Error(`Gemini returned no candidates. Prompt feedback: ${JSON.stringify(result.response.promptFeedback)}`)
    const text = candidate.content.parts.map(p => p.text ?? '').join('')
    if (!text) throw new Error(`Gemini response empty. Finish reason: ${candidate.finishReason}`)
    return text
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

export function getAIProvider(): AIProvider {
  switch (process.env.AI_PROVIDER) {
    case 'openai': return new OpenAIProvider()
    case 'gemini': return new GeminiProvider()
    case 'ollama': return new OllamaProvider()
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
