import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { providers } from './providers.js'

const limiter = pLimit(Number(process.env.SEARCH_CONCURRENCY || 5))
const collectionLimiter = pLimit(3)
const USER_AGENT = 'VJ3DSearch/0.9 (+https://github.com/vyiito/car3d-search)'
const MAX_HTML_PAGES = Math.max(1, Math.min(Number(process.env.MAX_PROVIDER_PAGES || 5), 10))
const MAX_VERTEX_PAGES = Math.max(1, Math.min(Number(process.env.MAX_VERTEX_PAGES || 8), 20))
const FORMAT_RE = /\b(blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|step|stp|dwg|dxf|unitypackage|kn5|dds|png|jpg|jpeg|textures|zip|rar|7z)\b/gi
const PRICE_RE = /(?:US\$|R\$|\$|€|£)\s?\d+(?:[.,]\d{1,2})?|\b(?:free|grátis|gratis)\b/i
const FILE_SIZE_RE = /\b\d+(?:[.,]\d+)?\s?(?:KB|MB|GB|TB)\b/i
const DIRECT_FILE_RE = /\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|kn5|skp)(?:$|[?#])/i
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

const GAMES = [
  ['Forza Horizon 5',['forza horizon 5','fh5']],
  ['Forza Horizon 4',['forza horizon 4','fh4']],
  ['Forza Horizon 6',['forza horizon 6','fh6']],
  ['Forza Motorsport',['forza motorsport','fm8']],
  ['Assetto Corsa Competizione',['assetto corsa competizione','acc']],
  ['Assetto Corsa',['assetto corsa']],
  ['CarX Drift Racing 2',['carx drift racing 2','cxdr 2']],
  ['CarX Street',['carx street']],
  ['CSR Racing 2',['csr racing 2','csr2']],
  ['CSR Racing 3',['csr racing 3','csr3']],
  ['Real Racing 3',['real racing 3','rr3']],
  ['Need for Speed No Limits',['need for speed no limits','nfs no limits','nfsnl']],
  ['Need for Speed Mobile',['need for speed mobile']],
  ['Need for Speed Heat',['need for speed heat']],
  ['Need for Speed Unbound',['need for speed unbound']],
  ['Need for Speed',['need for speed','nfs']],
  ['BeamNG.drive',['beamng.drive','beamng']],
  ['Euro Truck Simulator 2',['euro truck simulator 2','ets2']],
  ['American Truck Simulator',['american truck simulator','ats']],
  ['Automobilista 2',['automobilista 2','ams2']],
  ['rFactor 2',['rfactor 2']],
  ['GTA V',['gta v','gta 5','grand theft auto v']],
  ['GTA IV',['gta iv','gta 4','grand theft auto iv']],
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

function sameSite(url, baseUrl) {
  try {
    const a = new URL(url).hostname.replace(/^www\./,'')
    const b = new URL(baseUrl).hostname.replace(/^www\./,'')
    return a === b || a.endsWith(`.${b}`)
  } catch { return false }
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
  return [...new Set((String(text || '').match(FORMAT_RE) || []).map(x => x.toUpperCase()))].slice(0, 12)
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

function inferGame(provider, text) {
  if (provider.defaultGame) return provider.defaultGame
  const value = norm(text)
  for (const [game, aliases] of GAMES) if (aliases.some(alias => value.includes(norm(alias)))) return game
  return null
}

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
  return {
    ...result,
    brand: meta.brand,
    year: result.year || meta.year,
    vehicleClass: result.vehicleClass || meta.vehicleClass,
    game: result.game || inferGame(provider, `${result.title} ${result.description || ''}`),
    score: result.score + Math.max(meta.autoSignalScore, 0),
  }
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
  return value ? value.slice(0, 520) : null
}

function candidateCards($) {
  const selectors = ['article','.card','.product','.product-item','.model','.model-card','.item','.resource','.download','.search-result','.result','.grid-item','.file','.project','li']
  const seen = new Set(), cards = []
  for (const selector of selectors) {
    $(selector).each((_, el) => {
      if (seen.has(el)) return
      const text = clean($(el).text())
      if (text.length < 5 || text.length > 3000) return
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
    return { html: await response.text(), finalUrl: response.url || url }
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

function paginationUrls(html, currentUrl, provider) {
  if (provider.pagination === false) return []
  const $ = cheerio.load(html), found = new Map()
  $('a[href]').each((_, element) => {
    const node = $(element)
    const href = absoluteUrl(node.attr('href'), currentUrl)
    if (!href || href === currentUrl || !sameSite(href, provider.baseUrl)) return
    const label = clean(`${node.text()} ${node.attr('aria-label') || ''} ${node.attr('title') || ''}`)
    const rel = clean(node.attr('rel'))
    let target
    try { target = new URL(href) } catch { return }
    const pageLike = /(?:^|[?&])(page|paged|p)=\d+/i.test(target.search) || /\/page\/\d+/i.test(target.pathname) || /(?:offset|start)=\d+/i.test(target.search)
    const nextLike = /next|próxim|proxim|older|mais|›|»|→/i.test(label) || /next/i.test(rel)
    const numeric = /^\s*\d+\s*$/.test(node.text())
    if (!pageLike && !nextLike && !numeric) return
    let score = nextLike ? 10 : numeric ? 5 : 3
    const pageValue = Number(target.searchParams.get('page') || target.searchParams.get('paged') || target.searchParams.get('p') || 0)
    score += Number.isFinite(pageValue) ? Math.min(pageValue, 50) / 100 : 0
    if (!found.has(href) || found.get(href) < score) found.set(href, score)
  })
  return [...found.entries()].sort((a,b) => b[1]-a[1]).map(([url]) => url).slice(0, 8)
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

function parseBalancedObject(text, start) {
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
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, index + 1)) } catch { return null }
      }
    }
  }
  return null
}

function extractCgTraderListings(html) {
  const results = [], re = /\{"id":"?[A-Za-z0-9_-]+"?,"type":"listingItem","attributes":\{/g
  let match
  while ((match = re.exec(html)) && results.length < 100) {
    const object = parseBalancedObject(html, match.index)
    if (object?.type === 'listingItem' && object?.attributes) results.push(object.attributes)
    re.lastIndex = Math.max(re.lastIndex, match.index + 1)
  }
  return results
}

function vertexSlug(value) {
  return norm(value).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)
}

function parseVertexPage(html) {
  const payloads = extractFlightStrings(html)
  for (const payload of payloads) {
    if (!payload.includes('initialData')) continue
    const items = extractJsonArrayAfter(payload, '"initialData":')
    if (Array.isArray(items)) return { items, hasNext: /"isNextPage":true/.test(payload) }
  }
  return { items: [], hasNext: false }
}

async function searchVertex(provider, query, limit) {
  const merged = [], seen = new Set()
  let pagesFetched = 0
  for (let page = 1; page <= MAX_VERTEX_PAGES && merged.length < limit; page += 1) {
    const url = new URL(provider.buildUrl(query))
    if (page > 1) url.searchParams.set('page', String(page))
    const { html } = await fetchHtml(url.href, 12000)
    pagesFetched += 1
    const parsed = parseVertexPage(html)
    let newItems = 0
    for (const item of parsed.items) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id); newItems += 1
      const title = clean(item?.name)
      if (!title || !item?.pages?.key) continue
      const shortId = String(item.id).split('-')[0]
      const sourceUrl = `${provider.baseUrl}/models/${encodeURIComponent(item.pages.key)}/${encodeURIComponent(shortId)}/${vertexSlug(title)}`
      const game = clean(item.pages?.name) || null
      const description = [game, Array.isArray(item.tags) && item.tags.length ? `Tags: ${item.tags.join(', ')}` : null].filter(Boolean).join(' · ')
      const candidate = decorateResult({
        id: `${provider.id}:${item.id}`, title, source: provider.name, sourceId: provider.id, sourceType: provider.type, sourceUrl,
        imageUrl: Array.isArray(item.images) ? item.images[0] || null : null,
        formats: Array.isArray(item.formats) ? [...new Set(item.formats.map(value => String(value).toUpperCase()))].slice(0, 12) : [],
        price: 0, isFree: true, downloadable: true, downloadUrl: null, game,
        author: item.created_by?.username || null, description: description || null, fileSize: null,
        score: scoreText(`${title} ${(item.tags || []).join(' ')} ${game || ''}`, query) + 5,
      }, provider)
      if (candidate) merged.push(candidate)
      if (merged.length >= limit) break
    }
    if (!parsed.hasNext || newItems === 0) break
  }
  return { results: dedupe(merged).slice(0, limit), pagesFetched }
}

async function searchSketchfab(provider, query, limit) {
  const url = new URL('https://api.sketchfab.com/v3/search')
  url.searchParams.set('type', 'models'); url.searchParams.set('q', query); url.searchParams.set('downloadable', 'true'); url.searchParams.set('sort_by', '-relevance'); url.searchParams.set('count', String(Math.min(limit, 48)))
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': USER_AGENT } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const data = await response.json()
    const results = (data.results || []).map(model => decorateResult({
      id: `${provider.id}:${model.uid}`, title: clean(model.name), source: provider.name, sourceId: provider.id, sourceType: provider.type,
      sourceUrl: model.viewerUrl || `https://sketchfab.com/3d-models/${model.uid}`,
      imageUrl: model.thumbnails?.images?.slice().sort((a, b) => (b.width || 0) - (a.width || 0))[0]?.url || null,
      formats: [], price: model.price ?? null, isFree: model.price === 0 ? true : null, downloadable: Boolean(model.isDownloadable), downloadUrl: null,
      author: model.user?.displayName || model.user?.username || null, description: clean(model.description).slice(0, 520) || null, fileSize: null,
      score: scoreText(`${model.name} ${model.description || ''}`, query) + 3,
    }, provider)).filter(Boolean).slice(0, limit)
    return { results, pagesFetched: 1 }
  } finally { clearTimeout(timer) }
}

