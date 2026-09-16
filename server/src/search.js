import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { providers } from './providers.js'

const limiter = pLimit(Number(process.env.SEARCH_CONCURRENCY || 5))
const collectionLimiter = pLimit(3)
const USER_AGENT = 'VJ3DSearch/0.7 (+https://github.com/vyiito/car3d-search)'
const FORMAT_RE = /\b(blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|step|stp|dwg|dxf|unitypackage|kn5|zip|rar|7z)\b/gi
const PRICE_RE = /(?:US\$|R\$|\$|€|£)\s?\d+(?:[.,]\d{1,2})?|\b(?:free|grátis|gratis)\b/i
const FILE_SIZE_RE = /\b\d+(?:[.,]\d+)?\s?(?:KB|MB|GB|TB)\b/i
const DIRECT_FILE_RE = /\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|kn5)(?:$|[?#])/i
const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/

const VEHICLE_ONLY_PROVIDERS = new Set([
  '3drush', 'brasil-simulator-mods', 'assettomods', 'assettohub', 'ets2lt', 'vosan',
  'done3d', 'free3dio', 'vertex-warehouse', 'mediafire-rr3', 'open3dlab', 'vk-3d-car-models'
])

const BRANDS = [
  'Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Caterham','Chery','Chevrolet','Chrysler','Citroen','Cupra','Dacia','Daihatsu','Dodge','Ferrari','Fiat','Ford','Genesis','Geely','GMC','Honda','Holden','Hummer','Hyundai','Infiniti','Isuzu','Jaguar','Jeep','Kia','Koenigsegg','Lada','Lamborghini','Lancia','Land Rover','Lexus','Lincoln','Lotus','Lucid','Mahindra','Maserati','Mazda','McLaren','Mercedes','Mercedes-Benz','Mercury','MG','Mini','Mitsubishi','Nio','Nissan','Oldsmobile','Opel','Pagani','Peugeot','Plymouth','Polestar','Pontiac','Porsche','Proton','Ram','Renault','Rimac','Rivian','Rolls-Royce','Rover','Saab','Saturn','Scion','Seat','Skoda','Smart','Subaru','Suzuki','Tata','Tesla','Toyota','Vauxhall','Volkswagen','Volvo','Wuling','Zeekr',
  'DAF','Freightliner','International','Iveco','Kamaz','Kenworth','Mack','MAN','Peterbilt','Scania','Western Star','ZIL','GAZ','UAZ',
  'Aprilia','BMW Motorrad','Can-Am','Ducati','Harley-Davidson','Husqvarna','Indian','Kawasaki','KTM','Royal Enfield','Suzuki','Triumph','Vespa','Yamaha',
  'Caterpillar','John Deere','Kirovets','Kubota','Massey Ferguson','New Holland'
]

const VEHICLE_TERMS = [
  'car','cars','vehicle','vehicles','automobile','automotive','sedan','saloon','coupe','coupé','hatchback','hatch','wagon','estate','roadster','convertible','cabriolet','cabrio','supercar','hypercar','racecar','race car','racing car','sports car','muscle car','concept car','taxi','police car','ambulance','limousine',
  'suv','crossover','4x4','offroad','off-road','pickup','pick-up','ute','truck','lorry','semi truck','tractor unit','bus','coach','minibus','van','minivan','mpv','camper','motorhome','trailer',
  'motorcycle','motorbike','bike','scooter','moped','quad','atv','kart','go-kart','buggy','formula','gt3','gt4','rally','drift','nascar','indycar','dragster',
  'tractor','harvester','excavator','bulldozer','forklift','loader','agricultural vehicle'
]

const NEGATIVE_TERMS = [
  'cityscape','city block','city hall','city center','city centre','downtown','skyline','building','buildings','architecture','architectural','house','apartment','skyscraper','street scene','urban scene','terrain','landscape','village','town','furniture','chair','sofa','table','room','interior scene','airport terminal','train station'
]

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const phraseRegex = value => new RegExp(`(^|[^a-z0-9])${escapeRegex(norm(value))}([^a-z0-9]|$)`, 'i')
const BRAND_PATTERNS = BRANDS.map(name => [name, phraseRegex(name)])
const VEHICLE_PATTERNS = VEHICLE_TERMS.map(term => [term, phraseRegex(term)])
const NEGATIVE_PATTERNS = NEGATIVE_TERMS.map(term => [term, phraseRegex(term)])

function absoluteUrl(value, base) {
  if (!value) return null
  try { return new URL(value, base).href } catch { return null }
}

function scoreText(text, query) {
  const source = norm(text)
  const tokens = norm(query).split(/\s+/).filter(t => t.length > 1)
  if (!tokens.length) return 0
  let score = 0
  for (const token of tokens) if (source.includes(token)) score += 1
  if (source.includes(norm(query))) score += 3
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

function parseFileSize(text) { return clean(text).match(FILE_SIZE_RE)?.[0] || null }
function findBrand(text) { const value = norm(text); for (const [brand, pattern] of BRAND_PATTERNS) if (pattern.test(value)) return brand; return null }
function matchingVehicleTerms(text) { const value = norm(text); return VEHICLE_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([term]) => term) }
function negativeCount(text) { const value = norm(text); return NEGATIVE_PATTERNS.reduce((count, [, pattern]) => count + (pattern.test(value) ? 1 : 0), 0) }

function inferVehicleClass(text, providerId) {
  const value = norm(text)
  const has = (...terms) => terms.some(term => phraseRegex(term).test(value))
  if (has('motorcycle','motorbike','scooter','moped','bike','quad','atv')) return 'Motorcycle'
  if (has('bus','coach','minibus')) return 'Bus'
  if (has('tractor','harvester','excavator','bulldozer','forklift','loader','agricultural vehicle')) return 'Utility / Tractor'
  if (has('truck','lorry','semi truck','tractor unit','pickup','pick-up','ute')) return 'Truck / Pickup'
  if (has('van','minivan','mpv','camper','motorhome')) return 'Van'
  if (has('suv','crossover','4x4','offroad','off-road')) return 'SUV'
  if (has('formula','gt3','gt4','rally','drift','racecar','race car','racing car','nascar','indycar','dragster')) return 'Race Car'
  if (providerId === 'ets2lt') return 'Truck / Pickup'
  return 'Car'
}

function inferYear(text) { const match = clean(text).match(YEAR_RE); return match ? Number(match[1]) : null }

function automotiveMeta(title, description, provider) {
  const titleText = clean(title)
  const fullText = `${titleText} ${clean(description)}`
  const brand = findBrand(titleText) || findBrand(fullText)
  const titleVehicleTerms = matchingVehicleTerms(titleText)
  const fullVehicleTerms = matchingVehicleTerms(fullText)
  const negatives = negativeCount(titleText)
  const dedicated = VEHICLE_ONLY_PROVIDERS.has(provider.id)
  const automotive = Boolean(brand || titleVehicleTerms.length || (dedicated && fullVehicleTerms.length)) && !(negatives >= 2 && !brand && !titleVehicleTerms.length)
  return { automotive, brand, year: inferYear(titleText), vehicleClass: inferVehicleClass(fullText, provider.id), autoSignalScore: (brand ? 4 : 0) + titleVehicleTerms.length * 2 + Math.min(fullVehicleTerms.length, 3) - negatives * 2 }
}

function decorateResult(result, provider) {
  const meta = automotiveMeta(result.title, result.description, provider)
  if (!meta.automotive) return null
  return { ...result, brand: meta.brand, year: meta.year, vehicleClass: meta.vehicleClass, score: result.score + Math.max(meta.autoSignalScore, 0) }
}

function bestImage($, card, baseUrl) {
  const img = card.find('img').first()
  const raw = img.attr('src') || img.attr('data-src') || img.attr('data-lazy-src') || img.attr('data-original') || img.attr('srcset')?.split(',')[0]?.trim().split(' ')[0]
  return absoluteUrl(raw, baseUrl)
}

function bestTitle($, card, anchor) {
  const heading = card.find('h1,h2,h3,h4,h5,.title,.name').first().text()
  const aria = anchor.attr('aria-label') || anchor.attr('title')
  return clean(heading || aria || anchor.text())
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
    const url = absoluteUrl($(el).attr('href') || '', baseUrl)
    if (url && DIRECT_FILE_RE.test(url)) found = url
  })
  return found
}

