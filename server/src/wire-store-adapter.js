import * as cheerio from 'cheerio'
import { crawlCatalog } from './catalog-crawler.js'
import { wireItems } from './catalog-adapters.js'
import { catalogResult } from './structured-adapters.js'
import { prepareResults } from './search-core.js'
import { searchFetch, searchPageLimit, searchCheckpoint, searchContext } from './search-context.js'
import { providers } from './providers.js'

const free = 'https://wirewheelsclub.com/models/'
const store = 'https://store.wirewheelsclub.com/wp-json/wc/store/v1/products'
const products = 'https://store.wirewheelsclub.com/wp-json/wp/v2/product'
const text = value => cheerio.load(String(value || '')).text().replace(/\s+/g, ' ').trim()

export function wireStoreItem(item) {
  const title = text(item.name), sourceUrl = item.permalink
  if (!title || !sourceUrl) return null
  const description = text(item.short_description || item.description)
  const minor = Number(item.prices?.currency_minor_unit), raw = item.prices?.price
  const price = raw !== '' && raw != null && Number.isFinite(Number(raw)) && Number.isInteger(minor) && minor >= 0 && minor <= 6 ? Number(raw) / 10 ** minor : null
  return catalogResult('wire-wheels-club', { title, sourceUrl, imageUrl: item.images?.[0]?.src || null,
    description, formats: [...new Set((description.match(/\b(?:blend|fbx|obj|max|3ds|c4d|stl)\b/gi) || []).map(value => value.toUpperCase()))],
    price, isFree: price === null ? null : price === 0,
    priceLabel: price === null ? null : `${text(item.prices.currency_symbol || item.prices.currency_code)}${price.toFixed(2)}`,
  })
}

export async function searchWireCatalog(query, limit = 60) {
  const provider = providers.find(p => p.id === 'wire-wheels-club')
  const items = new Map(), premium = new Map(), failedPages = [], sections = [free, products]
  let pagesFetched = 0, freeHasMore = false, premiumHasMore = false
  const snapshot = () => ({ results: [...items.values()], pagesFetched, hasMore: freeHasMore || premiumHasMore || items.size > limit, sections, failedPages: [...failedPages] })
  const add = rows => { for (const row of prepareResults(rows, query, provider, Number.MAX_SAFE_INTEGER)) items.set(row.id, row) }
  await Promise.all([
    crawlCatalog({ query, limit, provider, seeds: [free], maxPages: 1, parse: html => wireItems(html, free, query, false) }).then(payload => {
      add(payload.results); pagesFetched += payload.pagesFetched; failedPages.push(...payload.failedPages); freeHasMore = payload.hasMore; searchCheckpoint(snapshot())
    }),
    (async () => {
      let totalPages = 1
      for (let page = 1; page <= totalPages && page <= searchPageLimit() && items.size < limit; page++) {
        const url = new URL(products)
        if (!/^(?:cars?|vehicles?|automotive)$/i.test(query.trim())) url.searchParams.set('search', query)
        url.searchParams.set('per_page', '50'); url.searchParams.set('page', String(page))
        url.searchParams.set('_embed', 'wp:featuredmedia')
        url.searchParams.set('_fields', 'id,title,link,content,_links,_embedded')
        try {
          const response = await searchFetch(url, { signal: AbortSignal.timeout(10000), headers: { accept: 'application/json', 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)' } })
          if (!response.ok) throw new Error(`HTTP ${response.status}`)
          const data = await response.json()
          if (!Array.isArray(data)) throw new Error('A loja não forneceu uma lista de produtos.')
          pagesFetched++; totalPages = Math.max(1, Number(response.headers.get('x-wp-totalpages') || 1))
          const rows = data.map(item => {
            const description = text(item.content?.rendered)
            const row = catalogResult('wire-wheels-club', { title: text(item.title?.rendered), sourceUrl: item.link,
              imageUrl: item._embedded?.['wp:featuredmedia']?.[0]?.source_url || null, description,
              formats: [...new Set((description.match(/\b(?:blend|fbx|obj|max|3ds|c4d|stl)\b/gi) || []).map(value => value.toUpperCase()))],
            })
            if (row && prepareResults([row], query, provider, 1).length) premium.set(item.id, row)
            return row
          }).filter(Boolean)
          add(rows); premiumHasMore = page < totalPages
          searchCheckpoint(snapshot())
        } catch (error) { failedPages.push({ url: url.href, error: error.message }); break }
      }
    })(),
  ])
  // Prices are optional enrichment for matched products, not a prerequisite for
  // finding them. A slow store response leaves an explicit unknown source price.
  const ids = [...premium.keys()]
  for (let index = 0; index < ids.length; index += 50) {
    if (searchContext()?.deadlineAt && Date.now() + 5000 > searchContext().deadlineAt) break
    const url = new URL(store)
    url.searchParams.set('include', ids.slice(index, index + 50).join(',')); url.searchParams.set('per_page', '50'); url.searchParams.set('_fields', 'id,prices')
    try {
      const response = await searchFetch(url, { optional: true, signal: AbortSignal.timeout(4000), headers: { accept: 'application/json' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const data = await response.json()
      if (!Array.isArray(data)) break
      for (const item of data) {
        const row = premium.get(item.id)
        if (!row) continue
        const priced = wireStoreItem({ name: row.title, permalink: row.sourceUrl, prices: item.prices })
        if (priced) items.set(row.id, { ...row, price: priced.price, isFree: priced.isFree, priceLabel: priced.priceLabel })
      }
    } catch { break }
  }
  const hasMore = snapshot().hasMore
  return { ...snapshot(), results: prepareResults([...items.values()], query, provider, limit), stopReason: hasMore ? items.size >= limit ? 'result-limit' : 'page-limit' : failedPages.length ? 'failed-pages' : 'exhausted', ...(pagesFetched ? {} : { error: failedPages[0]?.error }) }
}
