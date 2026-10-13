import * as cheerio from 'cheerio'
import { providers } from './providers.js'
import { decorateResult } from './search.js'
import { prepareResults, relevanceScore, matchesGame } from './search-core.js'
import { searchFetch, searchPageLimit, searchCheckpoint } from './search-context.js'
import { sameCatalogHost } from './catalog-crawler.js'
import { vehicleQueryVariants, isGameQuery } from './query-plan.js'

const providerById = new Map(providers.map(provider => [provider.id, provider]))
const text = value => cheerio.load(String(value || '')).text().replace(/\s+/g, ' ').trim()
const formats = value => [...new Set((String(value || '').match(/\b(?:blend|fbx|obj|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|kn5|z3d)\b/gi) || []).map(value => value.toUpperCase()))]
const fileSize = bytes => Number.isFinite(Number(bytes)) && Number(bytes) > 0 ? `${(Number(bytes) / 1048576).toFixed(1)} MB` : null

export function catalogResult(id, row) {
  const provider = providerById.get(id)
  return decorateResult({ id: `${id}:${row.sourceUrl}`, sourceId: id, source: provider.name, sourceType: provider.type,
    imageUrl: null, formats: [], price: null, isFree: null, downloadable: null, downloadUrl: null,
    author: null, description: null, fileSize: null, score: 0, ...row,
  }, provider)
}

async function jsonPage(url) {
  const response = await searchFetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json', 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)' } })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return { data: await response.json(), headers: response.headers }
}

function checkpoint(items, query, pagesFetched, hasMore, extra = {}) {
  const payload = { results: prepareResults(items, query, {}, Number.MAX_SAFE_INTEGER), pagesFetched, hasMore, ...extra }
  searchCheckpoint(payload)
  return payload
}

