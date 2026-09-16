import { progressiveSearch } from './progressive-search.js'

function writeEvent(res, payload) {
  if (res.writableEnded || res.destroyed) return
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

export function registerProgressiveSearchRoute(app) {
  app.get('/api/search/stream', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 120)
    if (q.length < 2) return res.status(400).json({ error: 'Query must have at least 2 characters.' })
    const perSource = Math.max(1, Math.min(Number(req.query.perSource || 60), 80))

    res.status(200)
    res.set('Content-Type', 'text/event-stream; charset=utf-8')
    res.set('Cache-Control', 'no-cache, no-transform')
    res.set('Connection', 'keep-alive')
    res.set('X-Accel-Buffering', 'no')
    res.flushHeaders?.()
    res.write(': VJ progressive search\n\n')

    let completed = 0
    let totalResults = 0
    let closed = false
    req.on('close', () => { closed = true })

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
    }, 12000)

    try {
      const summary = await progressiveSearch(q, {
        perSource,
        emit: event => {
          if (closed) return
          if (event?.type === 'source') {
            completed += 1
            totalResults += Array.isArray(event.results) ? event.results.length : 0
          }
          writeEvent(res, { ...event, completed, totalResults })
        },
      })
      if (!closed) writeEvent(res, { type: 'done', ...summary, completed, totalResults })
    } catch (error) {
      if (!closed) writeEvent(res, { type: 'error', error: error instanceof Error ? error.message : 'Progressive search failed.' })
    } finally {
      clearInterval(heartbeat)
      if (!closed && !res.writableEnded) res.end()
    }
  })
}
