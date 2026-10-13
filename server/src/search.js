import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { providers } from './providers.js'
import { prepareResults, relevanceScore } from './search-core.js'
import { searchFetch as fetch, searchCheckpoint, searchPageLimit, searchContext } from './search-context.js'
import { crawlCatalog, sameCatalogHost } from './catalog-crawler.js'

const limiter = pLimit(Number(process.env.SEARCH_CONCURRENCY || 5))
const collectionLimiter = pLimit(3)
const USER_AGENT = 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)'
const MAX_HTML_PAGES = Math.max(1, Math.min(Number(process.env.MAX_PROVIDER_PAGES || 5), 10))
const MAX_VERTEX_PAGES = Math.max(1, Math.min(Number(process.env.MAX_VERTEX_PAGES || 8), 20))
const FORMAT_RE = /\b(blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|step|stp|dwg|dxf|unitypackage|kn5|dds|png|jpg|jpeg|textures|zip|rar|7z)\b/gi
const PRICE_RE = /(?:US\$|R\$|\$|€|£)\s?\d+(?:[.,]\d{1,2})?|\b(?:free|grátis|gratis)\b/i
const FILE_SIZE_RE = /\b\d+(?:[.,]\d+)?\s?(?:KB|MB|GB|TB)\b/i
const DIRECT_FILE_RE = /\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|kn5|skp)(?:$|[?#])/i
const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/

const VEHICLE_ONLY_PROVIDERS = new Set([
  '3drush', 'brasil-simulator-mods', 'assettomods', 'assettohub', 'ets2lt', 'vosan',
  'done3d', 'free3dio', 'vertex-warehouse', '3d-models-destination', 'mediafire-rr3', 'open3dlab', 'vk-3d-car-models'
])

const BRANDS = [
  'Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Caterham','Chery','Chevrolet','Chrysler','Citroen','Cupra','Dacia','Daihatsu','Dodge','Ferrari','Fiat','Ford','Funco Motorsports','Genesis','Geely','GMC','Honda','Holden','Hummer','Hyundai','Infiniti','Isuzu','Jaguar','Jeep','Kia','Koenigsegg','Lada','Lamborghini','Lancia','Land Rover','Lexus','Lincoln','Lotus','Lucid','Mahindra','Maserati','Mazda','McLaren','Mercedes','Mercedes-Benz','Mercury','MG','Mini','Mitsubishi','Nio','Nissan','Oldsmobile','Opel','Pagani','Peugeot','Plymouth','Polestar','Pontiac','Porsche','Proton','Ram','Renault','Rimac','Rivian','Rolls-Royce','Rover','Saab','Saturn','Scion','Seat','Skoda','Smart','Subaru','Suzuki','Tata','Tesla','Toyota','Vauxhall','Volkswagen','Volvo','Wuling','Zeekr',
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
  ['Gran Turismo 7',['gran turismo 7','gt7']],
  ['Gran Turismo Sport',['gran turismo sport','gtsport']],
  ['Assetto Corsa Competizione',['assetto corsa competizione','acc']],
  ['Assetto Corsa',['assetto corsa']],
  ['CarX Drift Racing 2',['carx drift racing 2','cxdr 2']],
  ['CarX Street',['carx street']],
  ['CSR Racing 2',['csr racing 2','csr2']],
  ['CSR Racing 3',['csr racing 3','csr3']],
  ['Real Racing 3',['real racing 3','rr3']],
  ['Asphalt 9: Legends',['asphalt 9 legends','asphalt 9: legends']],
  ['Asphalt 8 Airborne',['asphalt 8 airborne','asphalt 8']],
  ['Asphalt Xtreme',['asphalt xtreme']],
  ['CarX Drift Racing',['carx drift racing']],
  ['Assoluto Racing',['assoluto racing']],
  ['Drift Max Pro',['drift max pro']],
  ['F1 Mobile Racing',['f1 mobile racing']],
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
let vertexActionCache = { id: null, expiresAt: 0 }

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
  const match = clean(text).replace(/royalty[\s-]?free/gi, '').match(PRICE_RE)
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
  const hasStrongNegative = negatives >= 2 && !brand && !titleVehicleTerms.length
  const automotive = dedicated ? !hasStrongNegative : Boolean(brand || titleVehicleTerms.length) && !hasStrongNegative
  return { automotive, brand, year: inferYear(titleText), vehicleClass: inferVehicleClass(fullText, provider.id), autoSignalScore: (dedicated ? 2 : 0) + (brand ? 4 : 0) + titleVehicleTerms.length * 2 + Math.min(fullVehicleTerms.length, 3) - negatives * 2 }
}

export function decorateResult(result, provider) {
  const meta = automotiveMeta(result.title, result.description, provider)
  if (!meta.automotive) return null
  return {
    ...result,
    brand: result.brand || meta.brand,
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
  return clean(heading || aria || anchor.find('img').attr('alt') || anchor.text())
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

export function extractHtmlResults(provider, query, limit, html) {
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
    if (!candidate || !relevanceScore(candidate, query)) return
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
      if (candidate && relevanceScore(candidate, query)) { results.push(candidate); seen.add(sourceUrl) }
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
    if (Array.isArray(items)) {
      const itemsPerPage = Number(payload.match(/"itemsPerPage":(\d+)/)?.[1] || items.length || 11)
      return { items, itemsPerPage, hasNext: /"isNextPage":true/.test(payload) }
    }
  }
  return { items: [], itemsPerPage: 11, hasNext: false }
}

async function discoverVertexActionId(html, pageUrl) {
  if (vertexActionCache.id && Date.now() < vertexActionCache.expiresAt) return vertexActionCache.id
  const $ = cheerio.load(html)
  const scriptUrls = $('script[src]').map((_, element) => absoluteUrl($(element).attr('src'), pageUrl)).get().filter(Boolean)
  const scriptUrl = scriptUrls.find(url => /\/search\/page-[^/]+\.js(?:$|\?)/.test(url))
  if (!scriptUrl) return null
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 9000)
  try {
    const response = await fetch(scriptUrl, { signal: controller.signal, headers: { 'user-agent': USER_AGENT, accept: 'application/javascript,*/*' } })
    if (!response.ok) return null
    const js = await response.text()
    const exportMatch = js.match(/Qx:function\(\)\{return ([A-Za-z_$][\w$]*)\}/)
    if (!exportMatch) return null
    const variable = exportMatch[1]
    const assignment = new RegExp(`${escapeRegex(variable)}=\\(0,[A-Za-z_$][\\w$]*\\.\\$\\)\\(\"([a-f0-9]{40})\"\\)`).exec(js)
    const id = assignment?.[1] || null
    if (id) vertexActionCache = { id, expiresAt: Date.now() + 30 * 60 * 1000 }
    return id
  } catch { return null }
  finally { clearTimeout(timer) }
}

function parseVertexActionResponse(text) {
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  for (const line of lines.reverse()) {
    const match = line.match(/^\d+:(\{[\s\S]*\})$/)
    if (!match) continue
    try {
      const payload = JSON.parse(match[1])
      if (Array.isArray(payload?.data)) return payload
    } catch {}
  }
  return null
}

async function callVertexSearchAction(provider, actionId, query, page, itemsPerPage) {
  const url = provider.buildUrl(query)
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000)
  try {
    const response = await fetch(url, {
      method: 'POST', signal: controller.signal, redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/x-component',
        'content-type': 'text/plain;charset=UTF-8',
        'next-action': actionId,
        origin: provider.baseUrl,
        referer: url,
      },
      body: JSON.stringify([query, { page, itemsPerPage }]),
    })
    if (!response.ok) throw new Error(`Vertex action HTTP ${response.status}`)
    return parseVertexActionResponse(await response.text())
  } finally { clearTimeout(timer) }
}

