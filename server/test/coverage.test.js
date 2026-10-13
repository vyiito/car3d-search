import test from 'node:test'
import assert from 'node:assert/strict'
import { crawlCatalog, nextCatalogPages } from '../src/catalog-crawler.js'
import { searchWordPress, searchBlogger, searchMediaFire, searchBlenderKit, searchShopify, searchWarehouse, search3DRush } from '../src/structured-adapters.js'
import { searchSketchfab } from '../src/search.js'
import { providers } from '../src/providers.js'
import { withSearchContext } from '../src/search-context.js'
import { prepareResults, relevanceScore } from '../src/search-core.js'
import { createSearchEngine } from '../src/search-engine.js'
import { wireItems } from '../src/catalog-adapters.js'
import { getResultDetails } from '../src/details.js'
import { isGameQuery } from '../src/query-plan.js'

const row = (title, sourceUrl = `https://example.com/models/${encodeURIComponent(title)}`) => ({ title, sourceUrl, sourceId: 'test', source: 'Test', sourceType: '3d-models', formats: [], brand: 'BMW', year: null, vehicleClass: 'Car', score: 0 })
const fixtureResponse = (data, headers = {}) => new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json', ...headers } })

test('pagination supports Blogger, page suffixes and forward pages without leaving the section', () => {
  assert.deepEqual(nextCatalogPages('<a href="/cars-page2">Next ›</a><a href="/cars-page91">91</a><a href="/trucks-page2">2</a>', 'https://example.com/cars'), ['https://example.com/cars-page2', 'https://example.com/cars-page91'])
  assert.deepEqual(nextCatalogPages('<a href="/Car/filter/page-2">2</a><a href="/Car/filter/page-80">80</a>', 'https://example.com/Car'), ['https://example.com/Car/filter/page-2', 'https://example.com/Car/filter/page-80'])
  assert.equal(nextCatalogPages('<a href="/search?updated-max=2026-01-01">Older posts</a>', 'https://example.com/search?q=BMW').length, 1)
  assert.equal(nextCatalogPages('<a href="https://other.example.com/cars?page=2">Next</a>', 'https://example.com/cars').length, 0)
})

test('crawl checks distinct sections before paging and keeps going after an irrelevant page', async () => {
  const visits = []
  const payload = await crawlCatalog({ seeds: ['https://example.com/cars', 'https://example.com/trucks'], query: 'BMW E36', limit: 20, maxPages: 6,
    parse: html => html.includes('MATCH') ? [row('BMW E36')] : [],
    fetchPage: async url => { visits.push(url); return { finalUrl: url, html: url.includes('page=3') ? 'MATCH' : url.endsWith('trucks') ? '' : `<a rel="next" href="/cars?page=${url.includes('page=2') ? 3 : 2}">Next</a>` } },
  })
  assert.deepEqual(visits, ['https://example.com/cars', 'https://example.com/trucks', 'https://example.com/cars?page=2', 'https://example.com/cars?page=3'])
  assert.equal(payload.results.length, 1); assert.equal(payload.stopReason, 'exhausted')
})

test('a failed category preserves hits and reports partial coverage', async () => {
  const payload = await crawlCatalog({ seeds: ['https://example.com/cars', 'https://example.com/trucks'], query: 'BMW', limit: 20, maxPages: 6,
    parse: () => [row('BMW E36')], fetchPage: async url => { if (url.endsWith('trucks')) throw new Error('HTTP 403'); return { finalUrl: url, html: '' } },
  })
  assert.equal(payload.results.length, 1); assert.equal(payload.failedPages.length, 1); assert.equal(payload.stopReason, 'failed-pages')
})

test('catalog limits count unique matching models, not duplicate or unrelated cards', async () => {
  const payload = await crawlCatalog({ seeds: ['https://example.com/cars'], query: 'BMW E36', limit: 2, maxPages: 2,
    parse: () => [row('BMW E30'), row('BMW E36'), row('BMW E36'), row('BMW E36 Coupe')],
    fetchPage: async url => ({ finalUrl: url, html: '<a href="/cars?page=2" rel="next">Next</a>' }),
  })
  assert.equal(payload.results.length, 2); assert.equal(payload.hasMore, true); assert.equal(payload.stopReason, 'result-limit')
})

