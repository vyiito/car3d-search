import crypto from 'node:crypto'

const UA = 'VJ3DSearch/3.1 (+https://github.com/vyiito/car3d-search)'
const CACHE_TTL_MS = 30 * 60 * 1000
const MAX_CACHE = 120
const MAX_PACK_IMAGES = 20
const MAX_IMAGE_BYTES = 12 * 1024 * 1024
const MAX_PACK_BYTES = 80 * 1024 * 1024
const cache = new Map()

const ANGLES = [
  { id: 'front', label: 'FRONT', terms: ['front', 'front view'] },
  { id: 'rear', label: 'REAR', terms: ['rear', 'back'] },
  { id: 'side', label: 'SIDE', terms: ['side', 'left side', 'profile'] },
  { id: 'three-quarter', label: '3/4', terms: ['three quarter', '3/4'] },
  { id: 'interior', label: 'INTERIOR', terms: ['interior', 'dashboard'] },
  { id: 'details', label: 'DETAILS', terms: ['wheel', 'engine room', 'headlight'] },
]

const REDISTRIBUTABLE_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa'])
const COMMONS_ALLOWED = /public domain|cc0|cc by(?:-sa)?\b|creative commons attribution(?:-share alike)?/i
const YEAR_RE = /\b(?:19[3-9]\d|20[0-3]\d)\b/g
const GENERATION_RE = /\b(?:mk\s?(?:i{1,4}|v|vi{0,3}|\d+)|a\d{2,3}|jza\d{2,3}|e\d{2,3}|r\d{2,3}|s\d{2,3}|sg\d|gc\d|gd\d|w\d{2,3})\b/gi

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const safeUrl = value => { try { const url = new URL(String(value || '')); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null } }
const idFor = value => crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 18)
const safeFilePart = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 90) || 'reference'

function trimCache() {
  const now = Date.now()
  for (const [key, entry] of cache) if (now - entry.createdAt > CACHE_TTL_MS) cache.delete(key)
  if (cache.size <= MAX_CACHE) return
  const oldest = [...cache.entries()].sort((a, b) => a[1].createdAt - b[1].createdAt).slice(0, cache.size - MAX_CACHE)
  for (const [key] of oldest) cache.delete(key)
}

async function fetchJson(url, timeout = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { 'user-agent': UA, accept: 'application/json' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return response.json()
  } finally { clearTimeout(timer) }
}

function vehicleBaseQuery({ title, brand, year }) {
  const raw = clean(title)
    .replace(/\b(?:3d\s*model|asset|download|free|premium|mod|game[- ]?ready|low[- ]?poly|high[- ]?poly)\b/gi, ' ')
    .replace(/\([^)]*(?:fbx|obj|blend|stl|3ds|max|c4d|game|mod)[^)]*\)/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const pieces = []
  if (year && !raw.includes(String(year))) pieces.push(String(year))
  if (brand && !raw.toLowerCase().includes(String(brand).toLowerCase())) pieces.push(clean(brand))
  pieces.push(raw)
  return clean(pieces.join(' ')).slice(0, 110)
}

function queryVariants(baseQuery) {
  const exact = clean(baseQuery)
  const noYear = clean(exact.replace(YEAR_RE, ' '))
  const family = clean(noYear.replace(GENERATION_RE, ' '))
  const variants = [
    { query: exact, matchLevel: 'exact' },
    { query: noYear, matchLevel: 'generation' },
    { query: family, matchLevel: 'family' },
  ]
  const seen = new Set()
  return variants.filter(item => item.query.length > 1 && !seen.has(item.query.toLowerCase()) && seen.add(item.query.toLowerCase()))
}

function openverseAllowed(item) {
  const license = String(item?.license || '').toLowerCase()
  return REDISTRIBUTABLE_LICENSES.has(license) && Boolean(safeUrl(item?.url)) && item?.watermarked !== true
}

