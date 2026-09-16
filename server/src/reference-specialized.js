import { load } from 'cheerio'
import crypto from 'node:crypto'

const UA = 'VJ3DSearch/4.1 (+https://github.com/vyiito/car3d-search)'
const REQUEST_TIMEOUT_MS = 6500
const MAX_SPECIALIZED_IMAGES = 72

const ANGLE_RULES = [
  ['interior-dashboard', /\b(?:dashboard|dash board|instrument panel)\b/i],
  ['interior-cockpit', /\b(?:cockpit|driver.?s view|driving position)\b/i],
  ['interior-steering-wheel', /\b(?:steering wheel)\b/i],
  ['interior-cluster', /\b(?:instrument cluster|gauge cluster|gauges|speedometer|tachometer)\b/i],
  ['interior-console', /\b(?:center console|centre console|shifter|gear selector)\b/i],
  ['interior-seats', /\b(?:seat|seats|rear bench)\b/i],
  ['interior-door', /\b(?:door panel|door card)\b/i],
  ['interior-trunk', /\b(?:trunk|boot|cargo area|luggage compartment)\b/i],
  ['engine-bay', /\b(?:engine bay|engine compartment|under[- ]?hood|under[- ]?bonnet)\b/i],
  ['underbody', /\b(?:underbody|underside|under carriage|undercarriage|chassis underside)\b/i],
  ['suspension', /\b(?:suspension|control arm|subframe|strut|shock absorber)\b/i],
  ['brake', /\b(?:brake|caliper|disc|rotor)\b/i],
  ['wheel', /\b(?:wheel|rim|alloy|tire|tyre)\b/i],
  ['detail-headlight', /\b(?:headlight|headlamp|front light)\b/i],
  ['detail-taillight', /\b(?:taillight|tail light|rear light)\b/i],
  ['detail-grille', /\b(?:grille|grill)\b/i],
  ['detail-mirror', /\b(?:mirror|wing mirror|side mirror)\b/i],
  ['detail-handle', /\b(?:door handle|handle detail)\b/i],
  ['detail-badge', /\b(?:badge|emblem|logo detail)\b/i],
  ['detail-exhaust', /\b(?:exhaust|tailpipe|muffler)\b/i],
  ['detail-spoiler', /\b(?:spoiler|wing detail)\b/i],
  ['detail-diffuser', /\b(?:diffuser)\b/i],
  ['top', /\b(?:top view|overhead|bird.?s eye|roof view)\b/i],
  ['front-left-three-quarter', /\b(?:front left|front-left|left front).*(?:three[- ]?quarter|3\s*\/\s*4|¾)|(?:three[- ]?quarter|3\s*\/\s*4|¾).*(?:front left|front-left|left front)\b/i],
  ['front-right-three-quarter', /\b(?:front right|front-right|right front).*(?:three[- ]?quarter|3\s*\/\s*4|¾)|(?:three[- ]?quarter|3\s*\/\s*4|¾).*(?:front right|front-right|right front)\b/i],
  ['rear-left-three-quarter', /\b(?:rear left|rear-left|left rear).*(?:three[- ]?quarter|3\s*\/\s*4|¾)|(?:three[- ]?quarter|3\s*\/\s*4|¾).*(?:rear left|rear-left|left rear)\b/i],
  ['rear-right-three-quarter', /\b(?:rear right|rear-right|right rear).*(?:three[- ]?quarter|3\s*\/\s*4|¾)|(?:three[- ]?quarter|3\s*\/\s*4|¾).*(?:rear right|rear-right|right rear)\b/i],
  ['front-three-quarter', /\b(?:front three[- ]?quarter|front 3\s*\/\s*4|front ¾|front quarter)\b/i],
  ['rear-three-quarter', /\b(?:rear three[- ]?quarter|rear 3\s*\/\s*4|rear ¾|rear quarter)\b/i],
  ['left-side', /\b(?:left side|driver side|left profile)\b/i],
  ['right-side', /\b(?:right side|passenger side|right profile)\b/i],
  ['front', /\b(?:front view|front angle|frontal|front exterior|front$)\b/i],
  ['rear', /\b(?:rear view|rear angle|back view|rear exterior|rear$)\b/i],
  ['side', /\b(?:side view|side profile|profile view|lateral|side exterior|side$)\b/i],
  ['three-quarter', /\b(?:three[- ]?quarter|3\s*\/\s*4|¾)\b/i],
  ['interior', /\b(?:interior|cabin)\b/i],
  ['engine', /\b(?:engine|motor)\b/i],
  ['details', /\b(?:detail|close[- ]?up)\b/i],
]