async function searchCgTrader(provider, query, limit) {
  const merged = []
  let pagesFetched = 0
  for (let page = 1; page <= MAX_HTML_PAGES && merged.length < limit; page += 1) {
    const url = new URL(provider.buildUrl(query))
    if (page > 1) url.searchParams.set('page', String(page))
    const { html } = await fetchHtml(url.href, 12000)
    pagesFetched += 1
    const listings = extractCgTraderListings(html)
    if (!listings.length && page === 1) merged.push(...extractHtmlResults(provider, query, limit, html))
    let added = 0
    for (const item of listings) {
      if (typeof item.price === 'number' && item.price > 0) continue
      const title = clean(item.title)
      const sourceUrl = absoluteUrl(item.url || item.modelInfo?.modelUrl, provider.baseUrl)
      if (!title || !sourceUrl) continue
      const types = item.modelInfo?.types || {}
      const signals = [types.pbr ? 'PBR' : null, types.rigged ? 'Rigged' : null, types.lowPoly ? 'Low poly' : null, types.animated ? 'Animated' : null, types.printReady ? 'Print ready' : null].filter(Boolean)
      const descriptionHtml = String(item.description || '')
      const descriptionText = clean(cheerio.load(descriptionHtml).text())
      const candidate = decorateResult({
        id: `${provider.id}:${item.id || Buffer.from(sourceUrl).toString('base64url').slice(0,20)}`,
        title, source: provider.name, sourceId: provider.id, sourceType: provider.type, sourceUrl,
        imageUrl: item.primaryImage?.gridUrl || item.primaryImage?.gridFallbackUrl || item.schemaImageUrl || null,
        formats: Array.isArray(item.metaverseFormatsList) ? [...new Set(item.metaverseFormatsList.map(format => String(format?.name || '').replace(/^\./,'').toUpperCase()).filter(Boolean))].slice(0,12) : [],
        price: Number(item.price || 0), isFree: Number(item.price || 0) === 0, downloadable: null, downloadUrl: null,
        author: null, description: clean(`${descriptionText} ${signals.join(' ')}`).slice(0,520) || null, fileSize: null,
        score: scoreText(`${title} ${descriptionText}`, query) + 4,
      }, provider)
      if (candidate) { merged.push(candidate); added += 1 }
      if (merged.length >= limit) break
    }
    if (listings.length === 0 || added === 0) break
  }
  return { results: dedupe(merged).slice(0, limit), pagesFetched }
}

