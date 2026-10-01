import type { Context } from '@netlify/functions'
import { getReviewStore } from './lib/store.js'

export default async (req: Request, context: Context) => {
  const url = new URL(req.url)
  const id = url.searchParams.get('id')

  if (!id) {
    return Response.json(
      { error: 'Missing id query parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    )
  }

  try {
    const store = getReviewStore()
    const job = ((await store.get(id, { type: 'json' })) || null) as any

    if (!job) {
      return Response.json(
        { status: 'pending' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (job.status === 'done') {
      return Response.json(
        { status: 'done', text: job.text },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    if (job.status === 'error') {
      return Response.json(
        { status: 'error', code: job.code || 'network', message: job.message },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    // Still processing - check for timeout (> 5 minutes)
    if (job.startedAt && Date.now() - job.startedAt > 5 * 60 * 1000) {
      return Response.json(
        { status: 'error', code: 'timeout', message: 'The review timed out.' },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return Response.json(
      { status: 'pending' },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (err: any) {
    console.error(`Error reading review status for ${id}:`, err)
    return Response.json(
      { status: 'error', code: 'network', message: err.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
