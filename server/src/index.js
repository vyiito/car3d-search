import express from 'express'
import cors from 'cors'
import { providers } from './providers.js'
import { searchAll } from './search.js'
import { getResultDetails } from './details.js'
import { probeVertexSearch } from './vertex-probe.js'

const app = express()
const port = Number(process.env.PORT || 10000)
const allowedOrigin = process.env.CORS_ORIGIN || 'https://vyiito.github.io'
const cache = new Map()
const detailsCache = new Map()
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)
const DETAILS_CACHE_TTL_MS = Number(process.env.DETAILS_CACHE_TTL_MS || 30 * 60 * 1000)

app.disable('x-powered-by')
app.use(cors({ origin: [allowedOrigin, 'http://localhost:5173'], methods: ['GET'] }))
app.use(express.json({ limit: '32kb' }))

function isConfirmedFree(result) {
  if (!result) return false
  if (result.isFree === true || result.price === 0) return true
  if (result.isFree === false || (typeof result.price === 'number' && result.price > 0)) return false
  if (result.downloadUrl) return true
  if (result.sourceId === 'sketchfab' && result.downloadable === true) return true
  return false
}

function freeOnlyPayload(payload) {
  const results = (payload.results || [])
    .filter(isConfirmedFree)
    .map(result => ({ ...result, isFree: true, price: 0 }))

  const counts = new Map()
  for (const result of results) counts.set(result.sourceId, (counts.get(result.sourceId) || 0) + 1)

  const sources = (payload.sources || []).map(source => ({
    ...source,
    count: counts.get(source.provider) || 0,
  }))

  return {
    ...payload,
    results,
    sources,
    total: results.length,
    freeOnly: true,
  }
}

function trimCache(target, max = 120, remove = 20) {
  if (target.size <= max) return
  const oldest = [...target.entries()]
    .sort((a, b) => a[1].createdAt - b[1].createdAt)
    .slice(0, remove)
  for (const [key] of oldest) target.delete(key)
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vj-3d-search-api', providers: providers.length, freeOnly: true, detailsResolver: true })
})

app.get('/api/providers', (_req, res) => {
  res.json(providers.map(provider => ({
    id: provider.id,
    name: provider.name,
    type: provider.type,
    baseUrl: provider.baseUrl,
  })))
})

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120)
  if (q.length < 2) return res.status(400).json({ error: 'Query must have at least 2 characters.' })

  const perSource = Math.max(1, Math.min(Number(req.query.perSource || 20), 50))
  const cacheKey = `free|${q.toLowerCase()}|${perSource}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return res.json({ ...cached.payload, cached: true })
  }

  try {
    const rawPayload = await searchAll(q, { perSource })
    console.log(`[search] ${q} :: ${rawPayload.sources.map(source => `${source.provider}=${source.status}:${source.count}`).join(' | ')}`)
    const payload = freeOnlyPayload(rawPayload)
    cache.set(cacheKey, { createdAt: Date.now(), payload })
    trimCache(cache)
    res.json({ ...payload, cached: false })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Global search failed.' })
  }
})

app.get('/api/details', async (req, res) => {
  const sourceId = String(req.query.sourceId || '').trim().slice(0, 80)
  const sourceUrl = String(req.query.url || '').trim().slice(0, 2000)
  if (!sourceId || !sourceUrl) return res.status(400).json({ error: 'sourceId and url are required.' })

  const cacheKey = `${sourceId}|${sourceUrl}`
  const cached = detailsCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < DETAILS_CACHE_TTL_MS) {
    return res.json({ ...cached.payload, cached: true })
  }

  try {
    const payload = await getResultDetails(sourceId, sourceUrl)
    detailsCache.set(cacheKey, { createdAt: Date.now(), payload })
    trimCache(detailsCache, 250, 40)
    res.json({ ...payload, cached: false })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Details lookup failed.'
    const status = /outside provider host|Unknown provider|required/i.test(message) ? 400 : 502
    res.status(status).json({ error: message })
  }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`VJ 3D Search API listening on 0.0.0.0:${port}`)
  setTimeout(() => probeVertexSearch().catch(() => {}), 1500)
})
