import { searchReferencePack as searchLegacyReferencePack, buildReferenceZip as buildLegacyReferenceZip } from './reference-adapter.js'
import { searchSpecializedReferences, specializedSearchLinks, modelingCoverage } from './reference-specialized.js'

const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/
const LISTING_SUFFIX_RE = /\s*[-–—]\s*(?:lm|lms|hq|hd|lod\d*|pack|asset|mod|render|converted|conversion|rip|ripped)\s*$/i
const GAME_RE = /\b(?:forza(?: horizon)?\s*\d*|forza motorsport|assetto corsa(?: competizione)?|gran turismo(?: sport|\s*\d+)?|csr racing\s*\d*|real racing\s*\d*|carx(?: drift racing| street)?|beamng(?:\.drive)?|need for speed(?: heat| unbound| no limits| mobile)?|gta\s*(?:iv|v|4|5)|euro truck simulator\s*2|american truck simulator)\b/gi
const FORMAT_RE = /\b(?:fbx|obj|blend|blender|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|kn5|dds|textures?|pbr|low[- ]?poly|high[- ]?poly|game[- ]?ready)\b/gi
const MARKET_RE = /\b(?:3d\s*model|asset|download|free|premium|converted|conversion|ripped|rip|extract(?:ed)?|port(?:ed)?|addon|add-on|version|pack|render)\b/gi
const CATALOG_RE = /\b(?:individual cars?|individual vehicles?|car mods?|vehicle mods?|gallery|collection)\b/gi
const SOURCE_RE = /\b(?:vosan|vertex warehouse|3d cad browser|3dexport|renderhub|cgmood|3d-baza|3d baza|roh3d|blendkit|sketchfab|cgtrader)\b/gi
const GENERIC_WORDS = new Set(['car','vehicle','automobile','model','3d','sedan','coupe','hatchback','wagon','suv','truck','pickup','van','render','roadster','convertible','cars','vehicles'])
const MULTIWORD_BRANDS = [
  'alfa romeo','aston martin','land rover','range rover','mercedes benz','mercedes-benz','rolls royce','rolls-royce',
  'great wall','hong qi','funco motorsports','general motors','de tomaso','pagani automobili','polestar automotive',
]
const KNOWN_BRANDS = [
  'abarth','acura','alfa romeo','alpine','aston martin','audi','bentley','bmw','bugatti','buick','byd','cadillac','chevrolet','chrysler','citroen','dacia','daewoo','daihatsu','dodge','ferrari','fiat','ford','genesis','gmc','honda','hummer','hyundai','infiniti','isuzu','jaguar','jeep','kia','koenigsegg','lada','lamborghini','lancia','land rover','lexus','lincoln','lotus','lucid','maserati','maybach','mazda','mclaren','mercedes benz','mercedes-benz','mercury','mini','mitsubishi','nissan','opel','pagani','peugeot','plymouth','polestar','pontiac','porsche','proton','ram','renault','rimac','rolls royce','rolls-royce','saab','saturn','scion','seat','skoda','smart','subaru','suzuki','tesla','toyota','volkswagen','volvo','zenvo','funco motorsports','rezvani','donkervoort','tvr','vinfast','nio','geely','chery','great wall','haval','hongqi','saic','mg','rover','morgan','caterham','saleen','ssc','wiesmann','spyker','vector','de tomaso','iveco','man','scania','daf','mack','kenworth','peterbilt'
]
const NON_REAL_REFERENCE_PATTERNS = [
  /\b(?:lego|lego technic|technic|bricklink|brickset|moc|brick built|brick-built)\b/i,
  /\b(?:toy|toys|die[- ]?cast|diecast|hot wheels|matchbox|miniature|minicar|scale model|model car|model kit|plastic model|slot car)\b/i,
  /\b(?:rc car|radio[- ]controlled|remote[- ]controlled|papercraft|paper model)\b/i,
  /\b(?:3d render|3d rendering|cgi|computer generated|illustration|vector art|drawing|concept art)\b/i,
  /\b(?:game screenshot|in[- ]game|screenshot|forza horizon|forza motorsport|gran turismo|assetto corsa|need for speed|beamng|gta v|gta 5|roblox)\b/i,
]
const MOTORCYCLE_EVIDENCE_RE = /\b(?:motorcycle|motorbike|motor bike|bike|scooter|moped|v[- ]?strom|vstrom|hayabusa|gsx(?:-?r)?\d*|gsx\d+[a-z]*|cbr\d*|yzf[- ]?r?\d*|kawasaki ninja|motor cycle)\b/i
const CAR_BODY_EVIDENCE_RE = /\b(?:suv|sedan|saloon|hatchback|coupe|coupé|wagon|estate|roadster|convertible|cabriolet|minivan|pickup|pick-up|passenger car)\b/i
const HEAVY_VEHICLE_EVIDENCE_RE = /\b(?:semi[- ]?truck|tractor[- ]?trailer|lorry|coach|city bus|school bus)\b/i

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[‐‑‒–—]/g, '-').replace(/[^a-z0-9-]+/g, ' ').replace(/\s+/g, ' ').trim()
const tokenise = value => norm(value).match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || []
const uniq = values => [...new Set(values.filter(Boolean))]
const escapeRe = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function cleanAssetTitle(title) {
  return clean(title)
    .replace(/\s*\|\s*[^|]{1,40}$/g, ' ')
    .replace(LISTING_SUFFIX_RE, ' ')
    .replace(/\([^)]*(?:3d\s*model|fbx|obj|blend|stl|3ds|max|c4d|game|mod|forza|assetto|gran turismo|download|\b\d{5,}\b)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(?:fbx|obj|blend|stl|game|mod|forza|assetto|gran turismo|csr|carx|download|\b\d{5,}\b)[^\]]*\]/gi, ' ')
    .replace(/\(\s*\d{5,}\s*\)/g, ' ')
    .replace(GAME_RE, ' ').replace(FORMAT_RE, ' ').replace(MARKET_RE, ' ').replace(CATALOG_RE, ' ').replace(SOURCE_RE, ' ')
    .replace(/(?:US\$|R\$|\$|€|£)\s*\d+(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/\b(?:IE[- ]?)?\d{1,3}%\b/gi, ' ')
    .replace(/[|_]+/g, ' ').replace(/\s*[-–—]\s*$/g, ' ').replace(/\s+/g, ' ').trim()
}

