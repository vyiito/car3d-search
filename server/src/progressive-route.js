import { progressiveSearch } from './progressive-search.js'
import { providers } from './providers.js'
import { searchOptions } from './search-options.js'

function writeEvent(res, payload) {
  if (res.writableEnded || res.destroyed) return
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

export function registerProgressiveSearchRoute(app, search = progressiveSearch) {
  app.get('/api/search/stream', async (req, res) => {
    const options = searchOptions(req.query), { q, perSource } = options
    if (q.length < 2) return res.status(400).json({ error: 'Query must have at least 2 characters.' })
    if (options.sourceIds.some(id => !providers.some(provider => provider.id === id))) return res.status(400).json({ error: 'Unknown provider' })

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
    const controller = new AbortController()
    res.on('close', () => { closed = true; controller.abort() })
    writeEvent(res, { type: 'start', query: q, providerCount: options.sourceIds.length || providers.length })

    const heartbeat = setInterval(() => {
      if (!closed && !res.writableEnded) res.write(': keep-alive\n\n')
    }, 12000)

    try {
      const summary = await search(q, {
        ...options,
        perSource,
        signal: controller.signal,
        refresh: req.query.refresh === '1',
        emit: event => {
          if (closed) return
          if (event?.type === 'source') {
            completed += 1
            totalResults += Array.isArray(event.results) ? event.results.length : 0
          }
          writeEvent(res, { ...event, completed, totalResults })
        },
      })
      if (!closed) {
        const { results: _results, sources: _sources, ...metadata } = summary
        writeEvent(res, { type: 'done', ...metadata, completed, totalResults: summary.total ?? totalResults })
      }
    } catch (error) {
      if (!closed) writeEvent(res, { type: 'error', error: error instanceof Error ? error.message : 'Progressive search failed.' })
    } finally {
      clearInterval(heartbeat)
      if (!closed && !res.writableEnded) res.end()
    }
  })
}