async function searchHtmlProvider(provider, query, limit) {
  const queue = [provider.buildUrl(query)], visited = new Set(), merged = []
  let pagesFetched = 0
  while (queue.length && visited.size < MAX_HTML_PAGES && merged.length < limit) {
    const url = queue.shift()
    if (!url || visited.has(url)) continue
    visited.add(url)
    const { html, finalUrl } = await fetchHtml(url, 12000)
    pagesFetched += 1
    merged.push(...extractHtmlResults(provider, query, limit, html))
    if (provider.pagination !== false) {
      for (const nextUrl of paginationUrls(html, finalUrl, provider)) if (!visited.has(nextUrl) && !queue.includes(nextUrl)) queue.push(nextUrl)
    }
  }
  return { results: dedupe(merged).slice(0, limit), pagesFetched }
}

async function searchCollectionProvider(provider, query, limit) {
  const urls = [provider.collectionUrl, ...(provider.extraCollectionUrls || [])].filter(Boolean)
  if (provider.id === 'open3dlab') {
    const carCollection = 'https://open3dlab.com/list/0a696900-05a3-4394-a0cc-0a964e5fec89/'
    for (let page = 2; page <= 10; page += 1) urls.push(`${carCollection}?page=${page}`)
  }
  const documents = await Promise.allSettled([...new Set(urls)].map(url => collectionLimiter(() => fetchHtml(url, 12000))))
  const merged = []
  let pagesFetched = 0
  for (const document of documents) if (document.status === 'fulfilled') { pagesFetched += 1; merged.push(...extractHtmlResults(provider, query, limit, document.value.html)) }
  return { results: dedupe(merged).slice(0, limit), pagesFetched }
}