function phraseWordIndex(text, phrase) {
  const words = clean(text).split(/\s+/).filter(Boolean)
  const normalizedWords = words.map(word => norm(word))
  const phraseWords = tokenise(phrase)
  if (!phraseWords.length) return -1
  for (let index = 0; index <= normalizedWords.length - phraseWords.length; index += 1) {
    if (phraseWords.every((word, offset) => normalizedWords[index + offset] === word)) return index
  }
  return -1
}

function inferBrand(noYearTitle, suppliedBrand) {
  const supplied = clean(suppliedBrand)
  if (supplied) return { value: supplied, source: 'metadata', wordIndex: phraseWordIndex(noYearTitle, supplied) }
  const ordered = uniq([...MULTIWORD_BRANDS, ...KNOWN_BRANDS]).sort((a, b) => tokenise(b).length - tokenise(a).length)
  let best = null
  for (const brand of ordered) {
    const wordIndex = phraseWordIndex(noYearTitle, brand)
    if (wordIndex < 0) continue
    if (!best || wordIndex < best.wordIndex || (wordIndex === best.wordIndex && tokenise(brand).length > tokenise(best.value).length)) best = { value: brand, source: 'inferred', wordIndex }
  }
  if (best) {
    const originalWords = clean(noYearTitle).split(/\s+/)
    const count = tokenise(best.value).length
    return { ...best, value: originalWords.slice(best.wordIndex, best.wordIndex + count).join(' ') }
  }
  const first = clean(noYearTitle).split(/\s+/)[0] || ''
  return { value: first, source: first ? 'heuristic' : 'unknown', wordIndex: first ? 0 : -1 }
}

function generationCodes(tokens) {
  return uniq(tokens.filter(token => /^mk(?:i{1,4}|v|vi{0,3}|\d+)$/i.test(token) || /^[a-z]{1,4}\d{1,4}[a-z]?$/i.test(token) || /^\d{3}$/i.test(token)))
}
function strongModelTokens(modelTokens) { return modelTokens.filter(token => !GENERIC_WORDS.has(token)).filter(token => token.length > 1 || /^\d{2,}$/.test(token)) }