async function searchOpenverse(query, angle, perAngle, matchLevel) {
  const url = new URL('https://api.openverse.org/v1/images/')
  url.searchParams.set('q', query)
  url.searchParams.set('page_size', String(Math.max(4, Math.min(perAngle + 4, 12))))
  const payload = await fetchJson(url.href)
  const rows = Array.isArray(payload?.results) ? payload.results : []
  const results = []
  for (const item of rows) {
    const imageUrl = safeUrl(item?.url)
    const thumbnailUrl = safeUrl(item?.thumbnail) || imageUrl
    const sourcePage = safeUrl(item?.foreign_landing_url) || safeUrl(item?.detail_url) || imageUrl
    if (!imageUrl || !thumbnailUrl || !sourcePage) continue
    const license = String(item?.license || '').toLowerCase() || 'unknown'
    const allowed = openverseAllowed(item)
    results.push({
      id: `ov-${idFor(imageUrl)}`,
      angle: angle.id,
      angleLabel: angle.label,
      title: clean(item?.title) || query,
      imageUrl,
      thumbnailUrl,
      sourcePage,
      source: clean(item?.source || item?.provider) || 'Openverse',
      provider: clean(item?.provider) || null,
      creator: clean(item?.creator) || 'Autor não informado',
      creatorUrl: safeUrl(item?.creator_url),
      license,
      licenseVersion: clean(item?.license_version) || null,
      licenseUrl: safeUrl(item?.license_url),
      width: Number(item?.width) || null,
      height: Number(item?.height) || null,
      downloadAllowed: allowed,
      matchLevel,
      redistributionNote: allowed ? 'Licença aceita pelo VJ Reference Pack.' : 'Referência apenas; não entra no ZIP automático.',
    })
    if (results.length >= perAngle) break
  }
  return results
}

function commonsLicenseAllowed(meta = {}) {
  const label = clean(meta?.LicenseShortName?.value || meta?.UsageTerms?.value || '')
  return COMMONS_ALLOWED.test(label)
}

async function searchCommons(query, angle, perAngle, matchLevel) {
  const url = new URL('https://commons.wikimedia.org/w/api.php')
  url.searchParams.set('action', 'query')
  url.searchParams.set('format', 'json')
  url.searchParams.set('generator', 'search')
  url.searchParams.set('gsrsearch', query)
  url.searchParams.set('gsrnamespace', '6')
  url.searchParams.set('gsrlimit', String(Math.max(4, Math.min(perAngle + 4, 10))))
  url.searchParams.set('prop', 'imageinfo')
  url.searchParams.set('iiprop', 'url|size|mime|extmetadata')
  url.searchParams.set('iiurlwidth', '900')
  url.searchParams.set('iiextmetadatafilter', 'LicenseShortName|LicenseUrl|Artist|Credit|ImageDescription')
  const payload = await fetchJson(url.href)
  const pages = Object.values(payload?.query?.pages || {})
  const results = []
  for (const page of pages) {
    const info = page?.imageinfo?.[0]
    const imageUrl = safeUrl(info?.url)
    const thumbnailUrl = safeUrl(info?.thumburl) || imageUrl
    const sourcePage = safeUrl(info?.descriptionurl)
    if (!imageUrl || !thumbnailUrl || !sourcePage || !String(info?.mime || '').startsWith('image/')) continue
    const meta = info?.extmetadata || {}
    const license = clean(meta?.LicenseShortName?.value) || 'Wikimedia Commons'
    const allowed = commonsLicenseAllowed(meta)
    results.push({
      id: `wm-${idFor(imageUrl)}`,
      angle: angle.id,
      angleLabel: angle.label,
      title: clean(String(page?.title || '').replace(/^File:/i, '')) || query,
      imageUrl,
      thumbnailUrl,
      sourcePage,
      source: 'Wikimedia Commons',
      provider: 'Wikimedia',
      creator: clean(meta?.Artist?.value || meta?.Credit?.value) || 'Autor não informado',
      creatorUrl: null,
      license,
      licenseVersion: null,
      licenseUrl: safeUrl(meta?.LicenseUrl?.value),
      width: Number(info?.width) || null,
      height: Number(info?.height) || null,
      downloadAllowed: allowed,
      matchLevel,
      redistributionNote: allowed ? 'Licença aceita pelo VJ Reference Pack.' : 'Referência apenas; licença deve ser verificada na fonte.',
    })
    if (results.length >= perAngle) break
  }
  return results
}

