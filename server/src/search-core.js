// Shared by the API and UI so matching, identities and facets agree.
export function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bmercedes(?:[\s-]+benz)?\b/g, 'mercedes')
    .replace(/\bvw\b/g, 'volkswagen')
    .replace(/\bmk[\s-]*(iv|v|vi|iii|ii)\b/g, (_, roman) => `mk${({ ii: 2, iii: 3, iv: 4, v: 5, vi: 6 })[roman]}`)
    .replace(/\bmk[\s-]+(\d+)\b/g, 'mk$1')
    .replace(/\b(gt)[\s-]+r\b/g, '$1r')
    .replace(/\b(rx|mx|e|f|r|w|fk|fd|gc)[\s-]+(\d+[a-z]*)\b/g, '$1$2')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

const GAME_ALIASES = new Map([
  ['ac', 'Assetto Corsa'], ['assetto corsa', 'Assetto Corsa'],
  ['acc', 'Assetto Corsa Competizione'], ['assetto corsa competizione', 'Assetto Corsa Competizione'],
  ['fh4', 'Forza Horizon 4'], ['fh5', 'Forza Horizon 5'], ['fh6', 'Forza Horizon 6'],
  ['forza horizon 4', 'Forza Horizon 4'], ['forza horizon 5', 'Forza Horizon 5'], ['forza horizon 6', 'Forza Horizon 6'],
  ['forza motorsport', 'Forza Motorsport'], ['forza horizon', 'Forza Horizon'],
  ['nfs', 'Need for Speed'], ['need for speed', 'Need for Speed'],
  ['nfs heat', 'Need for Speed Heat'], ['need for speed heat', 'Need for Speed Heat'],
  ['nfs unbound', 'Need for Speed Unbound'], ['need for speed unbound', 'Need for Speed Unbound'],
  ['nfs no limits', 'Need for Speed No Limits'], ['need for speed no limits', 'Need for Speed No Limits'],
  ['need for speed mobile', 'Need for Speed Mobile'],
  ['beamng', 'BeamNG.drive'], ['beamng drive', 'BeamNG.drive'],
  ['ets2', 'Euro Truck Simulator 2'], ['euro truck simulator 2', 'Euro Truck Simulator 2'],
  ['ats', 'American Truck Simulator'], ['american truck simulator', 'American Truck Simulator'],
  ['rr3', 'Real Racing 3'], ['real racing 3', 'Real Racing 3'],
  ['csr2', 'CSR Racing 2'], ['csr racing 2', 'CSR Racing 2'],
  ['csr3', 'CSR Racing 3'], ['csr racing 3', 'CSR Racing 3'],
  ['gta', 'GTA'], ['gta 5', 'GTA V'], ['gta v', 'GTA V'], ['grand theft auto v', 'GTA V'],
  ['gta 4', 'GTA IV'], ['gta iv', 'GTA IV'], ['grand theft auto iv', 'GTA IV'],
  ['ams2', 'Automobilista 2'], ['automobilista 2', 'Automobilista 2'],
  ['rf2', 'rFactor 2'], ['rfactor 2', 'rFactor 2'],
  ['carx drift racing 2', 'CarX Drift Racing 2'], ['carx drift racing', 'CarX Drift Racing'],
  ['carx street', 'CarX Street'],
  ['asphalt 9 legends', 'Asphalt 9: Legends'], ['asphalt 8 airborne', 'Asphalt 8 Airborne'],
  ['asphalt xtreme', 'Asphalt Xtreme'], ['assoluto racing', 'Assoluto Racing'],
  ['drift max pro', 'Drift Max Pro'], ['f1 mobile racing', 'F1 Mobile Racing'],
])

export function canonicalGame(value) {
  const text = String(value || '').trim()
  return GAME_ALIASES.get(normalizeText(text)) || text
}
export const isKnownGameQuery = value => GAME_ALIASES.has(normalizeText(value))

export function matchesGame(actual, selected) {
  const game = normalizeText(canonicalGame(actual)), filter = normalizeText(canonicalGame(selected))
  if (!game || !filter) return false
  if (game === filter) return true
  return ['need for speed', 'gta', 'forza horizon', 'forza motorsport'].includes(filter) && game.startsWith(`${filter} `)
}

export function normalizeFormats(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value).trim().replace(/^\./, '').toUpperCase()).filter(Boolean))]
}

export function marketKind(result) {
  // An explicit positive price takes precedence over contradictory flags.
  if (typeof result.price === 'number' && Number.isFinite(result.price)) return result.price > 0 ? 'paid' : result.price === 0 ? 'free' : 'unknown'
  return result.isFree === true ? 'free' : result.isFree === false ? 'paid' : 'unknown'
}

export function formatPrice(result) {
  const kind = marketKind(result)
  if (kind === 'free') return 'GRÁTIS'
  if (result.priceLabel) return result.priceLabel
  if (typeof result.price === 'number' && result.price > 0) return `$${result.price.toFixed(result.price % 1 ? 2 : 0)}`
  return kind === 'paid' ? 'PAGO · VER PREÇO' : 'PREÇO NA FONTE'
}