function descriptionFromText(text, title) {
  let value = clean(text)
  if (title) value = value.replace(title, '').trim()
  return value ? value.slice(0, 420) : null
}

function candidateCards($) {
  const selectors = ['article','.card','.product','.product-item','.model','.model-card','.item','.resource','.download','.search-result','.result','.grid-item','.file','.project','li']
  const seen = new Set(), cards = []
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      if (seen.has(el)) return
      const text = clean($(el).text())
      if (text.length < 5 || text.length > 2500) return
      seen.add(el); cards.push($(el))
    })
  }
  return cards
}

async function fetchHtml(url, timeoutMs = 10000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally { clearTimeout(timer) }
}

function extractHtmlResults(provider, query, limit, html) {
  const $ = cheerio.load(html)
  $('script,style,noscript,svg').remove()
  const results = [], seen = new Set()

  const pushResult = (card, anchor, text, relevance) => {
    const sourceUrl = absoluteUrl(anchor.attr('href'), provider.baseUrl)
    if (!sourceUrl || seen.has(sourceUrl)) return
    const title = bestTitle($, card, anchor)
    if (!title || title.length < 3) return
    const { price, isFree } = parsePrice(text)
    const downloadUrl = directDownloadUrl($, card, provider.baseUrl)
    const candidate = decorateResult({
      id: `${provider.id}:${Buffer.from(sourceUrl).toString('base64url').slice(0, 24)}`, title, source: provider.name, sourceId: provider.id, sourceType: provider.type, sourceUrl,
      imageUrl: bestImage($, card, provider.baseUrl), formats: parseFormats(text), price, isFree, downloadable: downloadUrl ? true : null, downloadUrl,
      author: bestAuthor($, card), description: descriptionFromText(text, title), fileSize: parseFileSize(text), score: relevance,
    }, provider)
    if (!candidate) return
    results.push(candidate); seen.add(sourceUrl)
  }

  for (const card of candidateCards($)) {
    if (results.length >= limit) break
    const text = clean(card.text()), relevance = scoreText(text, query)
    if (relevance <= 0) continue
    let anchor = card.find('a[href]').filter((_, el) => { const href = $(el).attr('href') || ''; return !href.startsWith('#') && !href.startsWith('javascript:') }).first()
    if (!anchor.length && card.is('a[href]')) anchor = card
    if (anchor.length) pushResult(card, anchor, text, relevance)
  }

  if (!results.length) {
    $('a[href]').each((_, el) => {
      if (results.length >= limit) return false
      const anchor = $(el), title = clean(anchor.attr('title') || anchor.attr('aria-label') || anchor.text()), relevance = scoreText(title, query)
      if (title.length < 4 || relevance <= 0) return
      const sourceUrl = absoluteUrl(anchor.attr('href'), provider.baseUrl)
      if (!sourceUrl || seen.has(sourceUrl)) return
      const candidate = decorateResult({
        id: `${provider.id}:${Buffer.from(sourceUrl).toString('base64url').slice(0, 24)}`, title, source: provider.name, sourceId: provider.id, sourceType: provider.type, sourceUrl,
        imageUrl: null, formats: [], price: null, isFree: null, downloadable: DIRECT_FILE_RE.test(sourceUrl) ? true : null,
        downloadUrl: DIRECT_FILE_RE.test(sourceUrl) ? sourceUrl : null, author: null, description: null, fileSize: null, score: relevance,
      }, provider)
      if (candidate) { results.push(candidate); seen.add(sourceUrl) }
    })
  }
  return results
}

