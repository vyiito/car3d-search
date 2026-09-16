import { searchReferencePack as searchLegacyReferencePack, buildReferenceZip as buildLegacyReferenceZip } from './reference-adapter.js'

const YEAR_RE = /\b(?:19[3-9]\d|20[0-3]\d)\b/g
const LISTING_SUFFIX_RE = /\s*[-–—]\s*(?:lm|lms|hq|hd|lod\d*|pack|asset|mod|render|converted|conversion|rip|ripped)\s*$/i
const GAME_RE = /\b(?:forza(?: horizon)?\s*\d*|forza motorsport|assetto corsa(?: competizione)?|gran turismo(?: sport|\s*\d+)?|csr racing\s*\d*|real racing\s*\d*|carx(?: drift racing| street)?|beamng(?:\.drive)?|need for speed(?: heat| unbound| no limits| mobile)?|gta\s*(?:iv|v|4|5)|euro truck simulator\s*2|american truck simulator)\b/gi
const FORMAT_RE = /\b(?:fbx|obj|blend|blender|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|kn5|dds|textures?|pbr|low[- ]?poly|high[- ]?poly|game[- ]?ready)\b/gi
const MARKET_RE = /\b(?:3d\s*model|asset|download|free|premium|converted|conversion|ripped|rip|extract(?:ed)?|port(?:ed)?|addon|add-on|version|pack|render)\b/gi
const GENERIC_WORDS = new Set(['car','vehicle','automobile','model','3d','sedan','coupe','hatchback','wagon','suv','truck','pickup','van','render','roadster','convertible'])
const MULTIWORD_BRANDS = [
  'alfa romeo','aston martin','land rover','range rover','mercedes benz','mercedes-benz','rolls royce','rolls-royce',
  'great wall','hong qi','funco motorsports','general motors','de tomaso','pagani automobili','polestar automotive',
]
const KNOWN_BRANDS = [
  'abarth','acura','alfa romeo','alpine','aston martin','audi','bentley','bmw','bugatti','buick','byd','cadillac','chevrolet','chrysler','citroen','dacia','daewoo','daihatsu','dodge','ferrari','fiat','ford','genesis','gmc','honda','hummer','hyundai','infiniti','isuzu','jaguar','jeep','kia','koenigsegg','lada','lamborghini','lancia','land rover','lexus','lincoln','lotus','lucid','maserati','maybach','mazda','mclaren','mercedes benz','mercedes-benz','mercury','mini','mitsubishi','nissan','opel','pagani','peugeot','plymouth','polestar','pontiac','porsche','proton','ram','renault','rimac','rolls royce','rolls-royce','saab','saturn','scion','seat','skoda','smart','subaru','suzuki','tesla','toyota','volkswagen','volvo','zenvo','funco motorsports','rezvani','donkervoort','koenigsegg','tvr','vinfast','nio','geely','chery','great wall','haval','hongqi','saic','mg','rover','morgan','caterham','lotus','saleen','ssc','wiesmann','spyker','vector','de tomaso','iveco','man','scania','daf','mack','kenworth','peterbilt'
]

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[‐‑‒–—]/g, '-').replace(/[^a-z0-9-]+/g, ' ').replace(/\s+/g, ' ').trim()
const tokenise = value => norm(value).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []
const uniq = values => [...new Set(values.filter(Boolean))]