async function searchProvider(provider, query, limit) {
  const started = Date.now()
  try {
    const payload = provider.adapter === 'vertex'
      ? await searchVertex(provider, query, limit)
      : provider.adapter === 'sketchfab'
        ? await searchSketchfab(provider, query, limit)
        : provider.id === 'cgtrader'
          ? await searchCgTrader(provider, query, limit)
          : provider.adapter === 'collection'
            ? await searchCollectionProvider(provider, query, limit)
            : await searchHtmlProvider(provider, query, limit)
    return { provider: provider.id, name: provider.name, status: 'ok', count: payload.results.length, pagesFetched: payload.pagesFetched || 1, searchUrl: provider.buildUrl(query), durationMs: Date.now() - started, results: payload.results }
  } catch (error) {
    return { provider: provider.id, name: provider.name, status: 'error', count: 0, pagesFetched: 0, searchUrl: provider.buildUrl(query), durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Unknown error', results: [] }
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
  const perSource = Math.max(1, Math.min(Number(options.perSource || 40), 80))
  const sources = await Promise.all(providers.map(provider => limiter(() => searchProvider(provider, query, perSource))))
  const results = dedupe(sources.flatMap(source => source.results))
  return { query, total: results.length, providerCount: providers.length, searchedProviders: sources.length, successfulProviders: sources.filter(x => x.status === 'ok').length, automotiveOnly: true, results, sources: sources.map(({ results: _results, ...source }) => source) }
}
