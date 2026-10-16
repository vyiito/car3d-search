import * as cheerio from 'cheerio'
import { searchFetch, searchPageLimit, searchCheckpoint, searchContext } from './search-context.js'
import { prepareResults } from './search-core.js'

export function sameCatalogHost(url, base) {
  try { return ['http:', 'https:'].includes(new URL(url).protocol) && new URL(url).hostname.replace(/^www\./, '') === new URL(base).hostname.replace(/^www\./, '') } catch { return false }
}

export function nextCatalogPages(html, currentUrl) {
  const $ = cheerio.load(html), next = new Map()
  const current = new URL(currentUrl)
  const pathPage = url => url.pathname.match(/(?:\/page\/|-page|page-)(\d+)/i)?.[1] || (/gta5-mods\.com$/.test(url.hostname) ? url.pathname.match(/\/(\d+)\/?$/)?.[1] : null)
  const currentPage = Number(current.searchParams.get('page') || current.searchParams.get('paged') || pathPage(current) || 1)
  $('a[href],link[rel="next"]').each((_, el) => {
    const node = $(el)
    let url
    try { url = new URL(node.attr('href'), currentUrl); url.hash = '' } catch { return }
    if (!sameCatalogHost(url.href, currentUrl) || url.href === current.href) return
    const rel = node.attr('rel') || '', label = `${node.text()} ${node.attr('aria-label') || ''} ${node.attr('title') || ''}`.trim()
    const page = Number(url.searchParams.get('page') || url.searchParams.get('paged') || pathPage(url) || 0)
    const forward = /\bnext\b|older posts|próxim|proxim|›|»|→/i.test(label) || rel.includes('next')
    const blogger = url.searchParams.has('updated-max') || url.searchParams.has('start-index')
    if (!forward && !blogger && !(page > currentPage)) return
    // A page link must stay in this collection/search, not switch to a sidebar.
    const stem = value => {
      let path = value.pathname.replace(/(?:\/page\/\d+|-page\d+|\/(?:filter\/)?page-\d+)\/?$/i, '')
      if (/(?:^|\.)gta5-mods\.com$/.test(value.hostname)) path = path.replace(/\/\d+\/?$/, '')
      return path.replace(/\/$/, '')
    }
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
  const request = { ...options, signal: options.signal || AbortSignal.timeout(16000), headers: { 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)', accept: 'text/html,application/xhtml+xml', ...options.headers } }
  let response = await searchFetch(url, request)
  // One bounded retry for an upstream temporary response; never retry access challenges.
  if ([429, 502, 503, 504].includes(response.status) && Number(response.headers.get('retry-after') || 0) <= 1) {
    await response.body?.cancel()
    const delay = Math.max(200, Number(response.headers.get('retry-after') || 0) * 1000)
    await new Promise((resolve, reject) => {
      const signal = searchContext()?.signal || request.signal
      const abort = () => { clearTimeout(timer); reject(signal.reason) }
      const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, delay)
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
    response = await searchFetch(url, request)
    if (response.ok && response.status !== 202) {
      const attempts = searchContext()?.requests || []
      for (const attempt of attempts.slice(0, -1)) if (attempt.url === String(url) && [429, 502, 503, 504].includes(attempt.status)) attempt.recovered = true
    }
  }
  if (!response.ok || response.status === 202) throw new Error(`HTTP ${response.status}: a fonte não forneceu o catálogo.`)
  const html = await response.text()
  if (/\/x402\/docs|\/x402\/payment/i.test(response.url || '') || /<title>[^<]*(?:x402|Payment Required)/i.test(html)) throw new Error('A fonte exige uma chave de API ou acesso pago para consultas automáticas.')
  if (/<title>\s*(?:just a moment|access denied|attention required)/i.test(html) || /cf-chl-(?:widget|managed|opt)/i.test(html)) throw new Error('A fonte bloqueou a consulta automática.')
  return { html, finalUrl: response.url || String(url) }
}

// Breadth first: each section gets a first page before any section gets a
// second. Count matching unique models, not irrelevant cards or duplicates.
export async function crawlCatalog({ seeds, query, limit = 60, provider, parse, discoverSections, maxPages = searchPageLimit(), fetchPage = fetchCatalogPage, concurrency = 2, prioritizeSearch = false }) {
  const queue = [...new Set(seeds)].map(url => ({ url, section: true })), visited = new Set(), failures = [], sections = new Set(seeds), items = new Map()
  let pagesFetched = 0, hasMore = false, timeBudget = false
  while (queue.length && visited.size < maxPages && items.size < limit) {
    const queryPage = job => /\/search(?:\/|\?|$)|[?&](?:q|s|query|search_keywords)=/i.test(job.url)
    queue.sort((a, b) => (prioritizeSearch ? Number(queryPage(b)) - Number(queryPage(a)) : 0) || Number(b.section) - Number(a.section))
    if (searchContext()?.signal?.aborted) break
    // Reserve read time plus parsing overhead before starting another batch.
    if (pagesFetched > 0 && searchContext()?.deadlineAt && Date.now() + 20000 > searchContext().deadlineAt) { timeBudget = true; break }
    const batch = []
    while (queue.length && batch.length < Math.max(1, Math.min(3, concurrency)) && visited.size < maxPages) {
      const job = queue.shift()
      if (visited.has(job.url)) continue
      visited.add(job.url); batch.push(job)
    }
    await Promise.all(batch.map(async ({ url }) => {
      try {
        const document = await fetchPage(url)
        const rows = await parse(document.html, document.finalUrl)
        pagesFetched++
        for (const item of prepareResults(rows, query, provider, Number.MAX_SAFE_INTEGER)) if (!items.has(item.id)) items.set(item.id, item)
        const branches = discoverSections?.(document.html, document.finalUrl) || []
        for (const next of branches) if (sameCatalogHost(next, url) && !sections.has(next)) { sections.add(next); if (!visited.has(next) && !queue.some(job => job.url === next)) queue.push({ url: next, section: true }) }
        for (const next of nextCatalogPages(document.html, document.finalUrl)) if (!visited.has(next) && !queue.some(job => job.url === next)) queue.push({ url: next, section: false })
      } catch (error) { failures.push({ url, error: error.message }) }
      // Publish each completed page so a slow sibling cannot erase its results at the deadline.
      searchCheckpoint({ results: [...items.values()].slice(0, limit), pagesFetched, hasMore: queue.length > 0 || items.size > limit || batch.length > 1, sections: [...sections], failedPages: [...failures] })
    }))
    hasMore = queue.length > 0 || items.size > limit
    searchCheckpoint({ results: [...items.values()].slice(0, limit), pagesFetched, hasMore, sections: [...sections], failedPages: [...failures] })
  }
  hasMore = queue.length > 0 || items.size > limit
  return { results: prepareResults([...items.values()], query, provider, limit), pagesFetched, hasMore,
    sections: [...sections], failedPages: failures,
    stopReason: timeBudget ? 'time-budget' : hasMore ? items.size >= limit ? 'result-limit' : 'page-limit' : failures.length ? 'failed-pages' : 'exhausted',
    ...(pagesFetched ? {} : { error: failures[0]?.error || 'Nenhuma página do catálogo foi consultada.' }),
  }
}
