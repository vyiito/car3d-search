import crypto from 'node:crypto'

const UA = 'VJ3DSearch/3.3 (+https://github.com/vyiito/car3d-search)'
const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_CACHE = 120
const MAX_PACK_IMAGES = 20
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_PACK_BYTES = 80 * 1024 * 1024
const cache = new Map()

const ANGLE_LABELS = {
  front: 'FRONT', rear: 'REAR', side: 'SIDE', 'three-quarter': '3/4', interior: 'INTERIOR',
  wheel: 'WHEEL', engine: 'ENGINE', details: 'DETAILS', reference: 'REFERENCE',
}
const ANGLES = [
  { id: 'front', label: 'FRONT', terms: ['front view', 'front angle'] },
  { id: 'rear', label: 'REAR', terms: ['rear view', 'rear angle'] },
  { id: 'side', label: 'SIDE', terms: ['side profile', 'side view'] },
  { id: 'three-quarter', label: '3/4', terms: ['three quarter view', '3/4 view'] },
  { id: 'interior', label: 'INTERIOR', terms: ['interior dashboard', 'cockpit interior'] },
  { id: 'wheel', label: 'WHEEL', terms: ['wheel rim', 'factory wheel'] },
  { id: 'engine', label: 'ENGINE', terms: ['engine bay', 'engine compartment'] },
  { id: 'details', label: 'DETAILS', terms: ['headlight detail', 'taillight detail'] },
]
const ANGLE_PATTERNS = [
  ['interior', /\b(?:interior|cockpit|dashboard|dash board|cabin|instrument cluster|steering wheel|center console|centre console|seat|seats)\b/i],
  ['wheel', /\b(?:wheel|wheels|rim|rims|alloy wheel|alloy wheels|tyre|tyres|tire|tires)\b/i],
  ['engine', /\b(?:engine bay|engine compartment|engine room|under[- ]hood|under[- ]bonnet|motor compartment)\b/i],
  ['details', /\b(?:headlight|headlights|headlamp|taillight|tail light|badge|emblem|mirror|door handle|brake|caliper|exhaust|spoiler|diffuser)\b/i],
  ['three-quarter', /\b(?:three[- ]?quarter|3\s*\/\s*4|¾|front[- ]?quarter|rear[- ]?quarter)\b/i],
  ['front', /\b(?:front view|front angle|frontal|nose|grille|grill)\b/i],
  ['rear', /\b(?:rear view|rear angle|back view|from behind|back end)\b/i],
  ['side', /\b(?:side view|side profile|left side|right side|profile|lateral)\b/i],
]

const REDISTRIBUTABLE_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa'])
const COMMONS_ALLOWED = /public domain|cc0|cc by(?:-sa)?\b|creative commons attribution(?:-share alike)?/i
const YEAR_RE = /\b(?:19[3-9]\d|20[0-3]\d)\b/g
const GENERATION_RE = /\b(?:mk\s?(?:i{1,4}|v|vi{0,3}|\d+)|a\d{2,3}|jza\d{2,3}|e\d{2,3}|r\d{2,3}|s\d{2,3}|sg\d|gc\d|gd\d|w\d{2,3}|fa5|fg2|fb6|fg4|fc\d|fe\d)\b/gi
const GAME_NOISE_RE = /\b(?:forza(?: horizon)?\s*\d*|forza motorsport|assetto corsa(?: competizione)?|gran turismo(?: sport|\s*\d+)?|csr racing\s*\d*|real racing\s*\d*|carx(?: drift racing| street)?|beamng(?:\.drive)?|need for speed(?: heat| unbound| no limits| mobile)?|gta\s*(?:iv|v|4|5)|euro truck simulator\s*2|american truck simulator)\b/gi
const ASSET_NOISE_RE = /\b(?:converted|conversion|ripped|rip|addon|add-on|extract(?:ed)?|port(?:ed)?|hq|uhd|4k|8k|pbr|lod\s*\d*|v\d+(?:\.\d+)*)\b/gi
const FORMAT_NOISE_RE = /\b(?:fbx|obj|blend|blender|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|kn5|dds|textures?)\b/gi
const LISTING_SUFFIX_RE = /\s*[-–—]\s*(?:lm|lms|hq|hd|lod\d*|pack|asset|mod|render)\s*$/i
const GENERIC_MODEL_WORDS = new Set(['car','vehicle','automobile','model','3d','sedan','coupe','hatchback','wagon','suv','render'])
const BRAND_WORDS = new Set(['honda','toyota','nissan','bmw','audi','porsche','ford','chevrolet','subaru','mitsubishi','mazda','mercedes','mercedes-benz','volkswagen','volvo','ferrari','lamborghini','mclaren','lexus','acura','hyundai','kia','jeep','dodge','fiat','renault','peugeot','citroen','funco','motorsports'])

