import test from 'node:test'
import assert from 'node:assert/strict'
import { gta5Items, searchGta5 } from '../src/gta5-adapter.js'
import { prepareResults } from '../src/search-core.js'
import { createSearchEngine } from '../src/search-engine.js'
import { crawlCatalog, fetchCatalogPage, nextCatalogPages } from '../src/catalog-crawler.js'
import { searchBazaSections, searchZifirSections, searchExportSections } from '../src/section-adapters.js'
import { searchCGTraderMarketV2 } from '../src/cgtrader-adapter.js'
import { getResultDetails } from '../src/details.js'
import { searchWireCatalog, wireStoreItem } from '../src/wire-store-adapter.js'

const row = { title: 'BMW E36', sourceId: 'test', sourceUrl: 'https://example.com/bmw-e36', formats: [], score: 1 }
const provider = { id: 'test', name: 'Test', baseUrl: 'https://example.com', buildUrl: () => 'https://example.com/search' }
const gtaCard = (title, path, tags = ['Car']) => `<div class="file-list-obj"><a class="preview" href="${path}"><img src="https://img.gta5-mods.com/model.jpg"></a><ul class="categories">${tags.map(tag => `<li>${tag}</li>`).join('')}</ul><div class="name"><a href="${path}" title="${title}">${title}</a></div><div class="bottom"><a href="/users/author">Author</a></div></div>`

test('GTA5-Mods keeps vehicles and their own previews, excluding unrelated mod categories', () => {
  const html = gtaCard('BMW E36 Add-On', '/vehicles/bmw-e36') + gtaCard('Benefactor Schafter', '/vehicles/benefactor-schafter')
    + gtaCard('BMW E36 Handling', '/vehicles/bmw-e36-handling', ['Handling'])
    + gtaCard('BMW E36 Sound', '/vehicles/bmw-e36-sound', ['Sound'])
    + gtaCard('BMW E36 Livery', '/paintjobs/bmw-e36', ['Livery'])
    + gtaCard('BMW Garage', '/maps/bmw-garage') + gtaCard('Carbine Rifle', '/weapons/carbine')
  const rows = prepareResults(gta5Items(html, 'car'), 'car')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].game, 'GTA V'); assert.equal(rows[0].sourceType, 'game-mods')
  assert.equal(rows[0].imageUrl, 'https://img.gta5-mods.com/model.jpg')
  assert.equal(rows[0].author, 'Author'); assert.equal(rows[0].isFree, true)
})

test('GTA5-Mods follows published numeric pages even after a page with no matching vehicle', async t => {
  const visits = []
  t.mock.method(globalThis, 'fetch', async url => {
    visits.push(String(url))
    return new Response(String(url).endsWith('/2') ? gtaCard('BMW E36 Add-On', '/vehicles/bmw-e36')
      : gtaCard('BMW E30', '/vehicles/bmw-e30') + '<a rel="next" href="/search/BMW+E36/2">Next</a>')
  })
  const payload = await searchGta5('BMW E36', 20)
  assert.equal(payload.results.length, 1); assert.equal(payload.pagesFetched, 2)
  assert.deepEqual(visits, ['https://www.gta5-mods.com/search/BMW+E36', 'https://www.gta5-mods.com/search/BMW+E36/2'])
  assert.deepEqual(nextCatalogPages('<a href="/Car/search/q-BMW/page-2">2</a>', 'https://3d-baza.com/Car/search/q-BMW'), ['https://3d-baza.com/Car/search/q-BMW/page-2'])
})

test('GTA5-Mods details read metadata without following or downloading mod archives', async t => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async url => {
    urls.push(String(url))
    return new Response('<h1>BMW E36 Add-On</h1><meta property="og:image" content="https://img.gta5-mods.com/bmw.jpg"><a href="/files/model.zip">Download</a>', { headers: { 'content-type': 'text/html' } })
  })
  const url = 'https://www.gta5-mods.com/vehicles/bmw-e36'
  const details = await getResultDetails('gta5-mods', url)
  assert.deepEqual(urls, [url]); assert.equal(details.downloadUrl, null)
  assert.equal(details.downloadActionUrl, url); assert.equal(details.game, 'GTA V')
})

test('catalog checkpoints preserve a completed page while a sibling exceeds the source deadline', async () => {
  let active = 0, maximum = 0
  const engine = createSearchEngine({ providerList: [provider], providerTimeoutMs: 30, searchTimeoutMs: 300,
    adapterMap: new Map([['test', () => crawlCatalog({ query: 'BMW E36', limit: 20, provider, seeds: ['https://example.com/fast', 'https://example.com/slow'], parse: () => [row], fetchPage: async url => {
      active++; maximum = Math.max(maximum, active)
      await new Promise(resolve => setTimeout(resolve, url.endsWith('slow') ? 80 : 2)); active--
      return { html: '', finalUrl: url }
    } })]]) })
  const payload = await engine('BMW E36')
  assert.equal(maximum, 2); assert.equal(payload.results.length, 1)
  assert.equal(payload.sources[0].failureKind, 'timeout'); assert.equal(payload.sources[0].retryable, true)
})