function normalizeVehicleKind(vehicleClass) {
  const value = norm(vehicleClass)
  if (!value) return null
  if (/motorcycle|motorbike|bike/.test(value)) return 'motorcycle'
  if (/truck|pickup|lorry/.test(value)) return 'truck'
  if (/\bbus\b|coach/.test(value)) return 'bus'
  if (/\bvan\b|minivan/.test(value)) return 'van'
  if (/tractor|utility/.test(value)) return 'utility'
  if (/\bsuv\b/.test(value)) return 'car'
  if (/\bcar\b|race car|automobile|coupe|sedan|hatchback|wagon|roadster/.test(value)) return 'car'
  return null
}

function searchContextFor(identity) {
  const className = norm(identity.vehicleClass)
  if (identity.vehicleKind === 'motorcycle') return 'motorcycle'
  if (identity.vehicleKind === 'truck') return 'truck'
  if (identity.vehicleKind === 'bus') return 'bus'
  if (identity.vehicleKind === 'van') return 'van'
  if (identity.vehicleKind === 'utility') return 'utility vehicle'
  if (identity.vehicleKind === 'car') return className.includes('suv') ? 'SUV car' : 'car'
  return null
}

export function canonicalizeVehicleIdentity(asset = {}) {
  const cleaned = cleanAssetTitle(asset.title)
  const explicitYearMatch = cleaned.match(YEAR_RE)
  const explicitYear = explicitYearMatch ? Number(explicitYearMatch[1]) : null
  const metadataYear = Number(asset.year) >= 1900 && Number(asset.year) <= 2035 ? Number(asset.year) : null
  const noYearTitleRaw = clean(cleaned.replace(YEAR_RE, ' '))
  const inferredBrand = inferBrand(noYearTitleRaw, asset.brand)
  const words = noYearTitleRaw.split(/\s+/).filter(Boolean)
  let brand = clean(inferredBrand.value)
  let vehicleSlice = noYearTitleRaw
  if (brand && inferredBrand.wordIndex >= 0) vehicleSlice = clean(words.slice(inferredBrand.wordIndex).join(' '))
  else if (brand && !norm(vehicleSlice).includes(norm(brand))) vehicleSlice = clean(`${brand} ${vehicleSlice}`)
  let modelText = vehicleSlice
  const brandIndex = brand ? phraseWordIndex(vehicleSlice, brand) : -1
  if (brand && brandIndex === 0) modelText = clean(vehicleSlice.split(/\s+/).slice(tokenise(brand).length).join(' '))
  modelText = clean(modelText.replace(CATALOG_RE, ' ').replace(SOURCE_RE, ' ').replace(/\s*[-–—]\s*$/g, ' '))
  const modelTokens = strongModelTokens(tokenise(modelText))
  const primary = modelTokens[0] || null
  const supporting = modelTokens.slice(1, 5)
  const codes = generationCodes(modelTokens)
  const modelDisplay = clean(modelText.split(/\s+/).slice(0, 6).join(' '))
  const display = clean([brand, modelDisplay].filter(Boolean).join(' ')) || noYearTitleRaw
  const yearTrusted = Boolean(explicitYear)
  const year = explicitYear || metadataYear || null
  const canonical = clean([yearTrusted ? year : null, display].filter(Boolean).join(' '))
  const vehicleClass = clean(asset.vehicleClass)
  return { brand: brand || null, brandSource: inferredBrand.source, year, yearTrusted, yearSource: explicitYear ? 'title' : metadataYear ? 'metadata-unverified' : null, display, canonical, modelDisplay, primaryModel: primary, supporting, generationCodes: codes, vehicleClass: vehicleClass || null, vehicleKind: normalizeVehicleKind(vehicleClass), sourceTitle: clean(asset.title) }
}

function containsPhrase(text, phrase) {
  const normalized = norm(text), parts = tokenise(phrase)
  if (!parts.length) return false
  return new RegExp(`(?:^|\\s)${parts.map(escapeRe).join('\\s+')}(?:$|\\s)`, 'i').test(normalized)
}
function brandConflict(identity, text) {
  if (!identity.brand || containsPhrase(text, identity.brand)) return false
  return Boolean(uniq([...MULTIWORD_BRANDS, ...KNOWN_BRANDS]).find(brand => containsPhrase(text, brand) && norm(brand) !== norm(identity.brand)))
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
  const parts = tokenise(primary)
  if (!parts.length) return false
  return parts.every(part => new RegExp(`(?:^|\\s)${escapeRe(part)}(?:$|\\s)`, 'i').test(normalizedEvidence))
}
function nonRealReferenceReason(evidence) { for (const pattern of NON_REAL_REFERENCE_PATTERNS) if (pattern.test(evidence)) return pattern.source; return null }
function vehicleKindConflict(identity, evidence) {
  if (!identity.vehicleKind) return null
  if (identity.vehicleKind === 'car' && MOTORCYCLE_EVIDENCE_RE.test(evidence)) return 'motorcycle-reference'
  if (identity.vehicleKind === 'motorcycle' && (CAR_BODY_EVIDENCE_RE.test(evidence) || HEAVY_VEHICLE_EVIDENCE_RE.test(evidence))) return 'car-reference'
  if (identity.vehicleKind === 'truck' && /\b(?:motorcycle|motorbike|scooter|moped)\b/i.test(evidence)) return 'wrong-vehicle-class'
  return null
}