export function resultKey(result) {
  try {
    const url = new URL(result.sourceUrl)
    url.hash = ''
    for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key)
    return `${result.sourceId}:${url.href}`
  } catch { return `${result.sourceId}:${result.sourceUrl}` }
}

const QUERY_NOISE = new Set(['3d', 'model', 'models', 'modelo', 'modelos', 'download', 'free', 'gratis', 'car', 'cars', 'carro', 'carros', 'vehicle', 'vehicles', 'veiculo', 'veiculos'])
const CATEGORY_TITLE = /^(?:car mods?|cars?|vehicles?|3d models?|downloads?|search results?|models?|gallery|bmw|toyota|nissan|honda|porsche)$/
const PART_TITLE = /^(?:(?:car|vehicle)\s+)?(?:wheel|wheels|tire|tires|tyre|tyres|rim|rims|engine|steering wheel|bumper)\b/
const PART_PHRASE = /\b(?:tail lights?|headlights?|gear selector|gear shift|steering wheel|wing mirrors?|brake discs?|engine block|body kit|bodykit|wheels?|rims?|grille|panel set)\b/
const ACCESSORY_PHRASE = /\b(?:neon sign|keychain|keyring|cookie cutter|poster|logo|emblem)\b/

export function relevanceScore(result, query) {
  const vehicleIdentity = value => {
    let text = normalizeText(value)
    if (/\bsupra\b/.test(text)) text = text.replace(/\b(?:mk4|jza80)\b/g, 'a80').replace(/\b(?:mk5|jza90)\b/g, 'a90')
    if (/\b(?:skyline|gtr)\b/.test(text)) text = text.replace(/\bbnr(32|33|34)\b/g, 'r$1')
    return text
  }
  const title = vehicleIdentity(result.title)
  const fullQuery = vehicleIdentity(query)
  const tokens = fullQuery.split(' ').filter(token => token && !QUERY_NOISE.has(token))
  if (!title || (!result.isModelListing && CATEGORY_TITLE.test(title))) return 0
  if (PART_TITLE.test(title) && !PART_TITLE.test(fullQuery)) return 0
  if (PART_PHRASE.test(title) && !PART_PHRASE.test(fullQuery)) return 0
  if (ACCESSORY_PHRASE.test(title) && !ACCESSORY_PHRASE.test(fullQuery)) return 0
  if (!tokens.length) return 1
  const gameQuery = GAME_ALIASES.has(fullQuery)
  if (gameQuery && matchesGame(result.game, canonicalGame(query))) return 20
  const tags = result.isModelListing && Array.isArray(result.tags) ? result.tags.join(' ') : ''
  const identity = new Set(vehicleIdentity(`${result.title} ${result.brand || ''} ${canonicalGame(result.game)} ${result.year || ''} ${tags}`).split(' '))
  // Descriptions often contain recommendations or entire catalogues. They
  // cannot establish which model/generation the listing actually represents.
  if (!tokens.every(token => identity.has(token))) {
    const included = Array.isArray(result.includedVehicles) ? result.includedVehicles : []
    if (!included.some(vehicle => { const words = new Set(vehicleIdentity(vehicle).split(' ')); return tokens.every(token => words.has(token)) })) return 0
    return 5
  }
  const titleTokens = new Set(title.split(' '))
  return tokens.reduce((score, token) => score + (titleTokens.has(token) ? 10 : 4), 0) + (title.includes(fullQuery) ? 20 : 0)
}

export function normalizeSearchResult(result, provider = {}) {
  if (!result || !result.title || !result.sourceUrl) return null
  let url
  try { url = new URL(result.sourceUrl); if (!['http:', 'https:'].includes(url.protocol)) return null } catch { return null }
  const price = typeof result.price === 'number' && Number.isFinite(result.price) && result.price >= 0 ? result.price : null
  const next = {
    ...result, sourceId: result.sourceId || provider.id,
    source: result.source || provider.name, sourceType: result.sourceType || provider.type || '3d-models',
    formats: normalizeFormats(result.formats), price,
    isFree: price !== null ? price === 0 : result.isFree ?? null,
    game: canonicalGame(result.game || provider.defaultGame) || null,
    year: Number.isInteger(result.year) && result.year >= 1886 && result.year <= new Date().getFullYear() + 2 ? result.year : null,
    vehicleClass: result.vehicleClass || 'Car', score: Number.isFinite(result.score) ? result.score : 0,
  }
  next.id = resultKey(next)
  return next
}

export function prepareResults(items, query, provider = {}, limit = 80) {
  const results = new Map()
  for (const item of items || []) {
    const result = normalizeSearchResult(item, provider)
    if (!result) continue
    const score = relevanceScore(result, query)
    if (!score) continue
    result.score = score
    const previous = results.get(result.id)
    if (!previous || result.score > previous.score) results.set(result.id, result)
  }
  return [...results.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)).slice(0, limit)
}