test('WordPress searches the cars type and reads metadata for every row, including later pages', async t => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url); urls.push(parsed)
    const page = Number(parsed.searchParams.get('page'))
    return fixtureResponse(page === 1 ? [{ title: { rendered: 'BMW E30' }, link: 'https://www.assettohub.com/bmw-e30/' }]
      : [{ title: { rendered: 'BMW M3 E36' }, link: 'https://www.assettohub.com/bmw-e36/', content: { rendered: 'OBJ model' }, acf: { year: 1997, brand: 'BMW', file_size: 120 }, _embedded: { 'wp:featuredmedia': [{ source_url: 'https://example.com/preview.jpg' }], author: [{ name: 'Creator' }] } }], { 'x-wp-totalpages': '2', 'x-wp-total': '2' })
  })
  const payload = await searchWordPress('assettohub', 'BMW E36', 20)
  assert.equal(urls[0].pathname, '/wp-json/wp/v2/cars')
  assert.equal(payload.pagesFetched, 2); assert.equal(payload.results.length, 1)
  assert.equal(payload.results[0].year, 1997); assert.equal(payload.results[0].author, 'Creator'); assert.equal(payload.results[0].fileSize, '120 MB')
  assert.equal(payload.hasMore, false)
})

test('MediaFire reads nested public Cars chunks and excludes Maps and textures', async t => {
  const requests = []
  t.mock.method(globalThis, 'fetch', async value => {
    const url = new URL(value), key = url.searchParams.get('folder_key'), type = url.searchParams.get('content_type'), chunk = Number(url.searchParams.get('chunk'))
    requests.push({ key, type, chunk })
    let content = { more_chunks: 'no', folders: [], files: [] }
    if (key === 'w7e2zubiwwr38' && type === 'folders') content.folders = [{ folderkey: 'cars', name: 'Cars', privacy: 'public' }, { folderkey: 'maps', name: 'Maps', privacy: 'public' }]
    if (key === 'cars' && type === 'files') content = { more_chunks: chunk === 1 ? 'yes' : 'no', files: [{ quickkey: 'model' + chunk, filename: chunk === 1 ? 'bmw_e30.7z' : 'bmw_e36.7z', privacy: 'public', size: 1048576, links: { normal_download: 'https://www.mediafire.com/file/model' + chunk + '/file' } }] }
    return fixtureResponse({ response: { result: 'Success', folder_content: content } })
  })
  const payload = await searchMediaFire('BMW E36', 20)
  assert.equal(payload.results.length, 1); assert.equal(payload.results[0].game, 'Real Racing 3'); assert.equal(payload.results[0].fileSize, '1.0 MB')
  assert.ok(requests.some(request => request.key === 'cars' && request.chunk === 2)); assert.ok(!requests.some(request => request.key === 'maps'))
})

test('BlenderKit follows next even when the first page has no exact matches', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async url => { calls++; const page = new URL(url).searchParams.get('page'); return fixtureResponse({ count: 2, next: page ? null : 'https://www.blenderkit.com/api/v1/search/?page=2', results: [{ id: page ? 'e36' : 'e30', name: page ? 'BMW E36' : 'BMW E30', isFree: false, isForSale: true, basePrice: '15', description: 'Car', author: { fullName: 'Creator' } }] }) })
  const payload = await searchBlenderKit('BMW E36', 20)
  assert.equal(payload.results.length, 1); assert.equal(payload.results[0].isFree, false); assert.equal(payload.results[0].price, 15); assert.ok(calls >= 2)
})

test('Shopify scans all published products rather than one display collection', async t => {
  let calls = 0
  t.mock.method(globalThis, 'fetch', async url => { calls++; const page = new URL(url).searchParams.get('page'); return fixtureResponse({ products: page === '1' ? Array.from({ length: 250 }, (_, index) => ({ title: 'Ford Mustang ' + index, handle: 'ford-' + index, variants: [{ price: '20' }], tags: [] })) : [{ title: 'BMW E36', handle: 'free-bmw', variants: [{ price: '0' }], images: [{ src: 'https://example.com/car.jpg' }], tags: ['free', 'FBX'] }] }) })
  const payload = await searchShopify('BMW E36', 20)
  assert.equal(calls, 2); assert.equal(payload.results.length, 1); assert.equal(payload.results[0].isFree, true); assert.equal(payload.hasMore, false)
})

