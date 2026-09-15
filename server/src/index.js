import express from 'express'
import cors from 'cors'
import { providers } from './providers.js'
import { searchAll } from './search.js'

const app = express()
const port = Number(process.env.PORT || 10000)
const allowedOrigin = process.env.CORS_ORIGIN || 'https://vyiito.github.io'
const cache = new Map()
const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 10 * 60 * 1000)

app.disable('x-powered-by')
app.use(cors({ origin: [allowedOrigin, 'http://localhost:5173'], methods: ['GET'] }))
app.use(express.json({ limit: '32kb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'vj-3d-search-api', providers: providers.length })
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
  const cacheKey = `${q.toLowerCase()}|${perSource}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return res.json({ ...cached.payload, cached: true })
  }

  try {
    const payload = await searchAll(q, { perSource })
    cache.set(cacheKey, { createdAt: Date.now(), payload })
    if (cache.size > 100) {
      const oldest = [...cache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, 20)
      for (const [key] of oldest) cache.delete(key)
    }
    res.json({ ...payload, cached: false })
  } catch (error) {
    console.error(error)
    res.status(500).json({ error: 'Global search failed.' })
  }
})

app.listen(port, '0.0.0.0', () => {
  console.log(`VJ 3D Search API listening on 0.0.0.0:${port}`)
})
