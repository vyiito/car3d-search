import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { providers } from './providers.js'

const limiter = pLimit(Number(process.env.SEARCH_CONCURRENCY || 5))
const collectionLimiter = pLimit(3)
const USER_AGENT = 'VJ3DSearch/0.2 (+https://github.com/vyiito/car3d-search)'
const FORMAT_RE = /\b(blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|step|stp|dwg|dxf|unitypackage|kn5|zip|rar|7z)\b/gi
const PRICE_RE = /(?:US\$|R\$|\$|€|£)\s?\d+(?:[.,]\d{1,2})?|\b(?:free|grátis|gratis)\b/i
const FILE_SIZE_RE = /\b\d+(?:[.,]\d+)?\s?(?:KB|MB|GB|TB)\b/i
const DIRECT_FILE_RE = /\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|kn5)(?:$|[?#])/i

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()

function absoluteUrl(value, base) {
  if (!value) return null
  try { return new URL(value, base).href } catch { return null }
}

function scoreText(text, query) {
  const source = clean(text).toLowerCase()
  const tokens = clean(query).toLowerCase().split(/\s+/).filter(t => t.length > 1)
  if (!tokens.length) return 0
  let score = 0
  for (const token of tokens) if (source.includes(token)) score += 1
  if (source.includes(clean(query).toLowerCase())) score += 3
  return score
}

function parseFormats(text) {
  return [...new Set((text.match(FORMAT_RE) || []).map(x => x.toUpperCase()))].slice(0, 10)
}

function parsePrice(text) {
  const match = clean(text).match(PRICE_RE)
  if (!match) return { price: null, isFree: null }
  const raw = match[0]
  if (/free|grátis|gratis/i.test(raw)) return { price: 0, isFree: true }
  const number = Number(raw.replace(/[^0-9.,]/g, '').replace(',', '.'))
  return { price: Number.isFinite(number) ? number : null, isFree: false }
}

function parseFileSize(text) {
  return clean(text).match(FILE_SIZE_RE)?.[0] || null
}

function bestImage($, card, baseUrl) {
  const img = card.find('img').first()
  const raw = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original') || img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0]
  return absoluteUrl(raw, baseUrl)
}

function bestTitle($, card, anchor) {
  const heading = card.find('h1,h2,h3,h4,h5,.title,.name').first().text()
  const aria = anchor.attr('aria-label') || anchor.attr('title')
  const text = anchor.text()
  return clean(heading || aria || text)
}

function bestAuthor($, card) {
  const node = card.find('[rel="author"],.author,.username,.user,.creator,.byline').first()
  const text = clean(node.text())
  return text && text.length < 100 ? text.replace(/^by\s+/i, '') : null
}

function directDownloadUrl($, card, baseUrl) {
  let found = null
  card.find('a[href]').each((_, el) => {
    if (found) return false
    const href = $(el).attr('href') || ''
    const url = absoluteUrl(href, baseUrl)
    if (!url) return
    if (DIRECT_FILE_RE.test(url)) found = url
  })
  return found
}

function descriptionFromText(text, title) {
  let value = clean(text)
  if (title) value = value.replace(title, '').trim()
  return value ? value.slice(0, 420) : null
}

function candidateCards($) {
  const selectors = [
    'article', '.card', '.product', '.product-item', '.model', '.model-card', '.item',
    '.resource', '.download', '.search-result', '.result', '.grid-item', '.file', '.project', 'li'
  ]
  const seen = new Set()
  const cards = []
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      if (seen.has(el)) return
      const text = clean($(el).text())
      if (text.length < 5 || text.length > 2500) return
      seen.add(el)
      cards.push($(el))
    })
  }
  return cards
}