const ANGLE_LABELS = {
  front: 'FRONT', rear: 'REAR', side: 'SIDE', 'left-side': 'LEFT SIDE', 'right-side': 'RIGHT SIDE',
  'three-quarter': '3/4', 'front-three-quarter': 'FRONT 3/4', 'rear-three-quarter': 'REAR 3/4',
  'front-left-three-quarter': 'FRONT 3/4 L', 'front-right-three-quarter': 'FRONT 3/4 R',
  'rear-left-three-quarter': 'REAR 3/4 L', 'rear-right-three-quarter': 'REAR 3/4 R', top: 'TOP',
  interior: 'INTERIOR', 'interior-dashboard': 'DASHBOARD', 'interior-cockpit': 'COCKPIT',
  'interior-steering-wheel': 'STEERING', 'interior-cluster': 'CLUSTER', 'interior-console': 'CONSOLE',
  'interior-seats': 'SEATS', 'interior-door': 'DOOR PANEL', 'interior-trunk': 'TRUNK',
  wheel: 'WHEEL', brake: 'BRAKE', engine: 'ENGINE', 'engine-bay': 'ENGINE BAY', suspension: 'SUSPENSION',
  underbody: 'UNDERBODY', 'detail-headlight': 'HEADLIGHT', 'detail-taillight': 'TAILLIGHT',
  'detail-grille': 'GRILLE', 'detail-mirror': 'MIRROR', 'detail-handle': 'HANDLE', 'detail-badge': 'BADGE',
  'detail-exhaust': 'EXHAUST', 'detail-spoiler': 'SPOILER', 'detail-diffuser': 'DIFFUSER', details: 'DETAILS',
  reference: 'REFERENCE',
}

const clean = value => String(value || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/gi, ' ').replace(/&amp;/gi, '&').replace(/\s+/g, ' ').trim()
const norm = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[‐‑‒–—]/g, '-').replace(/[^a-z0-9-]+/g, ' ').replace(/\s+/g, ' ').trim()
const slug = value => norm(value).replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '')
const uniqBy = (items, keyFn) => { const seen = new Set(); return items.filter(item => { const key = keyFn(item); if (!key || seen.has(key)) return false; seen.add(key); return true }) }
const idFor = value => `special-${crypto.createHash('sha1').update(String(value)).digest('hex').slice(0, 18)}`

function absoluteUrl(value, base) {
  try { const url = new URL(String(value || ''), base); return ['http:', 'https:'].includes(url.protocol) ? url.href : null } catch { return null }
}

function largestFromSrcset(value, base) {
  const entries = String(value || '').split(',').map(part => part.trim()).filter(Boolean).map(part => {
    const [url, descriptor = ''] = part.split(/\s+/)
    const width = Number(descriptor.replace(/[^0-9.]/g, '')) || 0
    return { url: absoluteUrl(url, base), width }
  }).filter(item => item.url)
  return entries.sort((a, b) => b.width - a.width)[0]?.url || null
}