test('a recovered HTTP 503 is retried once and does not leave a false partial failure', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => ++calls === 1 ? new Response('Temporary', { status: 503 }) : new Response('ok'))
  const engine = createSearchEngine({ providerList: [provider], adapterMap: new Map([['test', () => crawlCatalog({ query: 'BMW E36', provider, seeds: ['https://example.com/search'], parse: () => [row] })]]) })
  const payload = await engine('BMW E36')
  assert.equal(calls, 2); assert.equal(payload.results.length, 1)
  assert.equal(payload.sources[0].coverage.status, 'query-complete')
})

test('HTTP 403 and payment-gated HTML are reported as access limitations, never a completed empty catalog', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async () => { calls++; return new Response('Denied', { status: 403 }) })
  const engine = createSearchEngine({ providerList: [provider], adapterMap: new Map([['test', () => crawlCatalog({ query: 'BMW', provider, seeds: ['https://example.com/search'], parse: () => [] })]]) })
  const payload = await engine('BMW')
  assert.equal(calls, 1); assert.equal(payload.sources[0].retryable, false)
  assert.equal(payload.sources[0].failureKind, 'blocked'); assert.equal(payload.sources[0].pagesFetched, 0)
  t.mock.method(globalThis, 'fetch', async () => new Response('<title>x402 Payment Required</title>'))
  await assert.rejects(fetchCatalogPage('https://example.com/search'), /chave de API/)
})

test('CGTrader challenge responses do not count as successfully fetched model pages', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 202 }))
  const engine = createSearchEngine({ providerList: [{ ...provider, id: 'cgtrader' }], adapterMap: new Map([['cgtrader', searchCGTraderMarketV2]]) })
  const payload = await engine('BMW')
  assert.equal(payload.sources[0].pagesFetched, 0); assert.equal(payload.sources[0].failureKind, 'blocked')
})

test('Baza, Zifir and 3DExport use the search routes and field names published by each source', async t => {
  const urls = []
  const html = '<div class="product"><a href="/product/ford-bronco-dr">Ford Bronco DR $10 FBX</a><a href="/ford-bronco-dr-123456">Ford Bronco DR $10 FBX</a><a href="/3d-model-ford-bronco-dr-123456">Ford Bronco DR $10 FBX</a></div>'
  t.mock.method(globalThis, 'fetch', async url => { urls.push(String(url)); return new Response(html) })
  await searchBazaSections('Ford Bronco DR', 1)
  await searchZifirSections('Ford Bronco DR', 1)
  await searchExportSections('Ford Bronco DR', 1)
  assert.ok(urls.includes('https://3d-baza.com/Car/search/q-Ford%20Bronco%20DR'))
  assert.ok(urls.includes('https://zifir3d.com/search/product?q=Ford%20Bronco%20DR'))
  assert.ok(urls.includes('https://3dexport.com/search?search_keywords=Ford%20Bronco%20DR'))
  assert.ok(!urls.includes('https://zifir3d.com/search?query=Ford%20Bronco%20DR'))
})

test('Wire Wheels uses public store pagination and currency units while retaining free models', async t => {
  const urls = []
  const product = { name: 'BMW E36 Premium', permalink: 'https://store.wirewheelsclub.com/product/bmw-e36/', short_description: 'FBX OBJ', images: [{ src: 'https://store.wirewheelsclub.com/bmw.jpg' }], prices: { price: '3990', currency_minor_unit: 2, currency_symbol: '€' } }
  t.mock.method(globalThis, 'fetch', async value => {
    const url = new URL(value); urls.push(url.href)
    if (url.hostname === 'wirewheelsclub.com') return new Response('<a class="portfolio-item" href="bmw-e36/"><img src="/bmw.jpg" alt="BMW E36 Free"></a>')
    return new Response(JSON.stringify(Number(url.searchParams.get('page')) === 1 ? [] : [product]), { headers: { 'x-wp-totalpages': '2' } })
  })
  const payload = await searchWireCatalog('BMW E36', 20)
  assert.equal(payload.results.length, 2); assert.equal(payload.pagesFetched, 3)
  assert.ok(urls.some(url => url.includes('/wp-json/wc/store/v1/products') && url.includes('page=2')))
  const premium = payload.results.find(row => !row.isFree)
  assert.equal(premium.price, 39.9); assert.equal(premium.priceLabel, '€39.90')
  assert.equal(wireStoreItem({ ...product, prices: {} }).price, null)
})
