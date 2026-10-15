import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { providers } from './providers.js'
import { pageImages } from './preview-images.js'

function providerUrl(provider, value) {
  const url = new URL(value)
  const base = new URL(provider.baseUrl).hostname.replace(/^www\./, '')
  const host = url.hostname.replace(/^www\./, '')
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !(host === base || host.endsWith('.' + base))) throw new Error('URL is outside provider host')
  url.hash = ''
  return url.href
}

async function fetchPreviewPage(url, provider) {
  const signal = AbortSignal.timeout(8000)
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetch(url, { redirect: 'manual', signal, headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)' } })
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      const next = new URL(response.headers.get('location'), url).href
      await response.body?.cancel()
      url = providerUrl(provider, next)
      continue
    }
    if (!response.ok || response.status === 202) { await response.body?.cancel(); throw new Error(`Preview HTTP ${response.status}`) }
    const type = response.headers.get('content-type') || ''
    if (!/text\/html|application\/xhtml\+xml/i.test(type)) { await response.body?.cancel(); return { html: '', url } }
    const reader = response.body?.getReader(), decoder = new TextDecoder()
    let html = '', bytes = 0
    if (!reader) return { html, url }
    try {
      while (bytes < 2_000_000) {
        const { done, value } = await reader.read()
        if (done) break
        const chunk = value.subarray(0, 2_000_000 - bytes)
        bytes += chunk.byteLength; html += decoder.decode(chunk, { stream: true })
      }
      html += decoder.decode()
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
    return { html, url }
  }
  throw new Error('Too many preview redirects')
}

export function createPreviewResolver({ providerList = providers, fetchPage = fetchPreviewPage, concurrency = 4, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map(), limit = pLimit(concurrency)
  return async function resolvePreview(sourceId, value) {
    const provider = providerList.find(item => item.id === sourceId)
    if (!provider) throw new Error('Unknown provider')
    const url = providerUrl(provider, value), key = sourceId + ':' + url
    const hit = cache.get(key)
    if (hit && hit.expires > now()) return hit.payload
    if (pending.has(key)) return pending.get(key)
    const task = limit(async () => {
      let images = [], error
      try {
        // Archive landing pages do not contain a render of the archived model.
        if (!(sourceId === 'mediafire-rr3' && /\.(?:7z|zip|rar)(?:\/|$)/i.test(new URL(url).pathname))) {
          const page = await fetchPage(url, provider)
          images = pageImages(cheerio.load(page.html), page.url || url)
        }
      } catch (failure) { error = failure.message }
      const payload = { sourceId, sourceUrl: url, imageUrl: images[0] || null, images, ...(error ? { error } : {}) }
      cache.set(key, { expires: now() + (error ? 30000 : images.length ? 900000 : 120000), payload })
      if (cache.size > 600) cache.delete(cache.keys().next().value)
      return payload
    })
    pending.set(key, task)
    try { return await task } finally { pending.delete(key) }
  }
}

export function registerPreviewRoute(app, resolve = createPreviewResolver()) {
  app.get('/api/preview', async (req, res) => {
    const sourceId = String(req.query.sourceId || '').slice(0, 80), url = String(req.query.url || '').slice(0, 2000)
    if (!sourceId || !url) return res.status(400).json({ error: 'sourceId and url are required.' })
    try {
      const payload = await resolve(sourceId, url)
      if (!res.destroyed) res.status(payload.error ? 502 : 200).json(payload)
    } catch (error) { if (!res.destroyed) res.status(400).json({ error: error.message }) }
  })
}