function extractFlightStrings(html) {
  const $ = cheerio.load(html), payloads = []
  $('script').each((_, element) => {
    const text = $(element).text().trim()
    if (!text.startsWith('self.__next_f.push(')) return
    const open = text.indexOf('push('), close = text.lastIndexOf(')')
    if (open < 0 || close <= open) return
    try {
      const tuple = JSON.parse(text.slice(open + 5, close))
      if (typeof tuple?.[1] === 'string') payloads.push(tuple[1])
    } catch {}
  })
  return payloads
}

function extractJsonArrayAfter(text, marker) {
  const markerIndex = text.indexOf(marker)
  if (markerIndex < 0) return null
  const start = text.indexOf('[', markerIndex + marker.length)
  if (start < 0) return null
  let depth = 0, inString = false, escaped = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') { inString = true; continue }
    if (char === '[') depth += 1
    else if (char === ']') {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, index + 1)) } catch { return null }
      }
    }
  }
  return null
}

function vertexSlug(value) {
  return norm(value).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
}

async function searchVertex(provider, query, limit) {
  const html = await fetchHtml(provider.buildUrl(query), 12000)
  const payloads = extractFlightStrings(html)
  let items = null
  for (const payload of payloads) {
    if (!payload.includes('initialData')) continue
    items = extractJsonArrayAfter(payload, '"initialData":')
    if (Array.isArray(items)) break
  }
  if (!Array.isArray(items)) return []

  return items.slice(0, limit).map(item => {
    const title = clean(item?.name)
    if (!title || !item?.id || !item?.pages?.key) return null
    const shortId = String(item.id).split('-')[0]
    const sourceUrl = `${provider.baseUrl}/models/${encodeURIComponent(item.pages.key)}/${encodeURIComponent(shortId)}/${vertexSlug(title)}`
    const description = [item.pages?.name, Array.isArray(item.tags) && item.tags.length ? `Tags: ${item.tags.join(', ')}` : null].filter(Boolean).join(' · ')
    return decorateResult({
      id: `${provider.id}:${item.id}`, title, source: provider.name, sourceId: provider.id, sourceType: provider.type, sourceUrl,
      imageUrl: Array.isArray(item.images) ? item.images[0] || null : null,
      formats: Array.isArray(item.formats) ? [...new Set(item.formats.map(value => String(value).toUpperCase()))].slice(0, 10) : [],
      price: 0, isFree: true, downloadable: true, downloadUrl: null,
      author: item.created_by?.username || null, description: description || null, fileSize: null,
      score: scoreText(`${title} ${(item.tags || []).join(' ')} ${item.pages?.name || ''}`, query) + 5,
    }, provider)
  }).filter(Boolean)
}

