import type { Config, Context } from '@netlify/functions'
import { getReviewStore } from './lib/store.js'
import { queryAI } from './lib/ai.js'

export const config: Config = {
  background: true,
}

export default async (req: Request, context: Context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { id, messages } = body || {}
  if (!id || typeof id !== 'string') {
    return new Response(JSON.stringify({ error: 'Job id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return new Response(JSON.stringify({ error: 'Messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const totalLength = messages.reduce((acc, m) => acc + (m?.content?.length || 0), 0)
  if (totalLength > 150000) {
    return new Response(JSON.stringify({ error: 'Prompt too large' }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const store = getReviewStore()

  // Mark status as processing in blobs
  await store.setJSON(id, {
    status: 'processing',
    startedAt: Date.now(),
  })

  const runTask = async () => {
    try {
      const text = await queryAI(messages)
      if (!text || text.trim().length === 0) {
        await store.setJSON(id, {
          status: 'error',
          code: 'empty_completion',
          message: 'Empty response returned from model',
          failedAt: Date.now(),
        })
        return
      }

      await store.setJSON(id, {
        status: 'done',
        text,
        completedAt: Date.now(),
      })
    } catch (err: any) {
      console.error(`Error processing job ${id}:`, err)
      let code = err.code || 'network'
      if (err.status === 429 || /rate/i.test(err.message)) code = 'rate_limited'
      else if (err.status === 413 || /too large/i.test(err.message)) code = 'prompt_too_large'
      else if (err.status === 401 || err.status === 403) code = 'server_misconfigured'

      await store.setJSON(id, {
        status: 'error',
        code,
        message: err.message || 'Error occurred during review',
        failedAt: Date.now(),
      })
    }
  }

  if (context.waitUntil) {
    context.waitUntil(runTask())
  } else {
    await runTask()
  }

  return new Response(JSON.stringify({ status: 'accepted', id }), {
    status: 202,
    headers: { 'Content-Type': 'application/json' },
  })
}