async function fetchHtml(url, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const response = await fetch(url, { signal: controller.signal, redirect: 'follow', headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return { html: await response.text(), finalUrl: response.url || url }
  } finally { clearTimeout(timer) }
}

function generationCodesForIdentity(identity) {
  return (identity?.generationCodes || []).filter(code => norm(code) !== norm(identity?.primaryModel))
}

function generationAliases(code) {
  const key = norm(code).replace(/\s+/g, '')
  const aliases = {
    mk4: ['mk4','mk iv','a80','jza80'], jza80: ['jza80','a80','mk4','mk iv'], a80: ['a80','jza80','mk4','mk iv'],
    mk3: ['mk3','mk iii','a70','ma70','jza70'], a70: ['a70','ma70','jza70','mk3','mk iii'],
    r34: ['r34','bnr34','er34'], r33: ['r33','bcnr33','er33'], r32: ['r32','bnr32','hcr32'],
    e46: ['e46'], e36: ['e36'], e92: ['e92'], e90: ['e90'], f80: ['f80'], g80: ['g80'],
    fd3s: ['fd3s','fd'], na1: ['na1'], na2: ['na2'], gc8: ['gc8'], jza70: ['jza70','a70','mk3','mk iii'],
  }
  return aliases[key] || [code]
}

function hasGenerationEvidence(identity, text) {
  const haystack = ` ${norm(text)} `
  const codes = generationCodesForIdentity(identity)
  if (!codes.length) return false
  return codes.some(code => generationAliases(code).some(alias => {
    const needle = norm(alias)
    return needle && haystack.includes(` ${needle} `)
  }))
}

function specializedContextVerified(identity, text) {
  const normalized = norm(text)
  const years = [...normalized.matchAll(/\b(19[3-9]\d|20[0-3]\d)\b/g)].map(match => Number(match[1]))
  const codes = generationCodesForIdentity(identity)
  if (identity?.yearTrusted && identity?.year) {
    if (years.length) return years.some(value => Math.abs(value - identity.year) <= 1)
    if (codes.length) return hasGenerationEvidence(identity, normalized)
    return false
  }
  if (codes.length) return hasGenerationEvidence(identity, normalized)
  return true
}

function scoreIdentityText(identity, text) {
  const haystack = norm(text)
  if (!identity?.primaryModel || !haystack.includes(norm(identity.primaryModel))) return 0
  let score = 6
  if (identity.brand && haystack.includes(norm(identity.brand))) score += 4
  for (const token of identity.supporting || []) if (token.length > 1 && haystack.includes(norm(token))) score += 2
  for (const code of generationCodesForIdentity(identity)) if (hasGenerationEvidence({ ...identity, generationCodes: [code] }, haystack)) score += 3
  if (identity.yearTrusted && identity.year && new RegExp(`\b${identity.year}\b`).test(haystack)) score += 4
  return score
}

function classifyAngle(text) {
  const evidence = clean(text)
  for (const [id, re] of ANGLE_RULES) if (re.test(evidence)) return { id, label: ANGLE_LABELS[id] || id.toUpperCase(), confidence: 'metadata' }
  return { id: 'reference', label: 'REFERENCE', confidence: 'fallback' }
}

function modelingGroup(angle) {
  if (/^interior/.test(angle)) return 'interior'
  if (/^(engine|engine-bay|suspension|underbody|brake)$/.test(angle)) return 'mechanical'
  if (/^(detail-|wheel|details)/.test(angle)) return 'details'
  if (/^blueprint|dimensions|technical/.test(angle)) return 'technical'
  if (/front|rear|side|three-quarter|top|roof/.test(angle)) return 'exterior'
  return 'reference'
}

function providerRecord({ provider, sourcePage, imageUrl, thumbnailUrl, title, evidence, galleryTitle }) {
  const angle = classifyAngle(`${title} ${evidence}`)
  return {
    id: idFor(`${provider}|${imageUrl}|${sourcePage}`), angle: angle.id, angleLabel: angle.label, angleConfidence: angle.confidence,
    title: clean(title) || clean(galleryTitle) || provider, imageUrl, thumbnailUrl: thumbnailUrl || imageUrl, sourcePage,
    source: provider, provider: provider.toLowerCase().replace(/[^a-z0-9]+/g, '-'), creator: provider, creatorUrl: sourcePage,
    license: 'REFERENCE ONLY', licenseVersion: null, licenseUrl: null, width: null, height: null, downloadAllowed: false,
    redistributionNote: 'Reference-only source. Open the original page for usage terms and high-resolution access.',
    matchLevel: 'specialized-gallery', identityScore: 0, sourceKind: 'specialized', modelingGroup: modelingGroup(angle.id), galleryTitle: clean(galleryTitle) || null,
  }
}

function extractImages(html, pageUrl, provider, identity, max = 36) {
  const $ = load(html)
  const pageTitle = clean($('h1').first().text() || $('title').text())
  const pageDescription = clean($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content'))
  const pageEvidence = `${pageTitle} ${pageDescription} ${pageUrl}`
  const pageScore = scoreIdentityText(identity, pageEvidence)
  if (pageScore < 6 || !specializedContextVerified(identity, pageEvidence)) return []
  const rows = []
  $('img').each((_index, node) => {
    if (rows.length >= max * 3) return
    const image = $(node)
    const alt = clean(image.attr('alt') || image.attr('title'))
    const srcset = image.attr('srcset') || image.attr('data-srcset')
    const thumbnail = absoluteUrl(image.attr('data-src') || image.attr('data-lazy-src') || image.attr('data-original') || image.attr('src'), pageUrl)
    const fromSrcset = largestFromSrcset(srcset, pageUrl)
    const anchor = image.closest('a')
    const href = absoluteUrl(anchor.attr('href'), pageUrl)
    const imageUrl = href && /\.(?:jpe?g|png|webp)(?:\?|$)/i.test(href) ? href : (fromSrcset || thumbnail)
    if (!imageUrl || !/^https?:/i.test(imageUrl)) return
    const nearby = clean(`${image.closest('figure').find('figcaption').text()} ${image.closest('li').text().slice(0, 300)} ${image.parent().text().slice(0, 260)}`)
    const evidence = clean(`${alt} ${anchor.attr('title') || ''} ${nearby} ${imageUrl}`)
    if (/logo|icon|avatar|sprite|flag|banner|advert|placeholder/i.test(`${evidence} ${imageUrl}`)) return
    const identityEvidence = scoreIdentityText(identity, `${pageEvidence} ${evidence}`)
    if (identityEvidence < 6) return
    rows.push(providerRecord({ provider, sourcePage: pageUrl, imageUrl, thumbnailUrl: thumbnail || imageUrl, title: alt || pageTitle, evidence, galleryTitle: pageTitle }))
  })
  const og = absoluteUrl($('meta[property="og:image"]').attr('content'), pageUrl)
  if (og) rows.push(providerRecord({ provider, sourcePage: pageUrl, imageUrl: og, thumbnailUrl: og, title: pageTitle, evidence: pageEvidence, galleryTitle: pageTitle }))
  return uniqBy(rows, item => norm(item.imageUrl)).slice(0, max)
}

function rankedLinks(html, baseUrl, identity, predicate, max = 3) {
  const $ = load(html)
  const rows = []
  $('a[href]').each((_index, node) => {
    const anchor = $(node)
    const href = absoluteUrl(anchor.attr('href'), baseUrl)
    if (!href || (predicate && !predicate(href))) return
    const text = clean(`${anchor.text()} ${anchor.attr('title') || ''} ${anchor.find('img').attr('alt') || ''} ${href}`)
    const score = scoreIdentityText(identity, text)
    if (score >= 6 && specializedContextVerified(identity, text)) rows.push({ href, text, score })
  })
  return uniqBy(rows.sort((a, b) => b.score - a.score), item => item.href).slice(0, max)
}

async function searchCaricos(identity) {
  if (!identity.brand || !identity.primaryModel) return []
  const brandSlug = slug(identity.brand), catalog = `https://www.caricos.com/cars/${brandSlug}.html`
  const { html, finalUrl } = await fetchHtml(catalog)
  const links = rankedLinks(html, finalUrl, identity, href => /caricos\.com\/cars\//i.test(href) && !href.endsWith(`${brandSlug}.html`), 2)
  const pages = await Promise.all(links.map(async link => { try { const page = await fetchHtml(link.href); return extractImages(page.html, page.finalUrl, 'Caricos', identity, 34) } catch { return [] } }))
  return pages.flat()
}

async function searchNetCarShow(identity) {
  if (!identity.brand || !identity.primaryModel) return []
  const brandSlug = slug(identity.brand), catalog = `https://www.netcarshow.com/${brandSlug}/`
  const { html, finalUrl } = await fetchHtml(catalog)
  const links = rankedLinks(html, finalUrl, identity, href => new RegExp(`netcarshow\\.com/${brandSlug}/`, 'i').test(href) && !href.replace(/\/$/, '').endsWith(`/${brandSlug}`), 2)
  const pages = await Promise.all(links.map(async link => { try { const page = await fetchHtml(link.href); return extractImages(page.html, page.finalUrl, 'NetCarShow', identity, 28) } catch { return [] } }))
  return pages.flat()
}

async function searchCarsAndBids(identity) {
  if (!identity.brand || !identity.primaryModel || identity.vehicleKind !== 'car') return []
  const searchUrl = `https://carsandbids.com/search/${slug(identity.brand)}/${slug(identity.primaryModel)}`
  const { html, finalUrl } = await fetchHtml(searchUrl)
  const links = rankedLinks(html, finalUrl, identity, href => /carsandbids\.com\/auctions\//i.test(href), 2)
  const pages = await Promise.all(links.map(async link => { try { const page = await fetchHtml(link.href); return extractImages(page.html, page.finalUrl, 'Cars & Bids', identity, 34) } catch { return [] } }))
  return pages.flat()
}

async function searchBringATrailer(identity) {
  if (!identity.primaryModel || identity.vehicleKind !== 'car') return []
  const searchUrl = `https://bringatrailer.com/?s=${encodeURIComponent(identity.canonical || identity.display)}`
  const { html, finalUrl } = await fetchHtml(searchUrl)
  const links = rankedLinks(html, finalUrl, identity, href => /bringatrailer\.com\/listing\//i.test(href), 2)
  const pages = await Promise.all(links.map(async link => { try { const page = await fetchHtml(link.href); return extractImages(page.html, page.finalUrl, 'Bring a Trailer', identity, 30) } catch { return [] } }))
  return pages.flat()
}

const OFFICIAL_MEDIA = {
  toyota: { label: 'TOYOTA NEWSROOM', url: 'https://pressroom.toyota.com/' }, lexus: { label: 'LEXUS NEWSROOM', url: 'https://pressroom.lexus.com/' },
  bmw: { label: 'BMW PRESSCLUB', url: 'https://www.press.bmwgroup.com/global/photo' }, mini: { label: 'MINI PRESSCLUB', url: 'https://www.press.bmwgroup.com/global/photo' },
  'mercedes-benz': { label: 'MERCEDES MEDIA', url: 'https://media.mercedes-benz.com/' }, mercedes: { label: 'MERCEDES MEDIA', url: 'https://media.mercedes-benz.com/' },
  porsche: { label: 'PORSCHE NEWSROOM', url: 'https://newsroom.porsche.com/' }, ford: { label: 'FORD MEDIA', url: 'https://media.ford.com/' },
  honda: { label: 'HONDA NEWS', url: 'https://hondanews.com/' }, acura: { label: 'ACURA NEWS', url: 'https://acuranews.com/' },
  nissan: { label: 'NISSAN GLOBAL', url: 'https://global.nissannews.com/' }, infiniti: { label: 'INFINITI NEWS', url: 'https://usa.infinitinews.com/' },
  subaru: { label: 'SUBARU MEDIA', url: 'https://media.subaru.com/' }, mazda: { label: 'MAZDA NEWSROOM', url: 'https://news.mazdausa.com/' },
  hyundai: { label: 'HYUNDAI NEWS', url: 'https://www.hyundainews.com/' }, kia: { label: 'KIA MEDIA', url: 'https://www.kiamedia.com/' },
  volkswagen: { label: 'VW NEWSROOM', url: 'https://www.volkswagen-newsroom.com/' }, audi: { label: 'AUDI MEDIACENTER', url: 'https://www.audi-mediacenter.com/' },
  ferrari: { label: 'FERRARI MEDIA', url: 'https://www.ferrari.com/en-EN/corporate/media-centre' }, lamborghini: { label: 'LAMBORGHINI MEDIA', url: 'https://media.lamborghini.com/' },
}

export function specializedSearchLinks(identity) {
  const query = encodeURIComponent(identity.display), model = encodeURIComponent(identity.primaryModel || identity.modelDisplay || identity.display), brandSlug = slug(identity.brand || '')
  const links = [
    { id: 'caricos', label: 'CARICOS', url: brandSlug ? `https://www.caricos.com/cars/${brandSlug}.html` : `https://www.google.com/search?q=site%3Acaricos.com+${query}`, kind: 'gallery' },
    { id: 'netcarshow', label: 'NETCARSHOW', url: brandSlug ? `https://www.netcarshow.com/${brandSlug}/` : `https://www.google.com/search?q=site%3Anetcarshow.com+${query}`, kind: 'gallery' },
    { id: 'wheelsage', label: 'WHEELSAGE', url: `https://www.google.com/search?q=site%3Awheelsage.org+${query}`, kind: 'archive' },
    { id: 'carsandbids', label: 'CARS & BIDS', url: identity.vehicleKind === 'car' && brandSlug ? `https://carsandbids.com/search/${brandSlug}/${encodeURIComponent(slug(identity.primaryModel || ''))}` : `https://carsandbids.com/`, kind: 'detail' },
    { id: 'bringatrailer', label: 'BRING A TRAILER', url: `https://bringatrailer.com/?s=${encodeURIComponent(identity.canonical || identity.display)}`, kind: 'detail' },
    { id: 'blueprints', label: 'THE BLUEPRINTS', url: `https://www.the-blueprints.com/vectordrawings/search/${model}/year/`, kind: 'technical' },
    { id: 'vehicle-reference', label: 'VEHICLE REFERENCE IMAGES', url: 'https://www.vehicle-referenceimages.com/', kind: 'professional' },
  ]
  const official = OFFICIAL_MEDIA[slug(identity.brand || '')]
  if (official) links.unshift({ id: 'official-media', ...official, kind: 'official' })
  return links
}

export async function searchSpecializedReferences(identity, options = {}) {
  const enabled = options.specialized !== false
  if (!enabled || !identity?.primaryModel) return { images: [], sourceStatus: [] }
  const providers = [['Caricos', searchCaricos], ['NetCarShow', searchNetCarShow], ['Cars & Bids', searchCarsAndBids], ['Bring a Trailer', searchBringATrailer]]
  const settled = await Promise.all(providers.map(async ([name, fn]) => {
    const started = Date.now()
    try { const images = await fn(identity); return { name, status: 'ok', count: images.length, durationMs: Date.now() - started, images } }
    catch (error) { return { name, status: 'error', count: 0, durationMs: Date.now() - started, error: error instanceof Error ? error.message : 'failed', images: [] } }
  }))
  const images = uniqBy(settled.flatMap(row => row.images), item => norm(item.imageUrl || item.sourcePage)).slice(0, MAX_SPECIALIZED_IMAGES)
  return { images, sourceStatus: settled.map(({ images: _images, ...status }) => status) }
}

export function modelingCoverage(images = []) {
  const groups = { exterior: 0, details: 0, interior: 0, mechanical: 0, technical: 0, reference: 0 }
  for (const image of images) {
    const group = image.modelingGroup && Object.prototype.hasOwnProperty.call(groups, image.modelingGroup) ? image.modelingGroup : modelingGroup(image.angle)
    groups[group] = (groups[group] || 0) + 1
  }
  const target = { exterior: 10, details: 10, interior: 7, mechanical: 4, technical: 4 }
  let earned = 0, possible = 0
  const weights = { exterior: 40, details: 20, interior: 18, mechanical: 12, technical: 10 }
  for (const key of Object.keys(target)) { earned += Math.min(1, (groups[key] || 0) / target[key]) * weights[key]; possible += weights[key] }
  return { groups, targets: target, readiness: possible ? Math.round((earned / possible) * 100) : 0 }
}