function addVertexItems(provider, query, items, merged, seen, limit) {
  let added = 0
  for (const item of items || []) {
    if (!item?.id || seen.has(item.id)) continue
    seen.add(item.id)
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
    if (candidate) { merged.push(candidate); added += 1 }
    if (merged.length >= limit) break
  }
  return added
}

async function searchVertex(provider, query, limit) {
  const merged = [], seen = new Set()
  const firstUrl = provider.buildUrl(query)
  const first = await fetchHtml(firstUrl, 12000)
  const parsed = parseVertexPage(first.html)
  let pagesFetched = 1
  addVertexItems(provider, query, parsed.items, merged, seen, limit)
  let hasNext = parsed.hasNext
  if (!hasNext || merged.length >= limit) return { results: dedupe(merged).slice(0, limit), pagesFetched }

  const actionId = await discoverVertexActionId(first.html, first.finalUrl)
  if (!actionId) return { results: dedupe(merged).slice(0, limit), pagesFetched }

  for (let page = 2; page <= MAX_VERTEX_PAGES && hasNext && merged.length < limit; page += 1) {
    const payload = await callVertexSearchAction(provider, actionId, query, page, parsed.itemsPerPage)
    if (!payload) break
    pagesFetched += 1
    const added = addVertexItems(provider, query, payload.data, merged, seen, limit)
    hasNext = Boolean(payload.isNextPage)
    if (!added) break
  }
  return { results: dedupe(merged).slice(0, limit), pagesFetched }
}

