import * as cheerio from 'cheerio'

const BASE = 'https://www.vertex-warehouse.com'
const USER_AGENT = 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)'
const MAX_PAGES = Math.max(1, Math.min(Number(process.env.MAX_VERTEX_PAGES || 20), 30))
const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/
const BRANDS = [
  'Funco Motorsports','Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Caterham','Chevrolet','Chrysler','Citroen','Cupra','Dacia','Daihatsu','Dodge','Ferrari','Fiat','Ford','Genesis','GMC','Honda','Hyundai','Infiniti','Isuzu','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lotus','Maserati','Mazda','McLaren','Mercedes-AMG','Mercedes-Benz','Mercedes','Mini','Mitsubishi','Nissan','Opel','Pagani','Peugeot','Pontiac','Porsche','Ram','Renault','Rimac','Rolls-Royce','Seat','Skoda','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo',
  'DAF','Freightliner','Iveco','Kenworth','Mack','MAN','Peterbilt','Scania','Western Star','Ducati','Harley-Davidson','Kawasaki','KTM','Triumph','Yamaha'
]

let actionCache = { id: null, expiresAt: 0 }

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const slugify = value => norm(value).replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120)

function scoreText(text, query) {
  const source = norm(text)
  const tokens = norm(query).split(/\s+/).filter(token => token.length > 1)
  let score = 0
  for (const token of tokens) if (source.includes(token)) score += 1
  if (source.includes(norm(query))) score += 4
  return score
}

function inferBrand(title) {
  const value = norm(title)
  return BRANDS.sort((a,b) => b.length-a.length).find(brand => new RegExp(`(^|[^a-z0-9])${escapeRegex(norm(brand))}([^a-z0-9]|$)`, 'i').test(value)) || null
}

function inferVehicleClass(text) {
  const value = norm(text)
  if (/motorcycle|motorbike|bike|scooter|moped/.test(value)) return 'Motorcycle'
  if (/truck|pickup|lorry|semi/.test(value)) return 'Truck / Pickup'
  if (/bus|coach|minibus/.test(value)) return 'Bus'
  if (/van|minivan|camper|motorhome/.test(value)) return 'Van'
  if (/tractor|harvester|excavator|forklift/.test(value)) return 'Utility / Tractor'
  if (/gt3|gt4|race|rally|drift|formula|nascar|indycar|dragster|buggy|sandcar/.test(value)) return 'Race Car'
  if (/suv|crossover|4x4|offroad|off-road/.test(value)) return 'SUV'
  return 'Car'
}

