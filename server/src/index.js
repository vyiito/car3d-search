import express from 'express'
import cors from 'cors'
import { providers } from './providers.js'
import { progressiveSearch, progressiveNativeIds } from './progressive-search.js'
import { searchOptions } from './search-options.js'
import { getResultDetails } from './details.js'
import { searchReferencePack, buildReferenceZip } from './reference-engine.js'
import { registerProgressiveSearchRoute } from './progressive-route.js'
import { registerPreviewRoute } from './preview-resolver.js'
import { createConversionService } from './conversions.js'
import { registerClassicReferenceRoutes } from './classic-references.js'

const app = express()
const port = Number(process.env.PORT || 10000)
const allowedOrigin = process.env.CORS_ORIGIN || 'https://vyiito.github.io'
const detailsCache = new Map()
const DETAILS_CACHE_TTL_MS = Number(process.env.DETAILS_CACHE_TTL_MS || 30 * 60 * 1000)
const ALL_NATIVE_IDS = progressiveNativeIds

app.disable('x-powered-by')
app.set('trust proxy', 1)
app.use(cors({ origin: [...allowedOrigin.split(',').map(origin => origin.trim()), 'http://localhost:5173', 'http://127.0.0.1:5173'], methods: ['GET', 'POST', 'DELETE'], allowedHeaders: ['Content-Type', 'Authorization', 'X-File-Name', 'X-Car-Folder', 'X-Lease-Token'] }))
app.use(express.json({ limit: '32kb' }))
const conversions = createConversionService()
conversions.register(app)
registerProgressiveSearchRoute(app)
registerPreviewRoute(app)
registerClassicReferenceRoutes(app)

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
app.get('/health', (_req, res) => res.json({ ok: true, service: 'vj-3d-search-api', providers: providers.length, marketMode: 'free+paid', detailsResolver: true, previewResolver: true, directDownloadGate: true, paginatedSearch: true, gameFacets: true, referencePacks: true, progressiveSearch: true, nativeAdapters: ALL_NATIVE_IDS }))
app.get('/api/providers', (_req, res) => res.json(providers.map(provider => ({ id: provider.id, name: provider.name, type: provider.type, baseUrl: provider.baseUrl, browseUrl: provider.browseUrl || provider.baseUrl, freeCatalog: Boolean(provider.freeCatalog), defaultGame: provider.defaultGame || null, pagination: Boolean(provider.pagination), nativeAdapter: ALL_NATIVE_IDS.includes(provider.id) }))))

app.get('/api/search', async (req, res) => {
  const options = searchOptions(req.query), { q, perSource } = options
  if (q.length < 2) return res.status(400).json({ error: 'Query must have at least 2 characters.' })
  if (options.sourceIds.some(id => !providers.some(provider => provider.id === id))) return res.status(400).json({ error: 'Unknown provider' })
  const controller = new AbortController()
  res.on('close', () => { if (!res.writableEnded) controller.abort() })
  try {
    const payload = await progressiveSearch(q, { ...options, perSource, signal: controller.signal, refresh: req.query.refresh === '1' })
    if (!controller.signal.aborted) res.json(payload)
  } catch (error) {
    if (!controller.signal.aborted) { console.error(error); res.status(500).json({ error: 'Global search failed.' }) }
  }
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
  const vehicleClass = String(req.query.vehicleClass || '').trim().slice(0, 80)
  const yearRaw = Number(req.query.year || 0)
  const year = Number.isInteger(yearRaw) && yearRaw >= 1900 && yearRaw <= 2035 ? yearRaw : null
  const perAngle = Math.max(2, Math.min(Number(req.query.perAngle || 4), 6))
  if (title.length < 2) return res.status(400).json({ error: 'title is required.' })
  try {
    const payload = await searchReferencePack({ title, brand, year, vehicleClass }, { perAngle })
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
