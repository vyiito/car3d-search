import express from 'express'
import cors from 'cors'
import { providers } from './providers.js'
import { searchAll } from './search.js'
import { getResultDetails } from './details.js'
import { searchBrasilSimulatorMods } from './brasil-adapter.js'
import { search3DSky } from './3dsky-adapter.js'
import { searchVosan } from './vosan-adapter.js'
import { searchOvertake } from './overtake-adapter.js'
import { searchVertexNative } from './vertex-adapter.js'
import { searchNativeMarketSources, nativeMarketAdapters } from './market-adapters.js'
import { search3DBaza, searchWireWheels } from './catalog-adapters.js'
import { searchCGMoodV2, searchZifir, search3ddd } from './remaining-adapters.js'
import { searchRenderHubClean, search3dCarClean } from './commerce-adapters.js'
import { searchCGTraderMarketV2 } from './cgtrader-adapter.js'
import { searchReferencePack, buildReferenceZip } from './reference-engine.js'
import { registerProgressiveSearchRoute } from './progressive-route.js'

const app = express()
const port = Number(process.env.PORT || 10000)
const allowedOrigin = process.env.CORS_ORIGIN || 'https://vyiito.github.io'
const cache = new Map()
const detailsCache = new Map()
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)
const DETAILS_CACHE_TTL_MS = Number(process.env.DETAILS_CACHE_TTL_MS || 30 * 60 * 1000)
const MARKET_NATIVE_IDS = Object.keys(nativeMarketAdapters)
const EXTRA_NATIVE_IDS = ['3d-baza','wire-wheels-club','zifir3d','renderhub','3ddd-ru','3dcar-ru','cgtrader']
const ALL_NATIVE_IDS = [...new Set(['vertex-warehouse','brasil-simulator-mods','3dsky','vosan','overtake',...MARKET_NATIVE_IDS,...EXTRA_NATIVE_IDS])]

app.disable('x-powered-by')
app.use(cors({ origin: [allowedOrigin, 'http://localhost:5173'], methods: ['GET'] }))
app.use(express.json({ limit: '32kb' }))
registerProgressiveSearchRoute(app)

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
function normalizeMarketResult(result) {
  if (!result) return result
  const price = typeof result.price === 'number' && Number.isFinite(result.price) ? result.price : null
  let isFree = result.isFree
  if (price === 0) isFree = true
  else if (price !== null && price > 0) isFree = false
  return { ...result, price, isFree }
}
function safeAdapter(fn, label) { return fn().catch(error => ({ results: [], pagesFetched: 0, error: error instanceof Error ? error.message : `${label} search failed` })) }

app.get('/health', (_req, res) => res.json({ ok: true, service: 'vj-3d-search-api', providers: providers.length, marketMode: 'free+paid', detailsResolver: true, directDownloadGate: true, paginatedSearch: true, gameFacets: true, referencePacks: true, progressiveSearch: true, nativeAdapters: ALL_NATIVE_IDS }))
app.get('/api/providers', (_req, res) => res.json(providers.map(provider => ({ id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl, browseUrl: provider.browseUrl || provider.baseUrl, freeCatalog: Boolean(provider.freeCatalog), defaultGame: provider.defaultGame || null, pagination: Boolean(provider.pagination), nativeAdapter: ALL_NATIVE_IDS.includes(provider.id) }))))