const ALIAS_RULES = [
  { test: /\b(?:toyota\s+)?supra\b.*\b(?:mk\s*4|mk\s*iv|a80|jza80)\b/i, values: ['Toyota Supra MK4','Toyota Supra A80','Toyota Supra JZA80'] },
  { test: /\b(?:nissan\s+)?(?:skyline\s+)?(?:gt-?r\s+)?r34\b/i, values: ['Nissan Skyline GT-R R34','Nissan Skyline R34'] },
  { test: /\bbmw\s+m3\s+e46\b/i, values: ['BMW M3 E46'] },
  { test: /\bmazda\s+rx-?7\b.*\b(?:fd|fd3s)\b/i, values: ['Mazda RX-7 FD','Mazda RX-7 FD3S'] },
  { test: /\bhonda\s+nsx\b.*\b(?:na1|na2)\b/i, values: ['Honda NSX NA1','Honda NSX'] },
  { test: /\bporsche\s+911\b.*\b992\b/i, values: ['Porsche 911 992'] },
  { test: /\bsubaru\s+impreza\b.*\b(?:gc8|gd)\b/i, values: ['Subaru Impreza WRX STI GC8','Subaru Impreza WRX STI'] },
]

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
const safeUrl = value => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null } }
const idFor = value => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 18)
const safeFilePart = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'reference'

function classifyReferenceAngle(evidence, intendedAngle = null) {
  const text = clean(evidence)
  for (const [id, pattern] of ANGLE_PATTERNS) if (pattern.test(text)) return { id, label: ANGLE_LABELS[id], confidence: 'metadata' }
  if (intendedAngle && ANGLE_LABELS[intendedAngle]) return { id: intendedAngle, label: ANGLE_LABELS[intendedAngle], confidence: 'query' }
  return { id: 'reference', label: ANGLE_LABELS.reference, confidence: 'fallback' }
}

function trimCache() {
  const now = Date.now()
  for (const [key, entry] of cache) if (now - entry.createdAt > CACHE_TTL_MS) cache.delete(key)
  if (cache.size <= MAX_CACHE) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, cache.size - MAX_CACHE)
  for (const [key] of oldest) cache.delete(key)
}

async function fetchJson(url, timeout = 12000) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': UA, accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally { clearTimeout(timer) }
}

function cleanVehicleTitle(title) {
  return clean(title)
    .replace(LISTING_SUFFIX_RE, ' ')
    .replace(/\([^)]*(?:fbx|obj|blend|stl|3ds|max|c4d|game|mod|forza|assetto|gran turismo|\b\d{5,}\b)[^)]*\)/gi, ' ')
    .replace(/\[[^\]]*(?:fbx|obj|blend|stl|game|mod|forza|assetto|gran turismo|csr|carx|\b\d{5,}\b)[^\]]*\]/gi, ' ')
    .replace(/\b(?:3d\s*model|asset|download|free|premium|mod|game[- ]?ready|low[- ]?poly|high[- ]?poly)\b/gi, ' ')
    .replace(GAME_NOISE_RE, ' ').replace(ASSET_NOISE_RE, ' ').replace(FORMAT_NOISE_RE, ' ')
    .replace(/(?:US\$|R\$|\$|€|£)\s*\d+(?:[.,]\d{1,2})?/gi, ' ')
    .replace(/\b(?:IE[- ]?)?\d{1,3}%\b/gi, ' ')
    .replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function generationHints(canonical, year) {
  const text = norm(canonical)
  if (/\bhonda civic(?: si)?\b/.test(text) && year) {
    if (year >= 2012 && year <= 2015) return { preferred: ['fb6','fg4','9th gen','ninth generation'], conflicts: ['fa5','fg2','8th gen','eighth generation'] }
    if (year >= 2006 && year <= 2011) return { preferred: ['fa5','fg2','8th gen','eighth generation'], conflicts: ['fb6','fg4','9th gen','ninth generation'] }
    if (year >= 2017 && year <= 2021) return { preferred: ['fc1','fc3','10th gen','tenth generation'], conflicts: ['fa5','fg2','fb6','fg4'] }
    if (year >= 2022) return { preferred: ['fe1','11th gen','eleventh generation'], conflicts: ['fa5','fg2','fb6','fg4','fc1','fc3'] }
  }
  return { preferred: [], conflicts: [] }
}