export function scoreReferenceIdentity(identity, image) {
  const evidence = clean(`${image?.title || ''} ${image?.galleryTitle || ''} ${image?.sourcePage || ''} ${image?.source || ''} ${image?.creator || ''}`)
  const normalized = norm(evidence)
  const nonReal = nonRealReferenceReason(evidence)
  if (nonReal) return { ok: false, score: 0, reason: 'non-real-reference' }
  const classConflict = vehicleKindConflict(identity, evidence)
  if (classConflict) return { ok: false, score: 0, reason: classConflict }
  if (!identity.primaryModel || !anchorMatches(identity.primaryModel, normalized)) return { ok: false, score: 0, reason: 'model-mismatch' }
  if (brandConflict(identity, normalized)) return { ok: false, score: 0, reason: 'brand-conflict' }
  if (samePrefixGenerationConflict(identity.generationCodes, tokenise(normalized))) return { ok: false, score: 0, reason: 'generation-conflict' }
  const years = [...normalized.matchAll(/\b(19[3-9]\d|20[0-3]\d)\b/g)].map(match => Number(match[1]))
  if (identity.yearTrusted && identity.year && years.length && !years.some(value => Math.abs(value - identity.year) <= 1)) return { ok: false, score: 0, reason: 'year-conflict' }
  let score = 5
  if (identity.brand && containsPhrase(normalized, identity.brand)) score += 3
  score += Math.min(3, identity.supporting.filter(token => anchorMatches(token, normalized)).length)
  score += identity.generationCodes.filter(code => anchorMatches(code, normalized)).length * 2
  if (identity.yearTrusted && identity.year && years.some(value => Math.abs(value - identity.year) <= 1)) score += 2
  if (identity.vehicleKind === 'car' && CAR_BODY_EVIDENCE_RE.test(evidence)) score += 2
  if (identity.vehicleKind === 'motorcycle' && MOTORCYCLE_EVIDENCE_RE.test(evidence)) score += 2
  if (image?.sourceKind === 'specialized') score += 1
  return { ok: score >= 5, score, reason: 'matched' }
}

function cleanWebLinks(identity) {
  const context = searchContextFor(identity)
  const searchText = clean([identity.display, context].filter(Boolean).join(' '))
  const query = encodeURIComponent(searchText)
  const base = [
    { id: 'google', label: 'GOOGLE IMAGES', url: `https://www.google.com/search?tbm=isch&q=${query}`, kind: 'general' },
    { id: 'bing', label: 'BING IMAGES', url: `https://www.bing.com/images/search?q=${query}`, kind: 'general' },
    { id: 'commons', label: 'WIKIMEDIA COMMONS', url: `https://commons.wikimedia.org/w/index.php?search=${query}&title=Special:MediaSearch&type=image`, kind: 'licensed' },
  ]
  return [...specializedSearchLinks(identity), ...base]
}

function filterImages(images, identity) {
  const seen = new Set()
  return (images || [])
    .map(image => ({ image, match: scoreReferenceIdentity(identity, image) }))
    .filter(row => row.match.ok)
    .sort((a, b) => (b.match.score - a.match.score) || ((b.image.identityScore || 0) - (a.image.identityScore || 0)))
    .filter(row => { const key = norm(row.image.imageUrl || row.image.sourcePage || row.image.id); if (!key || seen.has(key)) return false; seen.add(key); return true })
    .map(row => ({ ...row.image, identityScore: Math.max(row.image.identityScore || 0, row.match.score), identityEngine: 'generic-v5-modeling' }))
}