app.get('/api/search', async (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 120)
  if (q.length < 2) return res.status(400).json({ error: 'Query must have at least 2 characters.' })
  const perSource = Math.max(1, Math.min(Number(req.query.perSource || 60), 80))
  const cacheKey = `market-v12|${q.toLowerCase()}|${perSource}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) return res.json({ ...cached.payload, cached: true })
  try {
    const [rawPayload, brasil, sky, vosan, overtake, vertex, nativeMarketsRaw, baza, wire, cgmood, zifir, renderhub, ddd, carGallery, cgtrader] = await Promise.all([
      searchAll(q, { perSource }),
      safeAdapter(() => searchBrasilSimulatorMods(q, perSource), 'BSM'), safeAdapter(() => search3DSky(q, perSource), '3DSky'), safeAdapter(() => searchVosan(q, perSource), 'VOSAN'), safeAdapter(() => searchOvertake(q, perSource), 'OverTake'), safeAdapter(() => searchVertexNative(q, perSource), 'Vertex'),
      searchNativeMarketSources(q, perSource), safeAdapter(() => search3DBaza(q, perSource), '3D-Baza'), safeAdapter(() => searchWireWheels(q, perSource), 'Wire Wheels'), safeAdapter(() => searchCGMoodV2(q, perSource), 'CGMood'), safeAdapter(() => searchZifir(q, perSource), 'ZIFIR'), safeAdapter(() => searchRenderHubClean(q, perSource), 'RenderHub'), safeAdapter(() => search3ddd(q, perSource), '3ddd'), safeAdapter(() => search3dCarClean(q, perSource), '3DCar'), safeAdapter(() => searchCGTraderMarketV2(q, perSource), 'CGTrader'),
    ])
    const nativeMarkets = nativeMarketsRaw.filter(item => !['cgmood'].includes(item.sourceId))
    const nativeMap = new Map(nativeMarkets.map(item => [item.sourceId, item]))
    const explicit = new Map([
      ['brasil-simulator-mods', brasil], ['3dsky', sky], ['vosan', vosan], ['overtake', overtake], ['vertex-warehouse', vertex], ['3d-baza', baza], ['wire-wheels-club', wire], ['cgmood', cgmood], ['zifir3d', zifir], ['renderhub', renderhub], ['3ddd-ru', ddd], ['3dcar-ru', carGallery], ['cgtrader', cgtrader],
    ])
    const replacedIds = new Set(ALL_NATIVE_IDS)
    rawPayload.results = [
      ...rawPayload.results.filter(result => !replacedIds.has(result.sourceId)),
      ...brasil.results, ...sky.results, ...vosan.results, ...overtake.results, ...vertex.results,
      ...nativeMarkets.flatMap(item => item.results || []), ...baza.results, ...wire.results, ...cgmood.results, ...zifir.results, ...renderhub.results, ...ddd.results, ...carGallery.results, ...cgtrader.results,
    ].map(normalizeMarketResult)
    rawPayload.sources = rawPayload.sources.map(source => {
      const custom = explicit.get(source.provider)
      if (custom) return { ...source, status: custom.error ? 'error' : 'ok', count: custom.results.length, pagesFetched: custom.pagesFetched, error: custom.error }
      const native = nativeMap.get(source.provider)
      if (native) return { ...source, status: native.status, count: native.results.length, pagesFetched: native.pagesFetched, durationMs: native.durationMs, error: native.error }
      return source
    })
    rawPayload.total = rawPayload.results.length; rawPayload.freeOnly = false; rawPayload.marketMode = 'free+paid'
    console.log(`[search] ${q} :: ${rawPayload.sources.map(source => `${source.provider}=${source.status}:${source.count}@${source.pagesFetched || 0}p`).join(' | ')}`)
    cache.set(cacheKey, { createdAt: Date.now(), payload: rawPayload }); trimCache(cache); res.json({ ...rawPayload, cached: false })
  } catch (error) { console.error(error); res.status(500).json({ error: 'Global search failed.' }) }
})

app.get('/api/details', async (req, res) => {
  const sourceId = String(req.query.sourceId || '').trim().slice(0, 80), sourceUrl = String(req.query.url || '').trim().slice(0, 2000)
  if (!sourceId || !sourceUrl) return res.status(400).json({ error: 'sourceId and url are required.' })
  try { const payload = await cachedDetails(sourceId, sourceUrl); res.json({ ...payload, cached: detailsCache.has(`${sourceId}|${sourceUrl}`) }) }
  catch (error) { const message = error instanceof Error ? error.message : 'Details lookup failed.'; const status = /outside provider host|Unknown provider|required/i.test(message) ? 400 : 502; res.status(status).json({ error: message }) }
})

app.get('/api/references', async (req, res) => {
  const title = String(req.query.title || '').trim().slice(0, 160)
  const brand = String(req.query.brand || '').trim().slice(0, 80)
  const yearRaw = Number(req.query.year || 0)
  const year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2035 ? yearRaw : null
  const perAngle = Math.max(2, Math.min(Number(req.query.perAngle || 4), 6))
  if (title.length < 2) return res.status(400).json({ error: 'title is required.' })
  try {
    const payload = await searchReferencePack({ title, brand, year }, { perAngle })
    // Do not let a browser keep an obsolete empty pack after the identity matcher changes.
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    res.set('Pragma', 'no-cache')
    res.set('Expires', '0')
    res.json(payload)
  } catch (error) {
    res.status(502).json({ error: error instanceof Error ? error.message : 'Reference search failed.' })
  }
})

app.get('/api/reference-pack.zip', async (req, res) => {
  const packId = String(req.query.packId || '').trim().slice(0, 80)
  const ids = String(req.query.ids || '').split(',').map(value => value.trim()).filter(Boolean).slice(0, 20)
  if (!packId) return res.status(400).send('packId is required.')
  try {
    const zip = await buildReferenceZip(packId, ids)
    res.set('Content-Type', 'application/zip')
    res.set('Content-Disposition', `attachment; filename="${zip.filename.replace(/"/g, '')}"`)
    res.set('Content-Length', String(zip.buffer.length))
    res.set('Cache-Control', 'no-store')
    res.send(zip.buffer)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reference pack build failed.'
    const status = /expired|not found/i.test(message) ? 410 : /No redistributable/i.test(message) ? 400 : 502
    res.status(status).send(message)
  }
})

app.get('/api/download', async (req, res) => {
  const sourceId = String(req.query.sourceId || '').trim().slice(0, 80), sourceUrl = String(req.query.url || '').trim().slice(0, 2000)
  if (!sourceId || !sourceUrl) return res.status(400).send('Invalid download request.')
  try { const details = await cachedDetails(sourceId, sourceUrl); if (!details.downloadUrl) return res.status(404).send('No confirmed direct download is available for this asset.'); const target = new URL(details.downloadUrl); if (!['http:', 'https:'].includes(target.protocol)) return res.status(400).send('Invalid direct download URL.'); res.set('Cache-Control', 'no-store'); return res.redirect(302,target.href) }
  catch (error) { return res.status(502).send(error instanceof Error ? error.message : 'Download resolution failed.') }
})
app.listen(port, '0.0.0.0', () => console.log(`VJ 3D Search API listening on 0.0.0.0:${port}`))
