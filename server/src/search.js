import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { providers } from './providers.js'

const limiter = pLimit(Number(process.env.SEARCH_CONCURRENCY || 5))
const USER_AGENT = 'Car3DSearch/0.1 (+https://github.com/vyiito/car3d-search)'
const FORMAT_RE = /\b(blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|step|stp|dwg|dxf|unitypackage|kn5)\b/gi
const PRICE_RE = /(?:US\$|R\$|\$|€|£)\s?\d+(?:[.,]\d{1,2})?|\b(?:free|grátis|gratis)\b/i

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
  return [...new Set((text.match(FORMAT_RE) || []).map(x => x.toUpperCase()))].slice(0, 8)
}

function parsePrice(text) {
  const match = clean(text).match(PRICE_RE)
  if (!match) return { price: null, isFree: null }
  const raw = match[0]
  if (/free|grátis|gratis/i.test(raw)) return { price: 0, isFree: true }
  const number = Number(raw.replace(/[^0-9.,]/g, '').replace(',', '.'))
  return { price: Number.isFinite(number) ? number : null, isFree: false }
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

function candidateCards($) {
  const selectors = [
    'article', '.card', '.product', '.product-item', '.model', '.model-card', '.item',
    '.resource', '.download', '.search-result', '.result', '.grid-item', 'li'
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

async function fetchHtml(url, timeoutMs = 9000) {
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

async function searchSketchfab(provider, query, limit) {
  const url = new URL('https://api.sketchfab.com/v3/search')
  url.searchParams.set('type', 'models')
  url.searchParams.set('q', query)
  url.searchParams.set('downloadable', 'true')
  url.searchParams.set('sort_by', '-relevance')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 9000)
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
      author: model.user?.displayName || model.user?.username || null,
      score: scoreText(`${model.name} ${model.description || ''}`, query) + 3,
    }))
  } finally {
    clearTimeout(timer)
  }
}

async function searchHtmlProvider(provider, query, limit) {
  const searchUrl = provider.buildUrl(query)
  const html = await fetchHtml(searchUrl)
  const $ = cheerio.load(html)
  $('script,style,noscript,svg').remove()

  const results = []
  const seen = new Set()
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

    const sourceUrl = absoluteUrl(anchor.attr('href'), provider.baseUrl)
    if (!sourceUrl || seen.has(sourceUrl)) continue
    const title = bestTitle($, card, anchor)
    if (!title || title.length < 3) continue

    const { price, isFree } = parsePrice(text)
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
      downloadable: null,
      author: null,
      score: relevance,
    })
    seen.add(sourceUrl)
  }

  if (!results.length) {
    $('a[href]').each((_, el) => {
      if (results.length >= limit) return false
      const anchor = $(el)
      const title = clean(anchor.attr('title') || anchor.attr('aria-label') || anchor.text())
      if (title.length < 4 || scoreText(title, query) <= 0) return
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
        author: null,
        score: scoreText(title, query),
      })
      seen.add(sourceUrl)
    })
  }

  return results
}

async function searchProvider(provider, query, limit) {
  const started = Date.now()
  try {
    const results = provider.adapter === 'sketchfab'
      ? await searchSketchfab(provider, query, limit)
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
  const perSource = Math.max(1, Math.min(Number(options.perSource || 12), 30))
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