export async function searchWordPress(id, query, limit = 60) {
  const provider = providerById.get(id)
  const restBase = ['assettohub', 'brasil-simulator-mods'].includes(id) ? 'cars' : 'posts'
  const items = [], pageSize = 50, maxPages = searchPageLimit()
  let pagesFetched = 0, totalPages = 1, totalAvailable = null
  const sections = [new URL(`/wp-json/wp/v2/${restBase}`, provider.baseUrl).href]
  for (let page = 1; page <= totalPages && page <= maxPages && items.length < limit; page++) {
    const url = new URL(`/wp-json/wp/v2/${restBase}`, provider.baseUrl)
    if (!(isGameQuery(query) && matchesGame(provider.defaultGame, query))) url.searchParams.set('search', query)
    url.searchParams.set('per_page', String(pageSize)); url.searchParams.set('page', String(page)); url.searchParams.set('_embed', '1')
    const { data, headers } = await jsonPage(url)
    if (!Array.isArray(data)) throw new Error('A fonte não forneceu uma lista de modelos.')
    pagesFetched++
    totalPages = Number(headers.get('x-wp-totalpages') || 1)
    totalAvailable = Number(headers.get('x-wp-total') || 0)
    for (const post of data) {
      const title = text(post.title?.rendered), body = post.content?.rendered || post.excerpt?.rendered || ''
      const dom = cheerio.load(body), description = text(body)
      const pack = /\b(?:car.?pack|vehicle.?pack|cars? collection|car packs?)\b/i.test(`${title} ${post.link}`)
      const includedVehicles = pack ? dom('li,h2,h3').map((_, el) => text(dom(el).text())).get().filter(value => value.length < 180) : []
      const row = catalogResult(id, { title, sourceUrl: post.link,
        imageUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url || dom('img').first().attr('src') || null,
        author: post.acf?.creator || post._embedded?.author?.[0]?.name || null, description: description.slice(0, 800), formats: formats(description),
        brand: post.acf?.brand || null, year: Number(post.acf?.year) || null,
        fileSize: Number(post.acf?.file_size) > 0 ? `${post.acf.file_size} MB` : null,
        downloadActionUrl: post.acf?.download_link || post.acf?.download_link_sharemods || post.acf?.download_link_googledrive || null,
        price: provider.freeCatalog ? 0 : null, isFree: provider.freeCatalog ? true : null,
        includedVehicles,
      })
      if (row && relevanceScore(row, query)) items.push(row)
    }
    checkpoint(items, query, pagesFetched, page < totalPages || items.length > limit, { totalAvailable, sections })
    if (!data.length) break
  }
  const hasMore = pagesFetched < totalPages || items.length > limit
  return { ...checkpoint(items, query, pagesFetched, hasMore, { totalAvailable, sections }), results: prepareResults(items, query, {}, limit), stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export async function searchBlogger(query, limit = 60) {
  const items = [], maxPages = searchPageLimit(), pageSize = 50
  let totalAvailable = Infinity, pagesFetched = 0, start = 1
  do {
    const url = new URL('https://3dmodelsdestination.blogspot.com/feeds/posts/default')
    url.searchParams.set('alt', 'json'); url.searchParams.set('q', query); url.searchParams.set('max-results', String(pageSize)); url.searchParams.set('start-index', String(start))
    const { data } = await jsonPage(url)
    const feed = data.feed, entries = feed?.entry || []
    if (!feed) throw new Error('Feed de modelos indisponível.')
    pagesFetched++
    totalAvailable = Number(feed.openSearch$totalResults?.$t || entries.length)
    for (const post of entries) {
      const title = post.title?.$t, sourceUrl = post.link?.find(link => link.rel === 'alternate')?.href
      const html = post.content?.$t || post.summary?.$t || '', dom = cheerio.load(html)
      const row = catalogResult('3d-models-destination', { title, sourceUrl,
        imageUrl: post.media$thumbnail?.url?.replace('/s72-c/', '/s640/') || dom('img').first().attr('src') || null,
        formats: formats(text(html)), description: `${(post.category || []).map(category => category.term).join(' · ')} ${text(html)}`.slice(0, 800),
        author: post.author?.[0]?.name?.$t || null, price: 0, isFree: true,
      })
      if (row && relevanceScore(row, query)) items.push(row)
    }
    start += entries.length
    checkpoint(items, query, pagesFetched, start <= totalAvailable, { totalAvailable, sections: ['https://3dmodelsdestination.blogspot.com/feeds/posts/default'] })
    if (!entries.length) break
  } while (start <= totalAvailable && pagesFetched < maxPages && items.length < limit)
  const hasMore = start <= totalAvailable || items.length > limit
  return { ...checkpoint(items, query, pagesFetched, hasMore, { totalAvailable, sections: ['https://3dmodelsdestination.blogspot.com/feeds/posts/default'] }), results: prepareResults(items, query, {}, limit), stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export async function searchShopify(query, limit = 60) {
  const items = [], maxPages = searchPageLimit(), pageSize = 250
  let pagesFetched = 0, hasMore = true
  while (hasMore && pagesFetched < maxPages && items.length < limit) {
    const { data } = await jsonPage(`https://roh3d.com/products.json?limit=${pageSize}&page=${pagesFetched + 1}`)
    if (!Array.isArray(data.products)) throw new Error('Catálogo de produtos indisponível.')
    pagesFetched++
    hasMore = data.products.length === pageSize
    for (const product of data.products) {
      const prices = (product.variants || []).map(variant => Number(variant.price)).filter(price => Number.isFinite(price) && price >= 0)
      const price = prices.length ? Math.min(...prices) : null
      const description = `${text(product.body_html)} ${Array.isArray(product.tags) ? product.tags.join(' ') : product.tags || ''}`
      const row = catalogResult('roh3d', { title: product.title, sourceUrl: `https://roh3d.com/products/${product.handle}`,
        imageUrl: product.images?.[0]?.src || null, gallery: product.images?.map(image => image.src) || [],
        price, isFree: price === null ? null : price === 0, priceLabel: price === null ? null : `$${price.toFixed(2)}`,
        author: product.vendor || null, formats: formats(description), description: description.slice(0, 800),
      })
      if (row && relevanceScore(row, query)) items.push(row)
    }
    checkpoint(items, query, pagesFetched, hasMore || items.length > limit, { sections: ['https://roh3d.com/products.json'] })
  }
  hasMore ||= items.length > limit
  return { ...checkpoint(items, query, pagesFetched, hasMore, { sections: ['https://roh3d.com/products.json'] }), results: prepareResults(items, query, {}, limit), stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export async function searchBlenderKit(query, limit = 60) {
  const items = [], seen = new Set(), maxPages = searchPageLimit()
  const variants = vehicleQueryVariants(query), sectionUrls = []
  const buildUrl = term => `https://www.blenderkit.com/api/v1/search/?query=${encodeURIComponent(`${term} asset_type:model category_subtree:vehicle`)}&page_size=50`
  let next = buildUrl(variants.shift()), pagesFetched = 0, totalAvailable = null
  const visited = new Set()
  while (next && !visited.has(next) && pagesFetched < maxPages && items.length < limit) {
    if (!sameCatalogHost(next, 'https://www.blenderkit.com')) throw new Error('A próxima página está fora do catálogo da fonte.')
    visited.add(next); sectionUrls.push(next)
    const { data } = await jsonPage(next)
    if (!Array.isArray(data.results)) throw new Error('Resposta de modelos inválida.')
    pagesFetched++; totalAvailable = data.count ?? totalAvailable
    for (const asset of data.results) {
      const assetId = asset.assetBaseId || asset.id
      if (!assetId) continue
      const free = typeof asset.isFree === 'boolean' ? asset.isFree : null
      const paidPrice = asset.isForSale && asset.basePrice !== null && asset.basePrice !== undefined ? Number(asset.basePrice) : null
      const price = free === true ? 0 : Number.isFinite(paidPrice) && paidPrice > 0 ? paidPrice : null
      const row = catalogResult('blendkit', { title: asset.name || asset.displayName, sourceUrl: `https://www.blenderkit.com/asset-gallery-detail/${encodeURIComponent(assetId)}/`,
        imageUrl: asset.thumbnailMiddleUrl || asset.thumbnailLargeUrl || null, formats: ['BLEND'],
        price, isFree: free, downloadable: typeof asset.canDownload === 'boolean' ? asset.canDownload : null,
        author: asset.author?.fullName || asset.author?.firstName || null, description: text(asset.description).slice(0, 800), license: asset.license || null, fileSize: fileSize(asset.filesSize),
      })
      if (row && relevanceScore(row, query) && !seen.has(row.sourceUrl)) { seen.add(row.sourceUrl); items.push(row) }
    }
    next = data.next ? new URL(data.next, 'https://www.blenderkit.com').href : variants.length ? buildUrl(variants.shift()) : null
    checkpoint(items, query, pagesFetched, Boolean(next), { totalAvailable, sections: sectionUrls })
  }
  const hasMore = Boolean(next) || items.length > limit
  return { ...checkpoint(items, query, pagesFetched, hasMore), results: prepareResults(items, query, {}, limit), totalAvailable, sections: sectionUrls, stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export async function search3DRush(query, limit = 60) {
  const pageUrl = `https://3drush.com/3d-models?search-term=${encodeURIComponent(query)}`
  const response = await searchFetch(pageUrl, { signal: AbortSignal.timeout(12000) })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  const dom = cheerio.load(await response.text())
  const token = dom('#filter-form input[name="token"]').attr('value')
  if (!token) throw new Error('O formulário de busca da fonte mudou.')
  // Anonymous cookies belong to this public search session only.
  const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
  const items = [], maxPages = searchPageLimit()
  let pagesFetched = 0, totalAvailable = Infinity, seenRows = 0
  do {
    const response = await searchFetch('https://3drush.com/products/getProductDatasAjax', { method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie, referer: pageUrl },
      body: new URLSearchParams({ token, 'search-term': query, page: String(pagesFetched + 1) }),
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const payload = await response.json().catch(() => { throw new Error('A sessão pública de pesquisa foi recusada pela fonte.') })
    if (!Array.isArray(payload.datas)) throw new Error('A fonte não forneceu modelos da busca.')
    pagesFetched++; totalAvailable = Number(payload.total_rows || 0); seenRows += payload.datas.length
    for (const model of payload.datas) {
      const free = model.status === 'free'
      const row = catalogResult('3drush', { title: model.name, sourceUrl: model.link, imageUrl: model.image || null,
        price: free ? 0 : null, isFree: free, priceLabel: free ? 'GRÁTIS' : 'PRO', description: model.render || null,
      })
      if (row && relevanceScore(row, query)) items.push(row)
    }
    checkpoint(items, query, pagesFetched, seenRows < totalAvailable, { totalAvailable, sections: [pageUrl] })
    if (!payload.datas.length) break
  } while (seenRows < totalAvailable && pagesFetched < maxPages && items.length < limit)
  const hasMore = seenRows < totalAvailable || items.length > limit
  return { ...checkpoint(items, query, pagesFetched, hasMore), results: prepareResults(items, query, {}, limit), totalAvailable, sections: [pageUrl], stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export async function searchWarehouse(query, limit = 60) {
  const items = [], seen = new Set(), pageSize = 64, maxPages = searchPageLimit(), variants = vehicleQueryVariants(query)
  let term = variants.shift()
  let offset = 0, pagesFetched = 0, totalAvailable = Infinity
  while (offset < totalAvailable && pagesFetched < maxPages && items.length < limit) {
    const url = new URL('https://3dwarehouse.sketchup.com/warehouse/v1.0/entities')
    for (const [key, value] of Object.entries({ q: term, contentType: '3dw', show: 'all', showAttributes: 'true', showBinaryMetadata: 'true', showBinaryAttributes: 'true', sortBy: 'relevance desc', fq: 'binaryNames=exists=true', offset: String(offset), count: String(pageSize), recordEvent: 'false' })) url.searchParams.set(key, value)
    const { data } = await jsonPage(url)
    if (!Array.isArray(data.entries)) throw new Error('A fonte não forneceu a lista de modelos.')
    pagesFetched++; totalAvailable = Number(data.total || 0); offset += data.entries.length
    for (const model of data.entries) {
      if (model.isPrivate || model.isHidden || model.type !== 'SKETCHUP_MODEL') continue
      const row = warehouseModelResult(model)
      if (row && relevanceScore(row, query) && !seen.has(row.sourceUrl)) { seen.add(row.sourceUrl); items.push(row) }
    }
    checkpoint(items, query, pagesFetched, offset < totalAvailable, { totalAvailable, sections: ['https://3dwarehouse.sketchup.com/warehouse/v1.0/entities'] })
    if ((offset >= totalAvailable || !data.entries.length) && variants.length && pagesFetched < maxPages) { term = variants.shift(); offset = 0; totalAvailable = Infinity }
    else if (!data.entries.length) break
  }
  const hasMore = offset < totalAvailable || items.length > limit || variants.length > 0
  return { ...checkpoint(items, query, pagesFetched, hasMore), results: prepareResults(items, query, {}, limit), totalAvailable, stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export async function searchMediaFire(query, limit = 60) {
  const folderJobs = (key, path) => ['folders', 'files'].map(type => ({ key, path, type, chunk: 1 }))
  const queue = folderJobs('w7e2zubiwwr38', 'Real Racing 3'), visited = new Set(), items = [], sections = new Set(), maxPages = searchPageLimit(16)
  let pagesFetched = 0
  while (queue.length && pagesFetched < maxPages && items.length < limit) {
    const folder = queue.shift(), jobKey = `${folder.key}:${folder.type}:${folder.chunk}`
    if (visited.has(jobKey)) continue
    visited.add(jobKey); sections.add(`https://www.mediafire.com/folder/${folder.key}`)
    const url = new URL('https://www.mediafire.com/api/1.5/folder/get_content.php')
    for (const [key, value] of Object.entries({ folder_key: folder.key, content_type: folder.type, chunk_size: '100', chunk: String(folder.chunk), response_format: 'json' })) url.searchParams.set(key, value)
    const { data } = await jsonPage(url), payload = data.response
    if (payload?.result !== 'Success' || !payload.folder_content) throw new Error(payload?.message || 'A pasta pública não pôde ser consultada.')
    const content = payload.folder_content
    pagesFetched++
    if (content.more_chunks === 'yes') queue.unshift({ ...folder, chunk: folder.chunk + 1 })
    if (folder.type === 'folders') for (const child of content.folders || []) {
      if (child.privacy === 'private' || /\b(?:maps?|tracks?|textures?|misc)\b/i.test(child.name)) continue
      queue.push(...folderJobs(child.folderkey, `${folder.path} / ${child.name}`))
    }
    else for (const file of content.files || []) {
      if (file.privacy === 'private' || !file.quickkey || !/\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|z3d|glb|gltf)$/i.test(file.filename || '')) continue
      const title = String(file.filename).replace(/\.(?:zip|rar|7z|blend|fbx|obj|stl|3ds|z3d|glb|gltf)$/i, '').replace(/[_]+/g, ' ').trim()
      const row = catalogResult('mediafire-rr3', { title, sourceUrl: file.links?.normal_download || `https://www.mediafire.com/file/${file.quickkey}/file`,
        formats: formats(file.filename), price: 0, isFree: true, downloadable: true, downloadStatus: 'source',
        description: `${folder.path} · ${text(file.description)}`, fileSize: fileSize(file.size), game: 'Real Racing 3',
      })
      if (row && relevanceScore(row, query)) items.push(row)
    }
    checkpoint(items, query, pagesFetched, queue.length > 0 || items.length > limit, { sections: [...sections] })
  }
  const hasMore = queue.length > 0 || items.length > limit
  return { ...checkpoint(items, query, pagesFetched, hasMore, { sections: [...sections] }), results: prepareResults(items, query, {}, limit), stopReason: hasMore ? items.length >= limit ? 'result-limit' : 'page-limit' : 'exhausted' }
}

export function warehouseModelResult(model) {
  if(!model||model.isPrivate||model.isHidden||model.type!=='SKETCHUP_MODEL')return null
  const binaries = Object.values(model.binaries || {}), preview = model.binaries?.bot_lt_wp || model.binaries?.bot_lt || model.binaries?.bot_st
  const meshFiles = binaries.filter(binary => /^(?:skp|glb|gltf|usdz|dae|kmz)$/i.test(binary.ext || ''))
  return catalogResult('3dwarehouse', { title: model.title,
    sourceUrl: `https://3dwarehouse.sketchup.com/model/${String(model.id)}`,
    imageUrl: preview?.contentUrl || null, formats: [...new Set(meshFiles.map(binary => binary.ext.toUpperCase()))],
    price: 0, isFree: true, downloadable: meshFiles.length > 0, downloadStatus: meshFiles.length ? 'source' : 'unavailable',
    author: model.creator?.displayName || null, description: text(model.description).slice(0, 800), fileSize: fileSize(model.binaries?.source_skp?.fileSize),
    isModelListing: true, tags: Array.isArray(model.tags) ? model.tags : [],
  })
}