function sourceGroups(images) {
  const groups = new Map()
  for (const image of images) {
    const key = image.source || image.provider || 'Unknown'
    if (!groups.has(key)) groups.set(key, { source: key, count: 0, downloadable: 0, referenceOnly: 0, galleries: new Set(), angles: new Set() })
    const group = groups.get(key)
    group.count += 1
    if (image.downloadAllowed) group.downloadable += 1
    else group.referenceOnly += 1
    if (image.galleryTitle || image.sourcePage) group.galleries.add(image.galleryTitle || image.sourcePage)
    if (image.angle) group.angles.add(image.angle)
  }
  return [...groups.values()].map(group => ({ ...group, galleries: group.galleries.size, angles: group.angles.size })).sort((a, b) => b.count - a.count)
}

function primarySet(images) {
  const sets = new Map()
  for (const image of images.filter(item => item.sourceKind === 'specialized')) {
    const key = `${image.source}|${image.galleryTitle || image.sourcePage}`
    if (!sets.has(key)) sets.set(key, { source: image.source, title: image.galleryTitle || image.title, sourcePage: image.sourcePage, count: 0, angles: new Set() })
    const row = sets.get(key); row.count += 1; if (image.angle) row.angles.add(image.angle)
  }
  const best = [...sets.values()].sort((a, b) => (b.angles.size - a.angles.size) || (b.count - a.count))[0]
  return best ? { source: best.source, title: best.title, sourcePage: best.sourcePage, count: best.count, angles: best.angles.size } : null
}

function mergePack(pack, specialized, identity) {
  const images = filterImages([...(pack?.images || []), ...(specialized?.images || [])], identity).slice(0, 96)
  return {
    ...pack,
    canonicalVehicle: identity.display,
    query: identity.canonical,
    year: identity.yearTrusted ? identity.year : null,
    images,
    downloadableCount: images.filter(image => image.downloadAllowed).length,
    angleCoverage: uniq(images.map(image => image.angle).filter(Boolean)),
    webSearch: cleanWebLinks(identity),
    sourceGroups: sourceGroups(images),
    sourceStatus: specialized?.sourceStatus || [],
    primarySet: primarySet(images),
    modelingCoverage: modelingCoverage(images),
    identity: { brand: identity.brand, brandSource: identity.brandSource, model: identity.modelDisplay, year: identity.yearTrusted ? identity.year : null, yearSource: identity.yearSource, generationCodes: identity.generationCodes, vehicleClass: identity.vehicleClass, vehicleKind: identity.vehicleKind, engine: 'generic-v5-modeling' },
  }
}

function referenceCandidates(identity) {
  const generation = identity.generationCodes.length ? clean([identity.brand, identity.primaryModel, ...identity.generationCodes].join(' ')) : null
  const family = clean([identity.brand, identity.primaryModel].filter(Boolean).join(' '))
  return uniq([identity.yearTrusted ? identity.canonical : null, identity.display, generation, family]).filter(value => value.length >= 2)
}

export async function searchReferencePack(asset, options = {}) {
  const identity = canonicalizeVehicleIdentity(asset)
  const specializedPromise = searchSpecializedReferences(identity, options).catch(() => ({ images: [], sourceStatus: [] }))
  const baseCandidates = referenceCandidates(identity), context = searchContextFor(identity)
  const candidates = uniq([...baseCandidates.map(title => clean([title, context].filter(Boolean).join(' '))), ...baseCandidates]).filter(value => value.length >= 2)
  let best = null
  for (const searchTitle of candidates) {
    const carriesTrustedYear = Boolean(identity.yearTrusted && identity.year && new RegExp(`\b${identity.year}\b`).test(searchTitle))
    const pack = await searchLegacyReferencePack({ title: searchTitle, brand: identity.brand, year: carriesTrustedYear ? identity.year : null }, options)
    const filtered = { ...pack, images: filterImages(pack.images, identity) }
    filtered.angleCoverage = uniq(filtered.images.map(image => image.angle).filter(Boolean))
    if (!best || filtered.images.length > best.images.length || (filtered.images.length === best.images.length && filtered.angleCoverage.length > best.angleCoverage.length)) best = filtered
    if (filtered.images.length >= 14 && filtered.angleCoverage.length >= 6) break
  }
  if (!best) best = await searchLegacyReferencePack({ title: identity.display || asset.title, brand: identity.brand, year: null }, options)
  const specialized = await specializedPromise
  return mergePack(best, specialized, identity)
}

export const buildReferenceZip = buildLegacyReferenceZip
