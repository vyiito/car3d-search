import * as cheerio from 'cheerio'

const UA = 'VJ3DSearch/1.2 (+https://github.com/vyiito/car3d-search)'
const BASE = 'https://brasilsimulatormods.com'
const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/

const BRANDS = [
  'Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Chevrolet','Citroen','Dodge','Ferrari','Fiat','Ford','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mercedes','Mini','Mitsubishi','Nissan','Opel','Pagani','Peugeot','Pontiac','Porsche','Renault','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo'
]

const decode = value => cheerio.load(`<div>${String(value || '')}</div>`).text().replace(/\s+/g, ' ').trim()
const strip = value => cheerio.load(String(value || '')).text().replace(/\s+/g, ' ').trim()
const norm = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()

function brandOf(text) {
  const source = norm(text)
  return BRANDS.find(brand => source.includes(norm(brand))) || null
}

function vehicleClass(text) {
  const source = norm(text)
  if (/\b(suv|crossover|4x4|off.?road)\b/.test(source)) return 'SUV'
  if (/\b(drift|race|racing|gt3|gt4|rally|formula)\b/.test(source)) return 'Race Car'
  if (/\b(truck|pickup|pick-up|ute)\b/.test(source)) return 'Truck / Pickup'
  if (/\b(van|minivan|mpv)\b/.test(source)) return 'Van'
  return 'Car'
}

function inferGame(text) {
  const source = norm(text)
  if (/beamng/.test(source)) return 'BeamNG.drive'
  if (/assetto\s*corsa|\bac\b|csp|kunos/.test(source)) return 'Assetto Corsa'
  return null
}

async function getJson(url, timeoutMs = 10000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': UA, accept: 'application/json' } })
    if (!response.ok) {
      const error = new Error(`BSM HTTP ${response.status}`)
      error.status = response.status
      throw error
    }
    return { data: await response.json(), headers: response.headers }
  } finally { clearTimeout(timer) }
}

async function detailFor(item) {
  const endpoint = item?._links?.self?.[0]?.href
  if (!endpoint) return null
  try {
    const { data } = await getJson(`${endpoint}${endpoint.includes('?') ? '&' : '?'}_embed=1`, 9000)
    return data
  } catch { return null }
}

function imageFrom(detail) {
  const embedded = detail?._embedded?.['wp:featuredmedia']?.[0]
  return embedded?.source_url || embedded?.media_details?.sizes?.large?.source_url || embedded?.media_details?.sizes?.medium_large?.source_url || null
}

export async function searchBrasilSimulatorMods(query, limit = 60) {
  const merged = []
  const seen = new Set()
  const perPage = Math.min(20, Math.max(10, limit))
  let pagesFetched = 0
  let totalPages = 1

  for (let page = 1; page <= totalPages && merged.length < limit && page <= 8; page += 1) {
    const url = `${BASE}/wp-json/wp/v2/search?search=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`
    let payload
    try {
      payload = await getJson(url, 12000)
    } catch (error) {
      if (error?.status === 400 && page > 1) break
      throw error
    }
    pagesFetched += 1
    totalPages = Math.min(8, Number(payload.headers.get('x-wp-totalpages') || 1) || 1)
    const rows = Array.isArray(payload.data) ? payload.data.filter(item => item?.subtype === 'vehica_car') : []
    if (!rows.length) continue

    const details = await Promise.allSettled(rows.slice(0, Math.min(rows.length, 12)).map(detailFor))
    const detailById = new Map()
    rows.slice(0, 12).forEach((row, index) => {
      const outcome = details[index]
      if (outcome?.status === 'fulfilled' && outcome.value) detailById.set(row.id, outcome.value)
    })

    for (const item of rows) {
      if (!item?.url || seen.has(item.url)) continue
      seen.add(item.url)
      const detail = detailById.get(item.id)
      const title = decode(item.title || detail?.title?.rendered)
      if (!title) continue
      const description = strip(detail?.content?.rendered || detail?.excerpt?.rendered || '')
      const combined = `${title} ${description}`
      const yearMatch = combined.match(YEAR_RE)
      const game = inferGame(combined)
      merged.push({
        id: `brasil-simulator-mods:${item.id}`,
        title,
        source: 'Brasil Simulator Mods',
        sourceId: 'brasil-simulator-mods',
        sourceType: 'game-mods',
        sourceUrl: item.url,
        imageUrl: imageFrom(detail),
        formats: [],
        price: 0,
        isFree: true,
        downloadable: null,
        downloadUrl: null,
        author: null,
        description: description ? description.slice(0, 520) : null,
        fileSize: null,
        brand: brandOf(title),
        game,
        year: yearMatch ? Number(yearMatch[1]) : null,
        vehicleClass: vehicleClass(combined),
        score: 12,
      })
      if (merged.length >= limit) break
    }
  }

  return { results: merged.slice(0, limit), pagesFetched }
}
