import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import express from 'express'
import { normalizeSearchResult, prepareResults, relevanceScore, matchesGame, marketKind, formatPrice } from '../src/search-core.js'
import { filterResults, sortResults } from '../src/result-filters.js'
import { createSearchEngine } from '../src/search-engine.js'
import { parsePerSource } from '../src/search-options.js'
import { registerProgressiveSearchRoute } from '../src/progressive-route.js'
import { searchFetch, withSearchSignal } from '../src/search-context.js'
import { skyPrice } from '../src/3dsky-adapter.js'

const item = (title, extra = {}) => ({ id: 'legacy-collision', title, sourceId: 'test', source: 'Test', sourceUrl: `https://example.com/models/${encodeURIComponent(title)}`, formats: [], price: null, isFree: null, game: null, year: null, score: 1, vehicleClass: 'Car', sourceType: '3d-models', ...extra })
const defaults = { priceMode: 'Todos', kind: 'Todos', vehicleClass: 'Todos', selectedFormats: [], selectedSources: [], selectedGames: [], downloadMode: 'Todos', imageMode: 'Todos', yearFrom: '', yearTo: '' }

test('BMW E36 excludes E30, X6, navigation and unrelated-description hits', () => {
  const rows = ['BMW E 36 compact tuning', 'BMW M3 E36', 'BMW M3 E30', 'BMW X6 2009', 'Car Mods', 'BMW', 'Wheel BMW M3 E36', 'ALTEZZA STYLE BMW E36 TAIL LIGHTS', 'BMW 3-Series E36 Automatic Gear Selector'].map(title => item(title, { description: 'BMW E36 available in our catalog' }))
  assert.deepEqual(prepareResults(rows, 'BMW E36').map(row => row.title).sort(), ['BMW E 36 compact tuning', 'BMW M3 E36'].sort())
})

test('model aliases and years are respected without substring matches', () => {
  for (const [query, title] of [['Toyota Supra MK4', 'Toyota Supra Mk IV'], ['Nissan GT-R R34', 'Nissan GTR R 34'], ['Mazda RX-7', 'Mazda RX7'], ['Mercedes-Benz C63', 'Mercedes C63'], ['VW Golf', 'Volkswagen Golf']]) assert.ok(relevanceScore(item(title), query), `${query} / ${title}`)
  assert.equal(relevanceScore(item('BMW M30 E36'), 'BMW M3'), 0)
  assert.equal(relevanceScore(item('Toyota Supra 1997'), 'Toyota Supra 1998'), 0)
  assert.equal(relevanceScore(item('Human character'), 'MAN'), 0)
})

test('different URLs cannot collide, tracking URLs deduplicate', () => {
  const a = normalizeSearchResult(item('BMW E36'))
  const b = normalizeSearchResult(item('BMW E36 Coupe'))
  assert.notEqual(a.id, b.id)
  const tracked = item(a.title, { sourceUrl: `${a.sourceUrl}?utm_source=google#preview` })
  assert.equal(prepareResults([a, tracked], 'BMW E36').length, 1)
})

test('normalization preserves unknown prices, currency labels and aliases', () => {
  assert.equal(marketKind(item('BMW', { price: 30, isFree: true })), 'paid')
  assert.equal(marketKind(item('BMW', { price: null, isFree: null })), 'unknown')
  assert.equal(formatPrice(item('BMW', { price: 225, priceLabel: '225 ₽' })), '225 ₽')
  assert.deepEqual(normalizeSearchResult(item('BMW E36', { formats: ['obj', '.OBJ', ' fbx '] })).formats, ['OBJ', 'FBX'])
  assert.equal(matchesGame('NFS Heat', 'Need for Speed'), true)
  assert.equal(matchesGame('Need for Speed Heat', 'Need for Speed'), true)
  assert.equal(matchesGame('Assetto Corsa Competizione', 'Assetto Corsa'), false)
  assert.equal(matchesGame('FH5', 'Forza Horizon 5'), true)
})

test('facets combine with AND, values within a facet combine with OR', () => {
  const rows = [item('BMW E36', { sourceId: 'a', formats: ['obj'], game: 'FH5', price: 0, year: 1998 }), item('BMW E36 Coupe', { sourceId: 'b', formats: ['FBX'], game: 'Forza Horizon 5', price: 25, year: 1997 }), item('BMW E36 Drift', { sourceId: 'c', formats: [], price: null, year: null })]
  const filters = { ...defaults, selectedFormats: ['OBJ', 'FBX'], selectedGames: ['Forza Horizon 5'] }
  assert.equal(filterResults(rows, filters).length, 2)
  assert.equal(filterResults(rows, { ...filters, priceMode: 'Grátis' }).length, 1)
  assert.equal(filterResults(rows, { ...filters, selectedSources: ['b'] })[0].sourceId, 'b')
  assert.equal(filterResults(rows, { ...filters, priceMode: 'Grátis' }, 'price').length, 2)
  assert.equal(filterResults(rows, { ...defaults, priceMode: 'Não informado' }).length, 1)
  assert.equal(filterResults(rows, { ...defaults, yearFrom: '1998', yearTo: '1999' }).length, 1)
  assert.equal(filterResults(rows, { ...defaults, yearFrom: '2000', yearTo: '1990' }).length, 0)
})

test('unavailable downloads stay outside the source-download facet', () => {
  const rows = [item('BMW E36', { downloadUrl: 'https://example.com/a.zip' }), item('BMW E36 Coupe', { downloadStatus: 'source' }), item('BMW E36 Gallery', { downloadStatus: 'unavailable' })]
  assert.equal(filterResults(rows, { ...defaults, downloadMode: 'Via fonte' }).length, 1)
  assert.equal(filterResults(rows, { ...defaults, downloadMode: 'Direto' }).length, 1)
})