function vehicleIdentity(asset) {
  let title = cleanVehicleTitle(asset.title)
  const brand = clean(asset.brand)
  const year = Number(asset.year) || Number(title.match(YEAR_RE)?.[0]) || null
  if (brand && !norm(title).includes(norm(brand))) title = `${brand} ${title}`
  const noYear = clean(title.replace(YEAR_RE, ' '))
  const brandTokens = norm(brand).split(/\s+/).filter(Boolean)
  const tokens = norm(noYear).split(/[^a-z0-9]+/).filter(Boolean).filter(token => !brandTokens.includes(token) && !GENERIC_MODEL_WORDS.has(token))
  const primaryModel = tokens.find(token => token.length > 1) || null
  const supporting = tokens.filter(token => token !== primaryModel).slice(0, 4)
  const canonical = clean([year || '', noYear].filter(Boolean).join(' '))
  const hints = generationHints(canonical, year)
  return { brand, year, canonical, noYear, primaryModel, supporting, ...hints }
}

function identityMatch(identity, title, evidence = '') {
  const titleText = norm(title), text = norm(`${title} ${evidence}`)
  if (!identity.primaryModel || !text.includes(identity.primaryModel)) return { ok: false, score: 0, reason: 'model-mismatch' }
  if (identity.conflicts.some(code => text.includes(norm(code)))) return { ok: false, score: 0, reason: 'generation-conflict' }
  const titleYears = [...titleText.matchAll(/\b(19[3-9]\d|20[0-3]\d)\b/g)].map(match => Number(match[1]))
  if (identity.year && titleYears.length && !titleYears.some(value => Math.abs(value - identity.year) <= 1)) return { ok: false, score: 0, reason: 'year-conflict' }
  let score = 4
  if (identity.brand && text.includes(norm(identity.brand))) score += 3
  score += identity.supporting.filter(token => token.length > 1 && text.includes(token)).length
  if (identity.year && titleYears.some(value => Math.abs(value - identity.year) <= 1)) score += 2
  if (identity.preferred.some(code => text.includes(norm(code)))) score += 2
  const foreignBrand = [...BRAND_WORDS].find(token => text.includes(token) && identity.brand && !norm(identity.brand).includes(token) && token !== identity.primaryModel)
  if (foreignBrand && !text.includes(norm(identity.brand))) return { ok: false, score: 0, reason: 'brand-conflict' }
  return { ok: score >= 4, score, reason: 'matched' }
}

function queryVariants(identity) {
  const variants = [
    { query: identity.canonical, matchLevel: 'exact' },
    { query: identity.noYear, matchLevel: 'model' },
  ]
  for (const hint of identity.preferred) variants.push({ query: `${identity.noYear} ${hint}`, matchLevel: 'generation' })
  for (const rule of ALIAS_RULES) if (rule.test.test(identity.canonical)) for (const alias of rule.values) variants.push({ query: alias, matchLevel: 'alias' })
  const seen = new Set()
  return variants.filter(item => item.query.length > 1 && !seen.has(norm(item.query)) && seen.add(norm(item.query)))
}

function openverseAllowed(item) {
  const license = String(item?.license || '').toLowerCase()
  return REDISTRIBUTABLE_LICENSES.has(license) && Boolean(safeUrl(item?.url)) && item?.watermarked !== true
}