export async function searchSketchfab(provider, query, limit) {
  const first = new URL('https://api.sketchfab.com/v3/search')
  first.searchParams.set('type','models');first.searchParams.set('q',query);first.searchParams.set('sort_by','-relevance');first.searchParams.set('count','24')
  let next=first.href,pagesFetched=0
  const visited=new Set(),items=[]
  while(next&&!visited.has(next)&&pagesFetched<searchPageLimit()&&items.length<limit){
    if(!sameCatalogHost(next,first.href))throw new Error('Invalid Sketchfab pagination URL')
    visited.add(next)
    const response=await fetch(next,{signal:AbortSignal.timeout(10000),headers:{'user-agent':USER_AGENT}})
    if(!response.ok)throw new Error('HTTP '+response.status)
    const data=await response.json()
    if(!Array.isArray(data.results))throw new Error('Invalid Sketchfab search response')
    pagesFetched++
    for(const model of data.results){
      const result=decorateResult({id:'sketchfab:'+model.uid,title:clean(model.name),source:provider.name,sourceId:provider.id,sourceType:provider.type,
        sourceUrl:model.viewerUrl||'https://sketchfab.com/3d-models/'+model.uid,imageUrl:model.thumbnails?.images?.slice().sort((a,b)=>(b.width||0)-(a.width||0))[0]?.url||null,
        formats:model.isDownloadable?['GLTF']:[],price:model.price??null,isFree:model.price===0?true:model.isDownloadable&&model.license?.slug?.startsWith('cc')?true:null,
        downloadable:typeof model.isDownloadable==='boolean'?model.isDownloadable:null,downloadUrl:null,author:model.user?.displayName||model.user?.username||null,
        description:clean(model.description).slice(0,800)||null,license:model.license?.label||null,fileSize:null,score:0},provider)
      if(result&&relevanceScore(result,query))items.push(result)
    }
    next=data.next?new URL(data.next,first.href).href:null
    searchCheckpoint({results:items,pagesFetched,hasMore:Boolean(next),sections:[first.href]})
  }
  const hasMore=Boolean(next)||items.length>limit
  return {results:prepareResults(items,query,provider,limit),pagesFetched,hasMore,sections:[first.href],stopReason:hasMore?items.length>=limit?'result-limit':'page-limit':'exhausted'}
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
  return crawlCatalog({ seeds:[provider.buildUrl(query),...(provider.catalogUrls||[])],query,limit,provider,
    parse:html=>extractHtmlResults(provider,query,Number.MAX_SAFE_INTEGER,html),
  })
}

async function searchCollectionProvider(provider, query, limit) {
  const seeds=[provider.buildUrl(query),provider.collectionUrl,...(provider.extraCollectionUrls||[])].filter(Boolean)
  return crawlCatalog({seeds,query,limit,provider,parse:html=>extractHtmlResults(provider,query,Number.MAX_SAFE_INTEGER,html)})
}

export async function searchProvider(provider, query, limit) {
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
    const results = prepareResults(payload.results, query, provider, limit)
    if(provider.id==='vk-3d-car-models'&&!results.length)return {provider:provider.id,name:provider.name,status:'error',count:0,pagesFetched:payload.pagesFetched,searchUrl:provider.buildUrl(query),durationMs:Date.now()-started,error:'A comunidade não expõe um catálogo pesquisável ao leitor atual; a cobertura precisa de integração própria.',results:[],stopReason:'unsupported-catalog'}
    return { ...payload, provider: provider.id, name: provider.name, status: payload.error ? 'error' : 'ok', count: results.length, pagesFetched: payload.pagesFetched ?? 1, searchUrl: provider.buildUrl(query), durationMs: Date.now() - started, results }
  } catch (error) {
    const progress = searchContext()?.progress || {}
    const results = prepareResults(progress.results, query, provider, limit)
    return { ...progress, provider: provider.id, name: provider.name, status: 'error', count: results.length, pagesFetched: progress.pagesFetched || 0, searchUrl: provider.buildUrl(query), durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'Unknown error', results }
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
  const excluded = new Set(Array.isArray(options.excludeIds) ? options.excludeIds : [])
  const selectedProviders = providers.filter(provider => !excluded.has(provider.id))
  const onSource = typeof options.onSource === 'function' ? options.onSource : null
  const tasks = selectedProviders.map(provider => limiter(async () => {
    const source = await searchProvider(provider, query, perSource)
    if (onSource) {
      try { await onSource(source) } catch {}
    }
    return source
  }))
  const sources = await Promise.all(tasks)
  const results = dedupe(sources.flatMap(source => source.results))
  return {
    query,
    total: results.length,
    providerCount: providers.length,
    searchedProviders: sources.length,
    successfulProviders: sources.filter(x => x.status === 'ok').length,
    automotiveOnly: true,
    results,
    sources: sources.map(({ results: _results, ...source }) => source),
  }
}