function dedupe(images) {
  const seen = new Set(), out = []
  for (const image of images) {
    const key = image.imageUrl.replace(/^https?:\/\//, '').replace(/[?#].*$/, '')
    if (seen.has(key)) continue
    seen.add(key); out.push(image)
  }
  return out
}

async function searchAngle(variants, angle, perAngle) {
  let collected = []
  const attempts = []
  for (const variant of variants) for (const term of angle.terms.slice(0, 2)) attempts.push({ query: `${variant.query} ${term}`, matchLevel: variant.matchLevel })
  for (const attempt of attempts.slice(0, 5)) {
    try { collected.push(...await searchOpenverse(attempt.query, angle, perAngle, attempt.matchLevel)) } catch {}
    collected = dedupe(collected)
    if (collected.length < perAngle) {
      try { collected.push(...await searchCommons(attempt.query, angle, perAngle - collected.length, attempt.matchLevel)) } catch {}
      collected = dedupe(collected)
    }
    if (collected.length >= perAngle) break
  }
  return collected.slice(0, perAngle)
}

async function searchGeneral(variants, limit = 8) {
  const angle = { id: 'reference', label: 'REFERENCE' }
  let collected = []
  for (const variant of variants.slice(0, 3)) {
    try { collected.push(...await searchOpenverse(variant.query, angle, limit, variant.matchLevel)) } catch {}
    collected = dedupe(collected)
    if (collected.length < limit) {
      try { collected.push(...await searchCommons(variant.query, angle, limit - collected.length, variant.matchLevel)) } catch {}
      collected = dedupe(collected)
    }
    if (collected.length >= limit) break
  }
  return collected.slice(0, limit)
}

export async function searchReferencePack(asset, options = {}) {
  const baseQuery = vehicleBaseQuery(asset)
  if (baseQuery.length < 2) throw new Error('Vehicle title is required for reference search.')
  const perAngle = Math.max(2, Math.min(Number(options.perAngle || 4), 6))
  const variants = queryVariants(baseQuery)
  const batches = await Promise.all(ANGLES.map(angle => searchAngle(variants, angle, perAngle)))
  let images = dedupe(batches.flat()).slice(0, 36)
  if (!images.length) images = await searchGeneral(variants, Math.min(12, perAngle * 3))
  const packId = crypto.randomUUID()
  const payload = {
    packId,
    query: baseQuery,
    queryVariants: variants,
    title: clean(asset.title) || baseQuery,
    brand: clean(asset.brand) || null,
    year: Number(asset.year) || null,
    images,
    downloadableCount: images.filter(image => image.downloadAllowed).length,
    angleCoverage: [...new Set(images.map(image => image.angle))],
    createdAt: new Date().toISOString(),
    expiresInSeconds: Math.floor(CACHE_TTL_MS / 1000),
  }
  cache.set(packId, { createdAt: Date.now(), payload })
  trimCache()
  return payload
}

export function getReferencePack(packId) {
  trimCache()
  return cache.get(String(packId || ''))?.payload || null
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    table[n] = c >>> 0
  }
  return table
})()
function crc32(buffer) {
  let crc = 0xffffffff
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear())
  return {
    dosTime: ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | (Math.floor(date.getSeconds() / 2) & 31),
    dosDate: (((year - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31),
  }
}
function makeZip(entries) {
  const localParts = [], centralParts = []
  let offset = 0
  const { dosTime, dosDate } = dosDateTime()
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8'), data = Buffer.isBuffer(entry.data) ? entry.data : Buffer.from(entry.data), crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50,0); local.writeUInt16LE(20,4); local.writeUInt16LE(0x0800,6); local.writeUInt16LE(0,8); local.writeUInt16LE(dosTime,10); local.writeUInt16LE(dosDate,12); local.writeUInt32LE(crc,14); local.writeUInt32LE(data.length,18); local.writeUInt32LE(data.length,22); local.writeUInt16LE(name.length,26); local.writeUInt16LE(0,28)
    localParts.push(local,name,data)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50,0); central.writeUInt16LE(20,4); central.writeUInt16LE(20,6); central.writeUInt16LE(0x0800,8); central.writeUInt16LE(0,10); central.writeUInt16LE(dosTime,12); central.writeUInt16LE(dosDate,14); central.writeUInt32LE(crc,16); central.writeUInt32LE(data.length,20); central.writeUInt32LE(data.length,24); central.writeUInt16LE(name.length,28); central.writeUInt16LE(0,30); central.writeUInt16LE(0,32); central.writeUInt16LE(0,34); central.writeUInt16LE(0,36); central.writeUInt32LE(0,38); central.writeUInt32LE(offset,42)
    centralParts.push(central,name); offset += local.length + name.length + data.length
  }
  const centralSize = centralParts.reduce((sum,part)=>sum+part.length,0), end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50,0); end.writeUInt16LE(0,4); end.writeUInt16LE(0,6); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(centralSize,12); end.writeUInt32LE(offset,16); end.writeUInt16LE(0,20)
  return Buffer.concat([...localParts,...centralParts,end])
}

