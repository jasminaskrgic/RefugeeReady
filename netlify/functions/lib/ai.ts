export interface AIMessage {
  role: string
  content: string
}

export async function queryAI(messages: AIMessage[]): Promise<string> {
  const gatewayKey =
    (typeof Netlify !== 'undefined' && Netlify.env
      ? Netlify.env.get('NETLIFY_AI_GATEWAY_KEY') || Netlify.env.get('ANTHROPIC_API_KEY')
      : undefined) ||
    process.env.NETLIFY_AI_GATEWAY_KEY ||
    process.env.ANTHROPIC_API_KEY

  const gatewayBase =
    (typeof Netlify !== 'undefined' && Netlify.env ? Netlify.env.get('NETLIFY_AI_GATEWAY_BASE_URL') : undefined) ||
    process.env.NETLIFY_AI_GATEWAY_BASE_URL ||
    'https://25bb0505-55a3-4845-8b5d-d1944b8e2a80.netlify.app/.netlify/ai'

  const normalizedBase = gatewayBase.replace(/\/$/, '')

  const sanitizedMessages = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content || '',
  }))

  // 1. Primary: Anthropic Claude Sonnet 4.5 via v1/messages
  try {
    const res = await fetch(`${normalizedBase}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${gatewayKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        messages: sanitizedMessages,
      }),
    })

    if (res.ok) {
      const data = (await res.json()) as any
      const text = data.content?.[0]?.text
      if (text && text.trim().length > 0) {
        return text
      }
    } else {
      const errBody = await res.text()
      console.warn(`Claude Sonnet API returned ${res.status}:`, errBody.slice(0, 200))
      if (res.status === 429) {
        const err: any = new Error('Rate limit exceeded')
        err.code = 'rate_limited'
        throw err
      }
      if (res.status === 413) {
        const err: any = new Error('Prompt too large')
        err.code = 'prompt_too_large'
        throw err
      }
    }
  } catch (err: any) {
    if (err.code === 'rate_limited' || err.code === 'prompt_too_large') {
      throw err
    }
    console.warn('Claude Sonnet attempt failed, falling back to OpenAI...', err.message)
  }

  // 2. Fallbacks via OpenAI compatible v1/chat/completions (gpt-4o, gpt-4o-mini)
  const fallbackModels = ['gpt-4o', 'gpt-4o-mini']
  for (const model of fallbackModels) {
    try {
      const res = await fetch(`${normalizedBase}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${gatewayKey}`,
        },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          messages: sanitizedMessages,
        }),
      })

      if (res.ok) {
        const data = (await res.json()) as any
        const text = data.choices?.[0]?.message?.content
        if (text && text.trim().length > 0) {
          return text
        }
      } else {
        const errBody = await res.text()
        console.warn(`${model} API returned ${res.status}:`, errBody.slice(0, 200))
        if (res.status === 429) {
          const err: any = new Error('Rate limit exceeded')
          err.code = 'rate_limited'
          throw err
        }
      }
    } catch (err: any) {
      if (err.code === 'rate_limited') throw err
      console.warn(`${model} fallback failed:`, err.message)
    }
  }

  const finalError: any = new Error('All AI models failed to return a response')
  finalError.code = 'network'
  throw finalError
}