test('price sorting places unknown prices last and leaves input intact', () => {
  const rows = [item('BMW unknown'), item('BMW free', { price: 0 }), item('BMW paid', { price: 25 })]
  assert.deepEqual(sortResults(rows, 'Menor preço').map(row => row.price), [0, 25, null])
  assert.deepEqual(sortResults(rows, 'Maior preço').map(row => row.price), [25, 0, null])
  assert.equal(rows[0].price, null)
})

test('perSource rejects NaN and bounds fractions, negatives and infinity', () => {
  assert.equal(parsePerSource('broken'), 60)
  assert.equal(parsePerSource('Infinity'), 60)
  assert.equal(parsePerSource('8.9'), 8)
  assert.equal(parsePerSource('-1'), 1)
  assert.equal(parsePerSource('999'), 80)
})

test('3DSky uses the published USD price rather than relabeling a local price as dollars', () => {
  assert.deepEqual(skyPrice({ model_type: 'pro', price: '225', price_usd: '7' }), { price: 7, isFree: false, priceLabel: '$7.00' })
  assert.equal(skyPrice({ model_type: 'pro', price: null, price_usd: null }).price, null)
  assert.equal(skyPrice({ model_type: 'pro', price: '225' }).price, null)
  assert.equal(skyPrice({ model_type: 'free', price: null }).isFree, true)
})

const provider = id => ({ id, name: id.toUpperCase(), type: '3d-models', baseUrl: 'https://example.com', buildUrl: q => `https://example.com/search?q=${encodeURIComponent(q)}` })

test('one adapter per provider; streamed results and cached REST results agree', async () => {
  let native = 0, generic = 0
  const engine = createSearchEngine({ providerList: [provider('native'), provider('generic')], adapterMap: new Map([['native', async () => { native++; return { pagesFetched: 1, results: [item('BMW E36', { sourceId: 'native' }), item('BMW E30')] } }]]), genericSearch: async p => { generic++; return { pagesFetched: 1, results: [item('BMW M3 E36', { sourceId: p.id })] } } })
  const events = []
  const streamed = await engine('BMW E36', { emit: event => events.push(event) })
  const rest = await engine('bmw e36')
  assert.equal(native, 1); assert.equal(generic, 1); assert.equal(events.length, 2)
  assert.equal(streamed.total, 2); assert.equal(rest.cached, true)
  assert.deepEqual(streamed.results, rest.results)
  assert.equal(streamed.successfulProviders, 2)
  await engine('BMW E36', { refresh: true }); assert.equal(native, 2)
})

test('failures and deadline expiry report honest statuses while retaining other results', async () => {
  const engine = createSearchEngine({ providerList: [provider('good'), provider('slow'), provider('blocked')], concurrency: 3, providerTimeoutMs: 30, adapterMap: new Map([
    ['good', async () => ({ pagesFetched: 1, results: [item('BMW E36')] })],
    ['slow', async () => { await delay(80); return { pagesFetched: 1, results: [item('BMW E36 late')] } }],
    ['blocked', async () => { throw new Error('HTTP 403') }],
  ]) })
  const events = []
  const response = await engine('BMW E36', { emit: event => events.push(event) })
  assert.equal(response.total, 1); assert.equal(response.successfulProviders, 1)
  assert.equal(response.sources.find(source => source.provider === 'slow').status, 'error')
  assert.match(response.sources.find(source => source.provider === 'blocked').error, /403/)
  await delay(90); assert.equal(events.length, 3)
})

test('aborted searches emit no late events and do not seed the cache', async () => {
  const controller = new AbortController()
  const engine = createSearchEngine({ providerList: [provider('slow')], adapterMap: new Map([['slow', async () => { await delay(50); return { pagesFetched: 1, results: [item('BMW E36')] } }]]) })
  const events = []
  const promise = engine('BMW E36', { signal: controller.signal, emit: event => events.push(event) })
  controller.abort()
  await assert.rejects(promise, { name: 'AbortError' })
  await delay(60); assert.equal(events.length, 0)
  const retried = await engine('BMW E36'); assert.equal(retried.cached, false)
})

test('SSE delivers start/source/done and ends; invalid queries return 400', async () => {
  const app = express()
  registerProgressiveSearchRoute(app, async (query, { emit }) => {
    emit({ type: 'source', source: { provider: 'test', name: 'Test', status: 'ok', count: 1 }, results: [item('BMW E36')] })
    return { query, total: 1, providerCount: 1 }
  })
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const response = await fetch(`${url}/api/search/stream?q=BMW%20E36`, { signal: AbortSignal.timeout(2000) })
    const text = await response.text()
    assert.match(text, /"type":"start"/); assert.match(text, /"type":"source"/); assert.match(text, /"type":"done"/)
    assert.equal((await fetch(`${url}/api/search/stream?q=x`)).status, 400)
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('request cancellation reaches fetch and concurrent searches keep separate signals', async t => {
  const signals = []
  t.mock.method(globalThis, 'fetch', async (_url, options) => { signals.push(options.signal); return new Response('{}') })
  const first = new AbortController(), second = new AbortController(), adapter = new AbortController()
  await Promise.all([
    withSearchSignal(first.signal, () => searchFetch('https://example.com/first', { signal: adapter.signal })),
    withSearchSignal(second.signal, () => searchFetch('https://example.com/second')),
  ])
  first.abort()
  assert.equal(signals[0].aborted, true)
  assert.equal(signals[1].aborted, false)
  assert.equal(adapter.signal.aborted, false)
})