async function searchOpenverse(query, perAngle, matchLevel, identity, intendedAngle = null) {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', String(Math.max(8, Math.min(perAngle + 8, 20))))
  const payload = await fetchJson(url.href)
  const rows = Array.isArray(payload?.results) ? payload.results : [], results = []
  for (const item of rows) {
    const imageUrl = safeUrl(item?.url), thumbnailUrl = safeUrl(item?.thumbnail) || imageUrl
    const sourcePage = safeUrl(item?.foreign_landing_url) || safeUrl(item?.detail_url) || imageUrl
    if (!imageUrl || !thumbnailUrl || !sourcePage) continue
    const tags = Array.isArray(item?.tags) ? item.tags.map(tag => clean(tag?.name || tag)).join(' ') : ''
    const title = clean(item?.title) || query
    const evidence = [item?.description, item?.alt_text, tags].map(clean).join(' ')
    const match = identityMatch(identity, title, evidence)
    if (!match.ok) continue
    const angleMeta = classifyReferenceAngle(`${title} ${evidence}`, intendedAngle)
    const license = String(item?.license || '').toLowerCase() || 'unknown', allowed = openverseAllowed(item)
    results.push({ id:`ov-${idFor(imageUrl)}`, angle:angleMeta.id, angleLabel:angleMeta.label, angleConfidence:angleMeta.confidence, title, imageUrl, thumbnailUrl, sourcePage,
      source:clean(item?.source || item?.provider) || 'Openverse', provider:clean(item?.provider) || null, creator:clean(item?.creator) || 'Autor não informado', creatorUrl:safeUrl(item?.creator_url),
      license, licenseVersion:clean(item?.license_version) || null, licenseUrl:safeUrl(item?.license_url), width:Number(item?.width) || null, height:Number(item?.height) || null,
      downloadAllowed:allowed, matchLevel, identityScore:match.score, redistributionNote:allowed?'Licença aceita pelo VJ Reference Pack.':'Referência apenas; não entra no ZIP automático.' })
  }
  return results.sort((a,b)=>b.identityScore-a.identityScore)
}

function commonsLicenseAllowed(meta = {}) {
  const label = clean(meta?.LicenseShortName?.value || meta?.UsageTerms?.value || '')
  return COMMONS_ALLOWED.test(label)
}

async function searchCommons(query, perAngle, matchLevel, identity, intendedAngle = null) {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action','query'); url.searchParams.set('format','json'); url.searchParams.set('generator','search')
  url.searchParams.set('gsrsearch', query); url.searchParams.set('gsrnamespace','6'); url.searchParams.set('gsrlimit', String(Math.max(8, Math.min(perAngle + 8, 20))))
  url.searchParams.set('prop','imageinfo'); url.searchParams.set('iiprop','url|size|mime|extmetadata'); url.searchParams.set('iiurlwidth','900')
  url.searchParams.set('iiextmetadatafilter','LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription|Categories')
  const payload = await fetchJson(url.href), pages = Object.values(payload?.query?.pages || {}), results = []
  for (const page of pages) {
    const info = page?.imageinfo?.[0], imageUrl = safeUrl(info?.url), thumbnailUrl = safeUrl(info?.thumburl) || imageUrl, sourcePage = safeUrl(info?.descriptionurl)
    if (!imageUrl || !thumbnailUrl || !sourcePage || !String(info?.mime || '').startsWith('image/')) continue
    const meta = info?.extmetadata || {}, title = clean(String(page?.title || '').replace(/^File:/i,'')) || query
    const evidence = `${clean(meta?.ImageDescription?.value)} ${clean(meta?.Categories?.value)}`
    const match = identityMatch(identity, title, evidence)
    if (!match.ok) continue
    const angleMeta = classifyReferenceAngle(`${title} ${evidence}`, intendedAngle)
    const license = clean(meta?.LicenseShortName?.value) || 'Wikimedia Commons', allowed = commonsLicenseAllowed(meta)
    results.push({ id:`wm-${idFor(imageUrl)}`, angle:angleMeta.id, angleLabel:angleMeta.label, angleConfidence:angleMeta.confidence, title, imageUrl, thumbnailUrl, sourcePage,
      source:'Wikimedia Commons', provider:'Wikimedia', creator:clean(meta?.Artist?.value || meta?.Credit?.value) || 'Autor não informado', creatorUrl:null, license, licenseVersion:null,
      licenseUrl:safeUrl(meta?.LicenseUrl?.value), width:Number(info?.width) || null, height:Number(info?.height) || null, downloadAllowed:allowed, matchLevel, identityScore:match.score,
      redistributionNote:allowed?'Licença aceita pelo VJ Reference Pack.':'Referência apenas; licença deve ser verificada na fonte.' })
  }
  return results.sort((a,b)=>b.identityScore-a.identityScore)
}