test('Sketchfab includes view-only models and follows API cursors', async t => {
  const urls = []
  t.mock.method(globalThis, 'fetch', async value => {
    const url = new URL(value); urls.push(url)
    return fixtureResponse(url.searchParams.has('cursor') ? { next: null, results: [{ uid: 'e36', name: 'BMW E36', viewerUrl: 'https://sketchfab.com/3d-models/e36', isDownloadable: false }] }
      : { next: 'https://api.sketchfab.com/v3/search?cursor=next', results: [{ uid: 'e30', name: 'BMW E30', viewerUrl: 'https://sketchfab.com/3d-models/e30' }] })
  })
  const payload = await searchSketchfab(providers.find(provider => provider.id === 'sketchfab'), 'BMW E36', 20)
  assert.equal(urls[0].searchParams.has('downloadable'), false); assert.equal(payload.pagesFetched, 2); assert.equal(payload.results[0].downloadable, false)
})

test('Warehouse reads public model metadata, offsets and formats rather than an empty app shell', async t => {
  const offsets = []
  t.mock.method(globalThis, 'fetch', async value => {
    const offset = Number(new URL(value).searchParams.get('offset')); offsets.push(offset)
    return fixtureResponse({ total: 2, entries: [{ id: offset ? 'u222' : 'u111', type: 'SKETCHUP_MODEL', title: offset ? 'BMW E36' : 'BMW E30', creator: { displayName: 'Creator' }, binaries: { source_skp: { ext: 'skp', fileSize: 1048576 }, glb: { ext: 'glb' } } }] })
  })
  const payload = await searchWarehouse('BMW E36', 20)
  assert.equal(payload.results.length, 1); assert.deepEqual(payload.results[0].formats, ['SKP', 'GLB']); assert.ok(offsets.includes(1))
})

test('3D Rush uses the public search form session and actual AJAX pagination', async t => {
  const pages = []
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).includes('getProductDatasAjax')) return new Response('<form id="filter-form"><input name="token" value="fixture"></form>', { headers: { 'set-cookie': 'session=anonymous; Path=/' } })
    const body = new URLSearchParams(options.body); pages.push(body.get('page'))
    assert.equal(options.headers.cookie, 'session=anonymous')
    return fixtureResponse({ total_rows: 2, datas: [{ name: body.get('page') === '1' ? 'BMW E30' : 'BMW E36', link: 'https://3drush.com/products/model-' + body.get('page'), status: 'free' }] })
  })
  const payload = await search3DRush('BMW E36', 20)
  assert.deepEqual(pages, ['1', '2']); assert.equal(payload.results.length, 1); assert.equal(payload.results[0].isFree, true)
})

test('free Wire Wheels cards keep relative model URLs and generic car discovery', () => {
  const html = '<a class="portfolio-item" href="1987-porsche-959/"><img alt="1987 Porsche 959" src="/preview.jpg"></a>'
  const rows = prepareResults(wireItems(html, 'https://wirewheelsclub.com/models/', 'car', false), 'car')
  assert.equal(rows.length, 1); assert.equal(rows[0].sourceUrl, 'https://wirewheelsclub.com/models/1987-porsche-959/')
})

test('generation aliases and confirmed pack contents recover valid models without mixing unrelated entries', () => {
  assert.ok(relevanceScore(row('Toyota Supra A80'), 'Toyota Supra MK4'))
  assert.ok(relevanceScore(row('Nissan Skyline BNR34'), 'Nissan Skyline R34'))
  assert.ok(relevanceScore({ ...row('Street car pack'), includedVehicles: ['BMW E36', 'Toyota Supra'] }, 'BMW E36'))
  assert.equal(relevanceScore({ ...row('Street car pack'), brand: null, includedVehicles: ['BMW E30', 'Honda E36'] }, 'BMW E36'), 0)
})

test('expanded searches select one provider and keep separate cache and larger limits', async () => {
  const calls = []
  const providerList = ['a', 'b'].map(id => ({ id, name: id, baseUrl: 'https://example.com', buildUrl: () => 'https://example.com' }))
  const engine = createSearchEngine({ providerList, adapterMap: new Map(), genericSearch: async (provider, query, limit) => { calls.push({ id: provider.id, limit }); return { pagesFetched: 1, results: [row('BMW E36')], hasMore: true, stopReason: 'result-limit' } } })
  const standard = await engine('BMW E36', { perSource: 20 })
  const expanded = await engine('BMW E36', { sourceIds: ['a'], expanded: true, perSource: 200 })
  assert.equal(standard.sources.length, 2); assert.equal(expanded.sources.length, 1); assert.equal(expanded.sources[0].coverage.depth, 'expanded')
  assert.deepEqual(calls[2], { id: 'a', limit: 200 }); assert.equal(expanded.cached, false)
  await assert.rejects(engine('BMW E36', { sourceIds: ['unknown'] }), /Unknown provider/)
})