async function searchSketchfab(provider, query, limit) {
  const url = new URL('https://api.sketchfab.com/v3/search')
  url.searchParams.set('type', 'models'); url.searchParams.set('q', query); url.searchParams.set('downloadable', 'true'); url.searchParams.set('sort_by', '-relevance')
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': USER_AGENT } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    return (data.results || []).map(model => decorateResult({
      id: `${provider.id}:${model.uid}`, title: clean(model.name), source: provider.name, sourceId: provider.id, sourceType: provider.type,
      sourceUrl: model.viewerUrl || `https://sketchfab.com/3d-models/${model.uid}`,
      imageUrl: model.thumbnails?.images?.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null,
      formats: [], price: model.price ?? null, isFree: model.price === 0 ? true : null, downloadable: Boolean(model.isDownloadable), downloadUrl: null,
      author: model.user?.displayName || model.user?.username || null, description: clean(model.description).slice(0, 420) || null, fileSize: null,
      score: scoreText(`${model.name} ${model.description || ''}`, query) + 3,
    }, provider)).filter(Boolean).slice(0, limit)
  } finally { clearTimeout(timer) }
}

async function searchHtmlProvider(provider, query, limit) { return extractHtmlResults(provider, query, limit, await fetchHtml(provider.buildUrl(query))) }

async function searchCollectionProvider(provider, query, limit) {
  const urls = [provider.collectionUrl, ...(provider.extraCollectionUrls || [])].filter(Boolean)
  if (provider.id === 'open3dlab') {
    const carCollection = 'https://open3dlab.com/list/0a696900-05a3-4394-a0cc-0a964e5fec89/'
    for (let page = 2; page <= 7; page += 1) urls.push(`${carCollection}?page=${page}`)
  }
  const documents = await Promise.allSettled([...new Set(urls)].map(url => collectionLimiter(() => fetchHtml(url, 12000))))
  const merged = []
  for (const document of documents) if (document.status === 'fulfilled') merged.push(...extractHtmlResults(provider, query, limit, document.value))
  return dedupe(merged).slice(0, limit)
}

async function searchProvider(provider, query, limit) {
  const started = Date.now()
  try {
    const results = provider.id === 'vertex-warehouse'
      ? await searchVertex(provider, query, limit)
      : provider.adapter === 'sketchfab'
        ? await searchSketchfab(provider, query, limit)
        : provider.adapter === 'collection'
          ? await searchCollectionProvider(provider, query, limit)
          : await searchHtmlProvider(provider, query, limit)
    return { provider: provider.id, name: provider.name, status: 'ok', count: results.length, searchUrl: provider.buildUrl(query), durationMs: Date.now() - started, results }
  } catch (error) {
    return { provider: provider.id, name: provider.name, status: 'error', count: 0, searchUrl: provider.buildUrl(query), durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Unknown error', results: [] }
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
  const sources = await Promise.all(providers.map(provider => limiter(() => searchProvider(provider, query, perSource))))
  const results = dedupe(sources.flatMap(source => source.results))
  return { query, total: results.length, providerCount: providers.length, searchedProviders: sources.length, successfulProviders: sources.filter(x => x.status === 'ok').length, automotiveOnly: true, results, sources: sources.map(({ results: _results, ...source }) => source) }
}