function dedupe(images) {
  const seen = new Set(), out = []
  for (const image of images) { const key=image.imageUrl.replace(/^https?:\/\//,'').replace(/[?#].*$/,''); if(seen.has(key))continue; seen.add(key); out.push(image) }
  return out
}

async function searchAngle(variants, angle, perAngle, identity) {
  let collected = []
  const attempts = []
  for (const variant of variants.slice(0,5)) for (const term of angle.terms) attempts.push({ query:`${variant.query} ${term}`, matchLevel:variant.matchLevel })
  for (const attempt of attempts.slice(0,8)) {
    try { collected.push(...await searchCommons(attempt.query, perAngle + 3, attempt.matchLevel, identity, angle.id)) } catch {}
    collected = dedupe(collected)
    if (collected.filter(image=>image.angle===angle.id).length < perAngle) {
      try { collected.push(...await searchOpenverse(attempt.query, perAngle + 3, attempt.matchLevel, identity, angle.id)) } catch {}
      collected = dedupe(collected)
    }
    if (collected.filter(image=>image.angle===angle.id).length >= perAngle) break
  }
  return collected.filter(image=>image.angle===angle.id).sort((a,b)=>(b.identityScore||0)-(a.identityScore||0)).slice(0,perAngle)
}

async function searchGeneral(variants, limit, identity) {
  let collected = []
  for (const variant of variants.slice(0,4)) {
    try { collected.push(...await searchCommons(variant.query, limit, variant.matchLevel, identity)) } catch {}
    collected = dedupe(collected)
    if (collected.length < limit) { try { collected.push(...await searchOpenverse(variant.query, limit-collected.length, variant.matchLevel, identity)) } catch {}; collected=dedupe(collected) }
    if (collected.length >= limit) break
  }
  return collected.sort((a,b)=>(b.identityScore||0)-(a.identityScore||0)).slice(0,limit)
}

export async function searchReferencePack(asset, options = {}) {
  const identity = vehicleIdentity(asset)
  if (identity.canonical.length < 2) throw new Error('Vehicle title is required for reference search.')
  const perAngle = Math.max(2,Math.min(Number(options.perAngle||4),6)), variants=queryVariants(identity)
  const batches = await Promise.all(ANGLES.map(angle=>searchAngle(variants,angle,perAngle,identity)))
  let images = dedupe(batches.flat()).slice(0,40)
  if (images.length < Math.min(20, perAngle * 5)) images = dedupe([...images,...await searchGeneral(variants,Math.min(20,perAngle*5),identity)]).slice(0,40)
  images.sort((a,b)=>{const ai=Object.keys(ANGLE_LABELS).indexOf(a.angle),bi=Object.keys(ANGLE_LABELS).indexOf(b.angle);return(ai<0?99:ai)-(bi<0?99:bi)||(b.identityScore||0)-(a.identityScore||0)})
  const packId=crypto.randomUUID(), webQuery=identity.noYear || identity.canonical
  const payload={ packId, query:identity.canonical, canonicalVehicle:identity.noYear, queryVariants:variants, title:clean(asset.title)||identity.canonical, brand:identity.brand||null, year:identity.year,
    images, downloadableCount:images.filter(image=>image.downloadAllowed).length, angleCoverage:[...new Set(images.map(image=>image.angle))],
    webSearch:[
      {id:'google',label:'GOOGLE IMAGES',url:`https://www.google.com/search?tbm=isch&q=${encodeURIComponent(webQuery)}`},
      {id:'bing',label:'BING IMAGES',url:`https://www.bing.com/images/search?q=${encodeURIComponent(webQuery)}`},
      {id:'commons',label:'WIKIMEDIA COMMONS',url:`https://commons.wikimedia.org/w/index.php?search=${encodeURIComponent(webQuery)}&title=Special:MediaSearch&type=image`},
    ], createdAt:new Date().toISOString(), expiresInSeconds:Math.floor(CACHE_TTL_MS/1000) }
  cache.set(packId,{createdAt:Date.now(),payload}); trimCache(); return payload
}

export function getReferencePack(packId){trimCache();return cache.get(String(packId||''))?.payload||null}

const CRC_TABLE=(()=>{const table=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);table[n]=c>>>0}return table})()
function crc32(buffer){let crc=0xffffffff;for(const byte of buffer)crc=CRC_TABLE[(crc^byte)&0xff]^(crc>>>8);return(crc^0xffffffff)>>>0}
function dosDateTime(date=new Date()){const year=Math.max(1980,date.getFullYear());return{dosTime:((date.getHours()&31)<<11)|((date.getMinutes()&63)<<5)|(Math.floor(date.getSeconds()/2)&31),dosDate:(((year-1980)&127)<<9)|(((date.getMonth()+1)&15)<<5)|(date.getDate()&31)}}
function makeZip(entries){const localParts=[],centralParts=[];let offset=0;const{dosTime,dosDate}=dosDateTime();for(const entry of entries){const name=Buffer.from(entry.name,'utf8'),data=Buffer.isBuffer(entry.data)?entry.data:Buffer.from(entry.data),crc=crc32(data),local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(0,8);local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(0,28);localParts.push(local,name,data);const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(0,10);central.writeUInt16LE(dosTime,12);central.writeUInt16LE(dosDate,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(0,30);central.writeUInt16LE(0,32);central.writeUInt16LE(0,34);central.writeUInt16LE(0,36);central.writeUInt32LE(0,38);central.writeUInt32LE(offset,42);centralParts.push(central,name);offset+=local.length+name.length+data.length}const centralSize=centralParts.reduce((sum,part)=>sum+part.length,0),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(0,4);end.writeUInt16LE(0,6);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);end.writeUInt16LE(0,20);return Buffer.concat([...localParts,...centralParts,end])}
async function readImage(url){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(url,{signal:controller.signal,redirect:'follow',headers:{'user-agent':UA,accept:'image/*'}});if(!response.ok)throw new Error(`HTTP ${response.status}`);const type=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase(),extMap={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'},extension=extMap[type];if(!extension||!response.body)throw new Error('Unsupported image type');const declared=Number(response.headers.get('content-length')||0);if(declared>MAX_IMAGE_BYTES)throw new Error('Image too large');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const{done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_IMAGE_BYTES){await reader.cancel();throw new Error('Image too large')}chunks.push(Buffer.from(value))}return{buffer:Buffer.concat(chunks),extension}}finally{clearTimeout(timer)}}
export async function buildReferenceZip(packId,selectedIds=[]){const pack=getReferencePack(packId);if(!pack)throw new Error('Reference pack expired or not found.');const wanted=new Set(selectedIds.filter(Boolean)),candidates=pack.images.filter(image=>image.downloadAllowed&&(!wanted.size||wanted.has(image.id))).slice(0,MAX_PACK_IMAGES);if(!candidates.length)throw new Error('No redistributable reference images selected.');const entries=[],manifest=[],angleCounters=new Map();let totalBytes=0;for(const image of candidates){try{const fetched=await readImage(image.imageUrl);if(totalBytes+fetched.buffer.length>MAX_PACK_BYTES)break;totalBytes+=fetched.buffer.length;const count=(angleCounters.get(image.angle)||0)+1;angleCounters.set(image.angle,count);const folder=safeFilePart(image.angleLabel||image.angle).toUpperCase(),name=`${folder}/${String(count).padStart(2,'0')}_${safeFilePart(image.title)}.${fetched.extension}`;entries.push({name,data:fetched.buffer});manifest.push([name,`Title: ${image.title}`,`Angle: ${image.angleLabel}`,`Angle confidence: ${image.angleConfidence||'unknown'}`,`Match: ${image.matchLevel||'unknown'}`,`Identity score: ${image.identityScore||0}`,`Creator: ${image.creator}`,`License: ${image.license}${image.licenseVersion?` ${image.licenseVersion}`:''}`,`License URL: ${image.licenseUrl||'Not provided'}`,`Source page: ${image.sourcePage}`,`Original image: ${image.imageUrl}`].join('\n'))}catch(error){manifest.push(`SKIPPED: ${image.title}\nReason: ${error instanceof Error?error.message:'download failed'}\nSource page: ${image.sourcePage}`)}}if(!entries.length)throw new Error('The selected source images could not be downloaded.');const readme=`VJ REFERENCE PACK\nVehicle: ${pack.canonicalVehicle||pack.title}\nSearch: ${pack.query}\nGenerated: ${new Date().toISOString()}\nIncluded images: ${entries.length}\n\nImages are accepted only after vehicle identity matching. ANGLE VERIFIED means source metadata named the angle; SEARCH ANGLE means the image matched the correct vehicle and was returned by a dedicated angle query.\n\n${manifest.join('\n\n---\n\n')}\n`;entries.push({name:'sources.txt',data:Buffer.from(readme,'utf8')});return{buffer:makeZip(entries),filename:`${safeFilePart(pack.canonicalVehicle||pack.title)}_VJ_Reference_Pack.zip`,included:entries.length-1}}