async function readImage(url) {
  const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),15000)
  try {
    const response = await fetch(url,{signal:controller.signal,redirect:'follow',headers:{'user-agent':UA,accept:'image/*'}})
    if(!response.ok) throw new Error(`HTTP ${response.status}`)
    const type=String(response.headers.get('content-type')||'').split(';')[0].toLowerCase(), extMap={'image/jpeg':'jpg','image/png':'png','image/webp':'webp','image/gif':'gif'}, extension=extMap[type]
    if(!extension||!response.body) throw new Error('Unsupported image type')
    const declared=Number(response.headers.get('content-length')||0); if(declared>MAX_IMAGE_BYTES) throw new Error('Image too large')
    const reader=response.body.getReader(), chunks=[]; let size=0
    while(true){const {done,value}=await reader.read(); if(done)break; size+=value.byteLength; if(size>MAX_IMAGE_BYTES){await reader.cancel(); throw new Error('Image too large')} chunks.push(Buffer.from(value))}
    return{buffer:Buffer.concat(chunks),extension}
  } finally { clearTimeout(timer) }
}

export async function buildReferenceZip(packId, selectedIds = []) {
  const pack=getReferencePack(packId); if(!pack) throw new Error('Reference pack expired or not found.')
  const wanted=new Set(selectedIds.filter(Boolean)), candidates=pack.images.filter(image=>image.downloadAllowed&&(!wanted.size||wanted.has(image.id))).slice(0,MAX_PACK_IMAGES)
  if(!candidates.length) throw new Error('No redistributable reference images selected.')
  const entries=[],manifest=[],angleCounters=new Map(); let totalBytes=0
  for(const image of candidates){
    try{
      const fetched=await readImage(image.imageUrl); if(totalBytes+fetched.buffer.length>MAX_PACK_BYTES)break; totalBytes+=fetched.buffer.length
      const count=(angleCounters.get(image.angle)||0)+1; angleCounters.set(image.angle,count)
      const folder=safeFilePart(image.angleLabel||image.angle).toUpperCase(), name=`${folder}/${String(count).padStart(2,'0')}_${safeFilePart(image.title)}.${fetched.extension}`
      entries.push({name,data:fetched.buffer})
      manifest.push([name,`Title: ${image.title}`,`Angle: ${image.angleLabel}`,`Match: ${image.matchLevel||'unknown'}`,`Creator: ${image.creator}`,`License: ${image.license}${image.licenseVersion?` ${image.licenseVersion}`:''}`,`License URL: ${image.licenseUrl||'Not provided'}`,`Source page: ${image.sourcePage}`,`Original image: ${image.imageUrl}`].join('\n'))
    }catch(error){manifest.push(`SKIPPED: ${image.title}\nReason: ${error instanceof Error?error.message:'download failed'}\nSource page: ${image.sourcePage}`)}
  }
  if(!entries.length) throw new Error('The selected source images could not be downloaded.')
  const readme=`VJ REFERENCE PACK\nVehicle: ${pack.title}\nSearch: ${pack.query}\nGenerated: ${new Date().toISOString()}\nIncluded images: ${entries.length}\n\nThis pack contains only images the VJ classified as redistributable from their published license metadata. Always verify attribution/license requirements at the original source before publishing or redistributing your work.\n\n${manifest.join('\n\n---\n\n')}\n`
  entries.push({name:'sources.txt',data:Buffer.from(readme,'utf8')})
  return{buffer:makeZip(entries),filename:`${safeFilePart(pack.title)}_VJ_Reference_Pack.zip`,included:entries.length-1}
}
