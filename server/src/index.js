import express from 'express'
import cors from 'cors'
import { providers } from './providers.js'
import { searchAll } from './search.js'
import { getResultDetails } from './details.js'
import { searchBrasilSimulatorMods } from './brasil-adapter.js'
import { search3DSky } from './3dsky-adapter.js'
import { searchVosan } from './vosan-adapter.js'

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

function providerFor(result) { return providers.find(provider => provider.id === result?.sourceId) || null }
function isConfirmedFree(result) {
  if (!result) return false
  if (result.isFree === true || result.price === 0) return true
  if (result.isFree === false || (typeof result.price === 'number' && result.price > 0)) return false
  if (result.downloadUrl) return true
  if (result.sourceId === 'sketchfab' && result.downloadable === true) return true
  const provider = providerFor(result)
  if (provider?.freeCatalog === true) return true
  return false
}
function freeOnlyPayload(payload) {
  const results = (payload.results || []).filter(isConfirmedFree).map(result => ({ ...result, isFree: true, price: 0 }))
  const counts = new Map(); for (const result of results) counts.set(result.sourceId, (counts.get(result.sourceId) || 0) + 1)
  const sources = (payload.sources || []).map(source => ({ ...source, count: counts.get(source.provider) || 0 }))
  return { ...payload, results, sources, total: results.length, freeOnly: true }
}
function trimCache(target, max = 120, remove = 20) {
  if (target.size <= max) return
  const oldest = [...target.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, remove)
  for (const [key] of oldest) target.delete(key)
}
async function cachedDetails(sourceId, sourceUrl) {
  const cacheKey = `${sourceId}|${sourceUrl}`
  const cached = detailsCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < DETAILS_CACHE_TTL_MS) return cached.payload
  const payload = await getResultDetails(sourceId, sourceUrl)
  detailsCache.set(cacheKey, { createdAt: Date.now(), payload }); trimCache(detailsCache, 250, 40); return payload
}

app.get('/health', (_req, res) => res.json({ ok: true, service: 'vj-3d-search-api', providers: providers.length, freeOnly: true, detailsResolver: true, directDownloadGate: true, paginatedSearch: true, gameFacets: true, nativeAdapters: ['vertex-warehouse','brasil-simulator-mods','3dsky','vosan'] }))
app.get('/api/providers', (_req, res) => res.json(providers.map(provider => ({ id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl, browseUrl: provider.browseUrl || provider.baseUrl, freeCatalog: Boolean(provider.freeCatalog), defaultGame: provider.defaultGame || null, pagination: Boolean(provider.pagination) }))))
app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120)
  if (q.length < 2) return res.status(400).json({ error: 'Query must have at least 2 characters.' })
  const perSource = Math.max(1, Math.min(Number(req.query.perSource || 60), 80))
  const cacheKey = `free-v4|${q.toLowerCase()}|${perSource}`
  const cached = cache.get(cacheKey); if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return res.json({ ...cached.payload, cached: true })
  try {
    const [rawPayload, brasil, sky, vosan] = await Promise.all([
      searchAll(q, { perSource }),
      searchBrasilSimulatorMods(q, perSource).catch(error => ({ results: [], pagesFetched: 0, error: error instanceof Error ? error.message : 'BSM search failed' })),
      search3DSky(q, perSource).catch(error => ({ results: [], pagesFetched: 0, error: error instanceof Error ? error.message : '3DSky search failed' })),
      searchVosan(q, perSource).catch(error => ({ results: [], pagesFetched: 0, error: error instanceof Error ? error.message : 'VOSAN search failed' })),
    ])
    rawPayload.results = [
      ...rawPayload.results.filter(result => !['brasil-simulator-mods','3dsky','vosan'].includes(result.sourceId)),
      ...brasil.results,
      ...sky.results,
      ...vosan.results,
    ]
    rawPayload.sources = rawPayload.sources.map(source => {
      if (source.provider === 'brasil-simulator-mods') return { ...source, status: brasil.error ? 'error' : 'ok', count: brasil.results.length, pagesFetched: brasil.pagesFetched, error: brasil.error }
      if (source.provider === '3dsky') return { ...source, status: sky.error ? 'error' : 'ok', count: sky.results.length, pagesFetched: sky.pagesFetched, error: sky.error }
      if (source.provider === 'vosan') return { ...source, status: vosan.error ? 'error' : 'ok', count: vosan.results.length, pagesFetched: vosan.pagesFetched, error: vosan.error }
      return source
    })
    rawPayload.total = rawPayload.results.length
    console.log(`[search] ${q} :: ${rawPayload.sources.map(source => `${source.provider}=${source.status}:${source.count}@${source.pagesFetched || 0}p`).join(' | ')}`)
    const payload = freeOnlyPayload(rawPayload); cache.set(cacheKey, { createdAt: Date.now(), payload }); trimCache(cache); res.json({ ...payload, cached: false })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Global search failed.' }) }
})
app.get('/api/details', async (req, res) => {
  const sourceId = String(req.query.sourceId || '').trim().slice(0, 80), sourceUrl = String(req.query.url || '').trim().slice(0, 2000)
  if (!sourceId || !sourceUrl) return res.status(400).json({ error: 'sourceId and url are required.' })
  try { const payload = await cachedDetails(sourceId, sourceUrl); res.json({ ...payload, cached: detailsCache.has(`${sourceId}|${sourceUrl}`) }) }
  catch (error) { const message = error instanceof Error ? error.message : 'Details lookup failed.'; const status = /outside provider host|Unknown provider|required/i.test(message) ? 400 : 502; res.status(status).json({ error: message }) }
})
app.get('/api/download', async (req, res) => {
  const sourceId = String(req.query.sourceId || '').trim().slice(0, 80), sourceUrl = String(req.query.url || '').trim().slice(0, 2000)
  if (!sourceId || !sourceUrl) return res.status(400).send('Invalid download request.')
  try {
    const details = await cachedDetails(sourceId, sourceUrl)
    if (!details.downloadUrl) return res.status(404).send('No confirmed direct download is available for this asset.')
    const target = new URL(details.downloadUrl); if (!['http:', 'https:'].includes(target.protocol)) return res.status(400).send('Invalid direct download URL.')
    res.set('Cache-Control', 'no-store'); return res.redirect(302, target.href)
  } catch (error) { return res.status(502).send(error instanceof Error ? error.message : 'Download resolution failed.') }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`VJ 3D Search API listening on 0.0.0.0:${port}`)
})
