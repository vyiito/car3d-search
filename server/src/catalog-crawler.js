import * as cheerio from 'cheerio'
import { searchFetch, searchPageLimit, searchCheckpoint } from './search-context.js'
import { prepareResults } from './search-core.js'

export function sameCatalogHost(url, base) {
  try { return ['http:', 'https:'].includes(new URL(url).protocol) && new URL(url).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '') } catch { return false }
}

export function nextCatalogPages(html, currentUrl) {
  const $ = cheerio.load(html), next = new Map()
  const current = new URL(currentUrl)
  const currentPage = Number(current.searchParams.get('page') || current.searchParams.get('paged') || current.pathname.match(/(?:\/page\/|-page|page-)(\d+)/i)?.[1] || 1)
  $('a[href],link[rel="next"]').each((_, el) => {
    const node = $(el)
    let url
    try { url = new URL(node.attr('href'), currentUrl); url.hash = '' } catch { return }
    if (!sameCatalogHost(url.href, currentUrl) || url.href === current.href) return
    const rel = node.attr('rel') || '', label = `${node.text()} ${node.attr('aria-label') || ''} ${node.attr('title') || ''}`.trim()
    const page = Number(url.searchParams.get('page') || url.searchParams.get('paged') || url.pathname.match(/(?:\/page\/|-page|page-)(\d+)/i)?.[1] || 0)
    const forward = /\bnext\b|older posts|próxim|proxim|›|»|→/i.test(label) || rel.includes('next')
    const blogger = url.searchParams.has('updated-max') || url.searchParams.has('start-index')
    if (!forward && !blogger && !(page > currentPage)) return
    // A page link must stay in this collection/search, not switch to a sidebar.
    const stem = value => value.pathname.replace(/(?:\/page\/\d+\/?|-page\d+|\/filter\/page-\d+)$/i, '').replace(/\/$/, '')
    if (stem(url) !== stem(current) && !blogger) return
    for (const [key, value] of current.searchParams) {
      if (/^(?:q|s|query|search|searchkeyword|keywords|search-term|search_keywords|category|sort|type|features)$/i.test(key) && !url.searchParams.has(key)) url.searchParams.set(key, value)
    }
    const score = forward || blogger ? 0 : page
    if (!next.has(url.href) || score < next.get(url.href)) next.set(url.href, score)
  })
  return [...next].sort((a, b) => a[1] - b[1]).map(([url]) => url)
}

export async function fetchCatalogPage(url, options = {}) {
  const response = await searchFetch(url, { ...options, signal: options.signal || AbortSignal.timeout(12000), headers: { 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)', accept: 'text/html,application/xhtml+xml', ...options.headers } })
  if (!response.ok || response.status === 202) throw new Error(`HTTP ${response.status}: a fonte não forneceu o catálogo.`)
  const html = await response.text()
  if (/<title>\s*(?:just a moment|access denied|attention required)/i.test(html) || /cf-chl-(?:widget|managed|opt)/i.test(html)) throw new Error('A fonte bloqueou a consulta automática.')
  return { html, finalUrl: response.url || String(url) }
}

// Breadth first: each section gets a first page before any section gets a
// second. Count matching unique models, not irrelevant cards or duplicates.
export async function crawlCatalog({ seeds, query, limit = 60, provider, parse, discoverSections, maxPages = searchPageLimit(), fetchPage = fetchCatalogPage }) {
  const queue = [...new Set(seeds)].map(url => ({ url, section: true })), visited = new Set(), failures = [], sections = new Set(seeds), items = new Map()
  let pagesFetched = 0, hasMore = false
  while (queue.length && visited.size < maxPages && items.size < limit) {
    queue.sort((a, b) => Number(b.section) - Number(a.section))
    const { url } = queue.shift()
    if (visited.has(url)) continue
    visited.add(url)
    let document
    try { document = await fetchPage(url) } catch (error) { failures.push({ url, error: error.message }); continue }
    pagesFetched++
    for (const item of prepareResults(await parse(document.html, document.finalUrl), query, provider, Number.MAX_SAFE_INTEGER)) if (!items.has(item.id)) items.set(item.id, item)
    const branches = discoverSections?.(document.html, document.finalUrl) || []
    for (const next of branches) if (sameCatalogHost(next, url) && !sections.has(next)) { sections.add(next); if (!visited.has(next) && !queue.some(job => job.url === next)) queue.push({ url: next, section: true }) }
    for (const next of nextCatalogPages(document.html, document.finalUrl)) if (!visited.has(next) && !queue.some(job => job.url === next)) queue.push({ url: next, section: false })
    hasMore = queue.length > 0 || items.size > limit
    searchCheckpoint({ results: [...items.values()].slice(0, limit), pagesFetched, hasMore, sections: [...sections], failedPages: [...failures] })
  }
  hasMore = queue.length > 0 || items.size > limit
  return { results: prepareResults([...items.values()], query, provider, limit), pagesFetched, hasMore,
    sections: [...sections], failedPages: failures,
    stopReason: hasMore ? items.size >= limit ? 'result-limit' : 'page-limit' : failures.length ? 'failed-pages' : 'exhausted',
    ...(pagesFetched ? {} : { error: failures[0]?.error || 'Nenhuma página do catálogo foi consultada.' }),
  }
}