function cleanAssetTitle(title) {
  return clean(title)
    .replace(LISTING_SUFFIX_RE, ' ')
    .replace(/\([^)]*(?:3d\s*model|fbx|obj|blend|stl|3ds|max|c4d|game|mod|forza|assetto|gran turismo|download|\b\d{5,}\b)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(?:fbx|obj|blend|stl|game|mod|forza|assetto|gran turismo|csr|carx|download|\b\d{5,}\b)[^\]]*\]/gi, ' ')
    .replace(/\(\s*\d{5,}\s*\)/g, ' ')
    .replace(GAME_RE, ' ')
    .replace(FORMAT_RE, ' ')
    .replace(MARKET_RE, ' ')
    .replace(/(?:US\$|R\$|\$|€|£)\s*\d+(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/\b(?:IE[- ]?)?\d{1,3}%\b/gi, ' ')
    .replace(/[|_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferBrand(noYearTitle, suppliedBrand) {
  if (clean(suppliedBrand)) return { value: clean(suppliedBrand), source: 'metadata' }
  const text = norm(noYearTitle)
  const multi = MULTIWORD_BRANDS.find(brand => text === brand || text.startsWith(`${brand} `))
  if (multi) return { value: noYearTitle.slice(0, multi.length), source: 'inferred' }
  const known = KNOWN_BRANDS.find(brand => text === brand || text.startsWith(`${brand} `))
  if (known) return { value: noYearTitle.split(/\s+/).slice(0, known.split(/\s+/).length).join(' '), source: 'inferred' }
  const first = clean(noYearTitle).split(/\s+/)[0] || ''
  return { value: first, source: first ? 'heuristic' : 'unknown' }
}

function generationCodes(tokens) {
  return uniq(tokens.filter(token => {
    if (/^mk(?:i{1,4}|v|vi{0,3}|\d+)$/i.test(token)) return true
    if (/^[a-z]{1,4}\d{1,4}[a-z]?$/i.test(token)) return true
    if (/^\d{3}$/i.test(token)) return true
    return false
  }))
}

function strongModelTokens(modelTokens) {
  return modelTokens.filter(token => !GENERIC_WORDS.has(token)).filter(token => token.length > 1 || /^\d{2,}$/.test(token))
}

export function canonicalizeVehicleIdentity(asset = {}) {
  const cleaned = cleanAssetTitle(asset.title)
  const year = Number(asset.year) || Number(cleaned.match(YEAR_RE)?.[0]) || null
  const noYearTitle = clean(cleaned.replace(YEAR_RE, ' '))
  const inferredBrand = inferBrand(noYearTitle, asset.brand)
  let brand = clean(inferredBrand.value)
  let modelText = noYearTitle
  if (brand && norm(modelText).startsWith(`${norm(brand)} `)) modelText = clean(modelText.slice(brand.length))
  else if (brand && norm(modelText) === norm(brand)) modelText = ''

  const modelTokens = strongModelTokens(tokenise(modelText))
  const primary = modelTokens[0] || null
  const supporting = modelTokens.slice(1, 5)
  const codes = generationCodes(modelTokens)
  const modelDisplay = clean(modelText.split(/\s+/).slice(0, 6).join(' '))
  const display = clean([brand, modelDisplay].filter(Boolean).join(' ')) || noYearTitle
  const canonical = clean([year || '', display].filter(Boolean).join(' '))

  return {
    brand: brand || null,
    brandSource: inferredBrand.source,
    year,
    display,
    canonical,
    modelDisplay,
    primaryModel: primary,
    supporting,
    generationCodes: codes,
    sourceTitle: clean(asset.title),
  }
}

function brandConflict(identity, text) {
  if (!identity.brand) return false
  const normalized = norm(text)
  const wanted = norm(identity.brand)
  if (normalized.includes(wanted)) return false
  const found = KNOWN_BRANDS.find(brand => normalized.includes(brand) && brand !== wanted)
  return Boolean(found)
}

function samePrefixGenerationConflict(wantedCodes, evidenceTokens) {
  if (!wantedCodes.length) return false
  const evidenceCodes = generationCodes(evidenceTokens)
  for (const wanted of wantedCodes) {
    const match = wanted.match(/^([a-z]+)(\d+)/i)
    if (!match) continue
    const prefix = match[1].toLowerCase()
    const rivals = evidenceCodes.filter(code => code.toLowerCase() !== wanted.toLowerCase() && code.toLowerCase().startsWith(prefix))
    if (rivals.length && !evidenceCodes.some(code => code.toLowerCase() === wanted.toLowerCase())) return true
  }
  return false
}

function anchorMatches(primary, normalizedEvidence) {
  if (!primary) return false
  const direct = norm(primary)
  if (normalizedEvidence.includes(direct)) return true
  const parts = direct.split('-').filter(Boolean)
  return parts.length > 1 && parts.every(part => new RegExp(`\\b${part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalizedEvidence))
}

export function scoreReferenceIdentity(identity, image) {
  const evidence = clean(`${image?.title || ''} ${image?.sourcePage || ''} ${image?.source || ''}`)
  const normalized = norm(evidence)
  if (!identity.primaryModel || !anchorMatches(identity.primaryModel, normalized)) return { ok: false, score: 0, reason: 'model-mismatch' }
  if (brandConflict(identity, normalized)) return { ok: false, score: 0, reason: 'brand-conflict' }
  if (samePrefixGenerationConflict(identity.generationCodes, tokenise(normalized))) return { ok: false, score: 0, reason: 'generation-conflict' }

  let score = 5
  if (identity.brand && normalized.includes(norm(identity.brand))) score += 3
  const supportingHits = identity.supporting.filter(token => anchorMatches(token, normalized)).length
  score += Math.min(3, supportingHits)
  const codeHits = identity.generationCodes.filter(code => anchorMatches(code, normalized)).length
  score += codeHits * 2

  const years = [...normalized.matchAll(/\b(19[3-9]\d|20[0-3]\d)\b/g)].map(match => Number(match[1]))
  if (identity.year && years.some(value => Math.abs(value - identity.year) <= 1)) score += 2

  return { ok: score >= 5, score, reason: 'matched' }
}

function cleanWebLinks(display) {
  const query = encodeURIComponent(display)
  return [
    { id: 'google', label: 'GOOGLE IMAGES', url: `https://www.google.com/search?tbm=isch&q=${query}` },
    { id: 'bing', label: 'BING IMAGES', url: `https://www.bing.com/images/search?q=${query}` },
    { id: 'commons', label: 'WIKIMEDIA COMMONS', url: `https://commons.wikimedia.org/w/index.php?search=${query}&title=Special:MediaSearch&type=image` },
  ]
}

function filterPack(pack, identity) {
  const images = (pack.images || [])
    .map(image => ({ image, match: scoreReferenceIdentity(identity, image) }))
    .filter(row => row.match.ok)
    .sort((a, b) => (b.match.score - a.match.score) || ((b.image.identityScore || 0) - (a.image.identityScore || 0)))
    .map(row => ({ ...row.image, identityScore: Math.max(row.image.identityScore || 0, row.match.score), identityEngine: 'generic-v2' }))

  return {
    ...pack,
    canonicalVehicle: identity.display,
    query: identity.canonical,
    images,
    downloadableCount: images.filter(image => image.downloadAllowed).length,
    angleCoverage: uniq(images.map(image => image.angle).filter(Boolean)),
    webSearch: cleanWebLinks(identity.display),
    identity: {
      brand: identity.brand,
      brandSource: identity.brandSource,
      model: identity.modelDisplay,
      year: identity.year,
      generationCodes: identity.generationCodes,
      engine: 'generic-v2',
    },
  }
}

export async function searchReferencePack(asset, options = {}) {
  const identity = canonicalizeVehicleIdentity(asset)
  const candidates = uniq([
    identity.canonical,
    identity.display,
    clean([identity.brand, identity.primaryModel].filter(Boolean).join(' ')),
  ]).filter(value => value.length >= 2)

  let best = null
  for (let index = 0; index < candidates.length; index += 1) {
    const title = candidates[index]
    const pack = await searchLegacyReferencePack({
      title,
      brand: identity.brand,
      year: index === 0 ? identity.year : null,
    }, options)
    const filtered = filterPack(pack, identity)
    if (!best || filtered.images.length > best.images.length || (filtered.images.length === best.images.length && filtered.angleCoverage.length > best.angleCoverage.length)) best = filtered
    if (filtered.images.length >= 8 && filtered.angleCoverage.length >= 4) break
  }

  if (best) return best
  const fallback = await searchLegacyReferencePack({ title: identity.display || asset.title, brand: identity.brand, year: identity.year }, options)
  return filterPack(fallback, identity)
}

export const buildReferenceZip = buildLegacyReferenceZip