function extractFlightStrings(html) {
  const $ = cheerio.load(html)
  const payloads = []
  $('script').each((_, element) => {
    const text = $(element).text().trim()
    if (!text.startsWith('self.__next_f.push(')) return
    const open = text.indexOf('push(')
    const close = text.lastIndexOf(')')
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

function parseInitialPage(html) {
  for (const payload of extractFlightStrings(html)) {
    if (!payload.includes('initialData')) continue
    const items = extractJsonArrayAfter(payload, '"initialData":')
    if (!Array.isArray(items)) continue
    return {
      items,
      itemsPerPage: Number(payload.match(/"itemsPerPage":(\d+)/)?.[1] || items.length || 11),
      hasNext: /"isNextPage":true/.test(payload),
    }
  }
  return { items: [], itemsPerPage: 11, hasNext: false }
}

async function fetchText(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' })
    if (!response.ok) throw new Error(`Vertex HTTP ${response.status}`)
    return { text: await response.text(), finalUrl: response.url || url }
  } finally { clearTimeout(timer) }
}

async function discoverActionId(html, pageUrl) {
  if (actionCache.id && Date.now() < actionCache.expiresAt) return actionCache.id
  const $ = cheerio.load(html)
  const scripts = $('script[src]').map((_, element) => {
    try { return new URL($(element).attr('src'), pageUrl).href } catch { return null }
  }).get().filter(Boolean)
  const scriptUrl = scripts.find(url => /\/search\/page-[^/]+\.js(?:$|\?)/.test(url))
  if (!scriptUrl) return null
  const { text: js } = await fetchText(scriptUrl, { headers: { 'user-agent': USER_AGENT, accept: 'application/javascript,*/*' } }, 9000)
  const exportMatch = js.match(/Qx:function\(\)\{return ([A-Za-z_$][\w$]*)\}/)
  if (!exportMatch) return null
  const variable = exportMatch[1]
  const assignment = new RegExp(`${escapeRegex(variable)}=\\(0,[A-Za-z_$][\\w$]*\\.\\$\\)\\(\"([a-f0-9]{40})\"\\)`).exec(js)
  const id = assignment?.[1] || null
  if (id) actionCache = { id, expiresAt: Date.now() + 30 * 60 * 1000 }
  return id
}

function parseActionResponse(text) {
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

async function fetchActionPage(actionId, query, page, itemsPerPage) {
  const url = `${BASE}/search?query=${encodeURIComponent(query)}&type=fts`
  const { text } = await fetchText(url, {
    method: 'POST',
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/x-component',
      'content-type': 'text/plain;charset=UTF-8',
      'next-action': actionId,
      origin: BASE,
      referer: url,
    },
    body: JSON.stringify([query, { page, itemsPerPage }]),
  })
  return parseActionResponse(text)
}

function mapItem(item, query) {
  if (!item?.id || !item?.pages?.key || !item?.name) return null
  const title = clean(item.name)
  const shortId = String(item.id).split('-')[0]
  const game = clean(item.pages?.name) || null
  const tags = Array.isArray(item.tags) ? item.tags.map(clean).filter(Boolean) : []
  const text = `${title} ${tags.join(' ')} ${game || ''}`
  const brand = inferBrand(title)
  return {
    id: `vertex-warehouse:${item.id}`,
    title,
    source: 'Vertex Warehouse',
    sourceId: 'vertex-warehouse',
    sourceType: '3d-models',
    sourceUrl: `${BASE}/models/${encodeURIComponent(item.pages.key)}/${encodeURIComponent(shortId)}/${slugify(title)}`,
    imageUrl: Array.isArray(item.images) ? item.images[0] || null : null,
    formats: Array.isArray(item.formats) ? [...new Set(item.formats.map(value => String(value).toUpperCase()))].slice(0, 12) : [],
    price: 0,
    isFree: true,
    downloadable: true,
    downloadUrl: null,
    author: item.created_by?.username || null,
    description: [game, tags.length ? `Tags: ${tags.join(', ')}` : null].filter(Boolean).join(' · ') || null,
    fileSize: null,
    brand,
    game,
    year: Number(title.match(YEAR_RE)?.[1]) || null,
    vehicleClass: inferVehicleClass(text),
    score: scoreText(text, query) + 8,
  }
}

export async function searchVertexNative(query, limit = 80) {
  const q = clean(query)
  if (q.length < 2) return { results: [], pagesFetched: 0 }
  const firstUrl = `${BASE}/search?query=${encodeURIComponent(q)}&type=fts`
  const first = await fetchText(firstUrl, { headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml', 'accept-language': 'en-US,en;q=0.9' } })
  const parsed = parseInitialPage(first.text)
  const merged = []
  const seen = new Set()
  const add = items => {
    let added = 0
    for (const item of items || []) {
      if (!item?.id || seen.has(item.id)) continue
      seen.add(item.id)
      const result = mapItem(item, q)
      if (result) { merged.push(result); added += 1 }
      if (merged.length >= limit) break
    }
    return added
  }

  add(parsed.items)
  let pagesFetched = 1
  let hasNext = parsed.hasNext
  if (!hasNext || merged.length >= limit) return { results: merged.slice(0, limit), pagesFetched }

  const actionId = await discoverActionId(first.text, first.finalUrl)
  if (!actionId) return { results: merged.slice(0, limit), pagesFetched }
  for (let page = 2; page <= MAX_PAGES && hasNext && merged.length < limit; page += 1) {
    const payload = await fetchActionPage(actionId, q, page, parsed.itemsPerPage)
    if (!payload) break
    pagesFetched += 1
    add(payload.data)
    hasNext = Boolean(payload.isNextPage)
  }
  return { results: merged.slice(0, limit), pagesFetched }
}