async function fetchHtml(url, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        'accept': 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

function extractHtmlResults(provider, query, limit, html) {
  const $ = cheerio.load(html)
  $('script,style,noscript,svg').remove()
  const results = []
  const seen = new Set()

  const pushResult = (card, anchor, text, relevance) => {
    const sourceUrl = absoluteUrl(anchor.attr('href'), provider.baseUrl)
    if (!sourceUrl || seen.has(sourceUrl)) return
    const title = bestTitle($, card, anchor)
    if (!title || title.length < 3) return
    const { price, isFree } = parsePrice(text)
    const downloadUrl = directDownloadUrl($, card, provider.baseUrl)
    results.push({
      id: `${provider.id}:${Buffer.from(sourceUrl).toString('base64url').slice(0, 24)}`,
      title,
      source: provider.name,
      sourceId: provider.id,
      sourceType: provider.type,
      sourceUrl,
      imageUrl: bestImage($, card, provider.baseUrl),
      formats: parseFormats(text),
      price,
      isFree,
      downloadable: downloadUrl ? true : null,
      downloadUrl,
      author: bestAuthor($, card),
      description: descriptionFromText(text, title),
      fileSize: parseFileSize(text),
      score: relevance,
    })
    seen.add(sourceUrl)
  }

  for (const card of candidateCards($)) {
    if (results.length >= limit) break
    const text = clean(card.text())
    const relevance = scoreText(text, query)
    if (relevance <= 0) continue
    let anchor = card.find('a[href]').filter((_, el) => {
      const href = $(el).attr('href') || ''
      return !href.startsWith('#') && !href.startsWith('javascript:')
    }).first()
    if (!anchor.length && card.is('a[href]')) anchor = card
    if (!anchor.length) continue
    pushResult(card, anchor, text, relevance)
  }

  if (!results.length) {
    $('a[href]').each((_, el) => {
      if (results.length >= limit) return false
      const anchor = $(el)
      const title = clean(anchor.attr('title') || anchor.attr('aria-label') || anchor.text())
      const relevance = scoreText(title, query)
      if (title.length < 4 || relevance <= 0) return
      const sourceUrl = absoluteUrl(anchor.attr('href'), provider.baseUrl)
      if (!sourceUrl || seen.has(sourceUrl)) return
      results.push({
        id: `${provider.id}:${Buffer.from(sourceUrl).toString('base64url').slice(0, 24)}`,
        title,
        source: provider.name,
        sourceId: provider.id,
        sourceType: provider.type,
        sourceUrl,
        imageUrl: null,
        formats: [],
        price: null,
        isFree: null,
        downloadable: null,
        downloadUrl: DIRECT_FILE_RE.test(sourceUrl) ? sourceUrl : null,
        author: null,
        description: null,
        fileSize: null,
        score: relevance,
      })
      seen.add(sourceUrl)
    })
  }

  return results
}

async function searchSketchfab(provider, query, limit) {
  const url = new URL('https://api.sketchfab.com/v3/search')
  url.searchParams.set('type', 'models')
  url.searchParams.set('q', query)
  url.searchParams.set('downloadable', 'true')
  url.searchParams.set('sort_by', '-relevance')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': USER_AGENT } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return (data.results || []).slice(0, limit).map(model => ({
      id: `${provider.id}:${model.uid}`,
      title: clean(model.name),
      source: provider.name,
      sourceId: provider.id,
      sourceType: provider.type,
      sourceUrl: model.viewerUrl || `https://sketchfab.com/3d-models/${model.uid}`,
      imageUrl: model.thumbnails?.images?.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null,
      formats: [],
      price: model.price ?? null,
      isFree: model.price === 0 ? true : null,
      downloadable: Boolean(model.isDownloadable),
      downloadUrl: null,
      author: model.user?.displayName || model.user?.username || null,
      description: clean(model.description).slice(0, 420) || null,
      fileSize: null,
      score: scoreText(`${model.name} ${model.description || ''}`, query) + 3,
    }))
  } finally {
    clearTimeout(timer)
  }
}

async function searchHtmlProvider(provider, query, limit) {
  const searchUrl = provider.buildUrl(query)
  const html = await fetchHtml(searchUrl)
  return extractHtmlResults(provider, query, limit, html)
}

async function searchCollectionProvider(provider, query, limit) {
  const urls = [provider.collectionUrl, ...(provider.extraCollectionUrls || [])].filter(Boolean)
  if (provider.id === 'open3dlab') {
    const carCollection = 'https://open3dlab.com/list/0a696900-05a3-4394-a0cc-0a964e5fec89/'
    for (let page = 2; page <= 7; page += 1) urls.push(`${carCollection}?page=${page}`)
  }
  const uniqueUrls = [...new Set(urls)]
  const documents = await Promise.allSettled(uniqueUrls.map(url => collectionLimiter(() => fetchHtml(url, 12000))))
  const merged = []
  for (const document of documents) {
    if (document.status !== 'fulfilled') continue
    merged.push(...extractHtmlResults(provider, query, limit, document.value))
  }
  return dedupe(merged).slice(0, limit)
}

async function searchProvider(provider, query, limit) {
  const started = Date.now()
  try {
    const results = provider.adapter === 'sketchfab'
      ? await searchSketchfab(provider, query, limit)
      : provider.adapter === 'collection'
        ? await searchCollectionProvider(provider, query, limit)
        : await searchHtmlProvider(provider, query, limit)
    return {
      provider: provider.id,
      name: provider.name,
      status: 'ok',
      count: results.length,
      searchUrl: provider.buildUrl(query),
      durationMs: Date.now() - started,
      results,
    }
  } catch (error) {
    return {
      provider: provider.id,
      name: provider.name,
      status: 'error',
      count: 0,
      searchUrl: provider.buildUrl(query),
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Unknown error',
      results: [],
    }
  }
}

function dedupe(results) {
  const map = new Map()
  for (const result of results) {
    const key = `${result.sourceId}:${result.sourceUrl}`
    const current = map.get(key)
    if (!current || result.score > current.score) map.set(key, result)
  }
  return [...map.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
}

export async function searchAll(query, options = {}) {
  const perSource = Math.max(1, Math.min(Number(options.perSource || 20), 50))
  const jobs = providers.map(provider => limiter(() => searchProvider(provider, query, perSource)))
  const sources = await Promise.all(jobs)
  const results = dedupe(sources.flatMap(source => source.results))
  return {
    query,
    total: results.length,
    providerCount: providers.length,
    searchedProviders: sources.length,
    successfulProviders: sources.filter(x => x.status === 'ok').length,
    results,
    sources: sources.map(({ results: _results, ...source }) => source),
  }
}
