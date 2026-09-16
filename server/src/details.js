import * as cheerio from 'cheerio'
import { providers } from './providers.js'

const USER_AGENT = 'VJ3DSearch/0.4 (+https://github.com/vyiito/car3d-search)'
const DIRECT_FILE_RE = /\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|kn5|skp|ma|mb|step|stp|dwg|dxf|unitypackage)(?:$|[?#])/i
const FORMAT_RE = /\b(blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|step|stp|dwg|dxf|unitypackage|kn5|zip|rar|7z)\b/gi
const FILE_SIZE_RE = /\b\d+(?:[.,]\d+)?\s?(?:KB|MB|GB|TB)\b/i
const YEAR_RE = /\b(19[3-9]\d|20[0-3]\d)\b/
const DOWNLOAD_TEXT_RE = /\b(download|baixar|descargar|scarica|télécharger|get\s+(?:file|model)|free\s+download)\b/i
const LICENSE_RE = /\b(CC0|CC BY(?:-SA|-NC|-ND)?(?: \d\.\d)?|Creative Commons|Royalty[- ]Free|Editorial|Personal Use|Non[- ]Commercial|MIT License|GPL|Public Domain)\b/i

const clean = value => String(value || '').replace(/\s+/g, ' ').trim()

function absoluteUrl(value, base) {
  if (!value) return null
  try { return new URL(value, base).href } catch { return null }
}

function parseFormats(text) {
  return [...new Set((String(text || '').match(FORMAT_RE) || []).map(value => value.toUpperCase()))].slice(0, 16)
}

function safeProviderUrl(provider, value) {
  try {
    const target = new URL(value)
    const base = new URL(provider.baseUrl)
    if (!['http:', 'https:'].includes(target.protocol)) return false
    const baseHost = base.hostname.replace(/^www\./, '')
    const targetHost = target.hostname.replace(/^www\./, '')
    return targetHost === baseHost || targetHost.endsWith(`.${baseHost}`)
  } catch {
    return false
  }
}

async function fetchHtml(url, timeoutMs = 12000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': USER_AGENT,
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en-US,en;q=0.9,pt-BR;q=0.8',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const type = response.headers.get('content-type') || ''
    if (!type.includes('text/html') && !type.includes('application/xhtml+xml')) throw new Error('Not an HTML page')
    return { html: await response.text(), finalUrl: response.url || url }
  } finally {
    clearTimeout(timer)
  }
}

function jsonLdObjects($) {
  const objects = []
  $('script[type="application/ld+json"]').each((_, element) => {
    try {
      const parsed = JSON.parse($(element).text())
      const values = Array.isArray(parsed) ? parsed : [parsed]
      for (const value of values) {
        if (value?.['@graph'] && Array.isArray(value['@graph'])) objects.push(...value['@graph'])
        else objects.push(value)
      }
    } catch {}
  })
  return objects.filter(Boolean)
}

function collectImages($, baseUrl) {
  const urls = []
  const add = value => {
    const url = absoluteUrl(value, baseUrl)
    if (!url || url.startsWith('data:') || urls.includes(url)) return
    if (/logo|avatar|icon|emoji|sprite/i.test(url)) return
    urls.push(url)
  }

  add($('meta[property="og:image"]').attr('content'))
  add($('meta[name="twitter:image"]').attr('content'))

  for (const object of jsonLdObjects($)) {
    const image = object?.image
    if (typeof image === 'string') add(image)
    else if (Array.isArray(image)) image.forEach(item => add(typeof item === 'string' ? item : item?.url))
    else if (image?.url) add(image.url)
  }

  const selectors = ['.gallery img', '.swiper img', '.carousel img', 'article img', 'main img', '.content img', '.product img', '.model img']
  for (const selector of selectors) {
    $(selector).each((_, element) => {
      const node = $(element)
      const srcset = node.attr('srcset')?.split(',').pop()?.trim().split(' ')[0]
      add(node.attr('data-full') || node.attr('data-src') || node.attr('data-original') || srcset || node.attr('src'))
    })
    if (urls.length >= 10) break
  }

  if (urls.length < 2) {
    $('img').each((_, element) => {
      const node = $(element)
      add(node.attr('data-src') || node.attr('data-original') || node.attr('src'))
    })
  }

  return urls.slice(0, 10)
}

function collectDownloadCandidates($, baseUrl) {
  const map = new Map()
  const add = (rawUrl, label, kindHint = null) => {
    const url = absoluteUrl(rawUrl, baseUrl)
    if (!url || !/^https?:/i.test(url)) return
    const labelText = clean(label) || 'Download'
    const direct = DIRECT_FILE_RE.test(url) || kindHint === 'direct'
    const kind = direct ? 'direct' : 'action'
    const current = map.get(url)
    if (!current || (kind === 'direct' && current.kind !== 'direct')) map.set(url, { url, label: labelText.slice(0, 90), kind })
  }

  $('a[href]').each((_, element) => {
    const node = $(element)
    const href = node.attr('href') || ''
    const text = clean(`${node.text()} ${node.attr('title') || ''} ${node.attr('aria-label') || ''}`)
    if (DIRECT_FILE_RE.test(href)) add(href, text || 'Arquivo', 'direct')
    else if (node.is('[download]')) add(href, text || 'Download', 'direct')
    else if (DOWNLOAD_TEXT_RE.test(text) || /download/i.test(href)) add(href, text || 'Download')
  })

  $('[data-download-url],[data-download],[data-file-url],[data-url]').each((_, element) => {
    const node = $(element)
    const text = clean(`${node.text()} ${node.attr('title') || ''} ${node.attr('aria-label') || ''}`)
    for (const attr of ['data-download-url', 'data-download', 'data-file-url', 'data-url']) {
      const value = node.attr(attr)
      if (value && (DIRECT_FILE_RE.test(value) || DOWNLOAD_TEXT_RE.test(text))) add(value, text || 'Download', DIRECT_FILE_RE.test(value) ? 'direct' : null)
    }
  })

  return [...map.values()].slice(0, 12)
}

function pageMetadata($, baseUrl) {
  const bodyText = clean($('body').text())
  const jsonLd = jsonLdObjects($)
  const productLike = jsonLd.find(item => /product|creativework|3dmodel|mediaobject/i.test(String(item?.['@type'] || ''))) || jsonLd[0]
  const title = clean(
    $('meta[property="og:title"]').attr('content') ||
    productLike?.name ||
    $('h1').first().text() ||
    $('title').text()
  )
  const description = clean(
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    productLike?.description ||
    $('.description,.product-description,.model-description,.entry-content,.post-content').first().text()
  ).slice(0, 1800) || null
  const author = clean(
    productLike?.author?.name || productLike?.creator?.name ||
    $('[rel="author"],.author,.username,.creator,.byline').first().text()
  ).replace(/^by\s+/i, '').slice(0, 120) || null
  const license = clean(productLike?.license || bodyText.match(LICENSE_RE)?.[0]).slice(0, 120) || null
  const formats = parseFormats(`${bodyText} ${JSON.stringify(jsonLd).slice(0, 10000)}`)
  const fileSize = bodyText.match(FILE_SIZE_RE)?.[0] || null
  const yearMatch = `${title} ${bodyText.slice(0, 2500)}`.match(YEAR_RE)

  return {
    title: title || null,
    description,
    author,
    license,
    formats,
    fileSize,
    year: yearMatch ? Number(yearMatch[1]) : null,
    gallery: collectImages($, baseUrl),
  }
}

async function resolveNestedDirect(provider, sourceUrl, candidates) {
  const direct = candidates.find(candidate => candidate.kind === 'direct')
  if (direct) return { direct, candidates }

  const sameHostActions = candidates
    .filter(candidate => candidate.kind === 'action' && safeProviderUrl(provider, candidate.url) && candidate.url !== sourceUrl)
    .slice(0, 2)

  for (const action of sameHostActions) {
    try {
      const { html, finalUrl } = await fetchHtml(action.url, 9000)
      const $ = cheerio.load(html)
      const nested = collectDownloadCandidates($, finalUrl)
      const nestedDirect = nested.find(candidate => candidate.kind === 'direct')
      if (nestedDirect) {
        return {
          direct: nestedDirect,
          candidates: [...candidates, ...nested].filter((item, index, all) => all.findIndex(other => other.url === item.url) === index).slice(0, 12),
        }
      }
    } catch {}
  }

  return { direct: null, candidates }
}

export async function getResultDetails(sourceId, sourceUrl) {
  const provider = providers.find(item => item.id === sourceId)
  if (!provider) throw new Error('Unknown provider')
  if (!safeProviderUrl(provider, sourceUrl)) throw new Error('URL is outside provider host')

  const { html, finalUrl } = await fetchHtml(sourceUrl)
  const $ = cheerio.load(html)
  $('script:not([type="application/ld+json"]),style,noscript,svg').remove()

  const metadata = pageMetadata($, finalUrl)
  const initialCandidates = collectDownloadCandidates($, finalUrl)
  const resolved = await resolveNestedDirect(provider, finalUrl, initialCandidates)
  const action = resolved.candidates.find(candidate => candidate.kind === 'action') || null

  return {
    sourceId: provider.id,
    source: provider.name,
    sourceUrl: finalUrl,
    ...metadata,
    imageUrl: metadata.gallery[0] || null,
    downloadUrl: resolved.direct?.url || null,
    downloadActionUrl: action?.url || null,
    downloadStatus: resolved.direct ? 'direct' : action ? 'source' : 'unavailable',
    downloadCandidates: resolved.candidates,
    detailsFetchedAt: new Date().toISOString(),
  }
}