test('Warehouse details retain actual formats and model title instead of the application shell', async t => {
  let requested = ''
  t.mock.method(globalThis, 'fetch', async value => { requested = String(value); return fixtureResponse({ id: 'u222', title: 'BMW E36', type: 'SKETCHUP_MODEL', creator: { displayName: 'Creator' }, binaries: { source_skp: { ext: 'skp', fileSize: 1048576 }, glb: { ext: 'glb' } } }) })
  const details = await getResultDetails('3dwarehouse', 'https://3dwarehouse.sketchup.com/model/u222')
  assert.ok(requested.includes('/entities/u222'))
  assert.equal(details.title, 'BMW E36'); assert.deepEqual(details.formats, ['SKP', 'GLB']); assert.equal(details.score, undefined)
})

test('a vehicle query mentioning a game keeps the vehicle constraint', () => {
  assert.equal(isGameQuery('Assetto Corsa'), true)
  assert.equal(isGameQuery('Assetto Corsa BMW E36'), false)
})


test('pagination links retain the search and category when the source omits them', () => {
  const next = new URL(nextCatalogPages('<a rel="next" href="/search?page=2">Next</a>', 'https://example.com/search?q=BMW&category=cars')[0])
  assert.equal(next.searchParams.get('q'), 'BMW'); assert.equal(next.searchParams.get('category'), 'cars')
})

test('a full last API page reports result truncation instead of complete coverage', async t => {
  const titles = ['BMW E36', 'BMW E36 Coupe']
  t.mock.method(globalThis, 'fetch', async value => {
    if (String(value).includes('products.json')) return fixtureResponse({ products: titles.map((title, i) => ({ title, handle: 'bmw-' + i, variants: [{ price: '0' }], tags: 'FBX, car' })) })
    if (String(value).includes('feeds/posts')) return fixtureResponse({ feed: { openSearch$totalResults: { $t: '2' }, entry: titles.map((title, i) => ({ title: { $t: title }, link: [{ rel: 'alternate', href: 'https://3dmodelsdestination.blogspot.com/bmw-' + i }] })) } })
    return fixtureResponse(titles.map((title, i) => ({ title: { rendered: title }, link: 'https://www.assettohub.com/bmw-' + i })), { 'x-wp-totalpages': '1', 'x-wp-total': '2' })
  })
  for (const payload of [await searchWordPress('assettohub', 'BMW E36', 1), await searchShopify('BMW E36', 1), await searchBlogger('BMW E36', 1)]) {
    assert.equal(payload.results.length, 1); assert.equal(payload.hasMore, true); assert.equal(payload.stopReason, 'result-limit'); assert.ok(payload.sections.length)
  }
})

test('MediaFire retains the unvisited file listing when the folder request exhausts the page budget', async t => {
  t.mock.method(globalThis, 'fetch', async () => fixtureResponse({ response: { result: 'Success', folder_content: { more_chunks: 'no', folders: [] } } }))
  const payload = await withSearchContext({ maxPages: 1 }, () => searchMediaFire('BMW', 20))
  assert.equal(payload.pagesFetched, 1); assert.equal(payload.hasMore, true); assert.equal(payload.stopReason, 'page-limit')
})


test('coverage connects public MediaFire folder sections to their API requests', async t => {
  t.mock.method(globalThis, 'fetch', async () => fixtureResponse({ response: { result: 'Success', folder_content: { more_chunks: 'no', folders: [], files: [] } } }))
  const provider = providers.find(source => source.id === 'mediafire-rr3')
  const engine = createSearchEngine({ providerList: [provider], adapterMap: new Map([['mediafire-rr3', searchMediaFire]]) })
  const payload = await engine('BMW')
  assert.deepEqual(payload.sources[0].coverage.checkedSections, ['https://www.mediafire.com/folder/w7e2zubiwwr38'])
})
