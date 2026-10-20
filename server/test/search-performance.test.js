import test from 'node:test'
import assert from 'node:assert/strict'
import { setImmediate as tick } from 'node:timers/promises'
import express from 'express'
import { createSearchEngine } from '../src/search-engine.js'
import { searchCheckpoint } from '../src/search-context.js'
import { registerProgressiveSearchRoute } from '../src/progressive-route.js'

const provider = id => ({ id, name: id, baseUrl: 'https://example.com', buildUrl: q => `https://example.com/search?q=${encodeURIComponent(q)}` })
const row = id => ({ title: 'Ford Bronco DR', sourceId: id, sourceUrl: `https://example.com/${id}/ford-bronco-dr`, vehicleClass: 'Car', formats: [] })
const page = id => ({ pagesFetched: 1, results: [row(id)], stopReason: 'exhausted' })
const gate = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }

test('a checkpoint publishes vehicles before a slower page of the same source finishes', async () => {
  const first = gate(), rest = gate(), events = []
  const engine = createSearchEngine({ providerList: [provider('test')], adapterMap: new Map([['test', async () => {
    searchCheckpoint({ ...page('test'), hasMore: true }); first.resolve(); await rest.promise; return page('test')
  }]]) })
  const task = engine('Ford Bronco DR', { emit: e => events.push(e) })
  try { await first.promise; await tick(); assert.equal(events[0]?.interim, true); assert.equal(events[0]?.results.length, 1) }
  finally { rest.resolve(); await task }
  assert.equal(events.filter(e => !e.interim).length, 1)
})

test('healthy source caches survive a failed sibling expiring', async () => {
  const calls = { good: 0, bad: 0 }
  const engine = createSearchEngine({ providerList: [provider('good'), provider('bad')], failureCacheTtlMs: 0,
    adapterMap: new Map([['good', async () => { calls.good++; return page('good') }], ['bad', async () => { calls.bad++; throw new Error('fetch failed') }]]) })
  await engine('Ford Bronco DR'); await engine('Ford Bronco DR')
  assert.deepEqual(calls, { good: 1, bad: 2 })
})

test('a temporarily failing source retains its prior vehicles with explicit stale provenance', async () => {
  let calls = 0
  const engine = createSearchEngine({ providerList: [provider('test')], cacheTtlMs: 0, failureCacheTtlMs: 0,
    adapterMap: new Map([['test', async () => { if (++calls > 1) throw new Error('HTTP 503'); return page('test') }]]) })
  const initial = await engine('Ford Bronco DR'), failed = await engine('Ford Bronco DR'), again = await engine('Ford Bronco DR')
  assert.equal(failed.results.length, 1); assert.equal(failed.sources[0].stale, true)
  assert.equal(failed.sources[0].status, 'error'); assert.equal(failed.sources[0].coverage.status, 'partial')
  assert.equal(again.sources[0].cachedAt, initial.sources[0].checkedAt)
})

test('late subscribers receive the latest page snapshot without starting a second crawl', async () => {
  const started = gate(), finish = gate(), events = []; let calls = 0
  const engine = createSearchEngine({ providerList: [provider('test')], adapterMap: new Map([['test', async () => {
    calls++; searchCheckpoint({ ...page('test'), hasMore: true }); started.resolve(); await finish.promise; return page('test')
  }]]) })
  const first = engine('Ford Bronco DR'); await started.promise
  const second = engine('Ford Bronco DR', { emit: e => events.push(e) })
  assert.equal(events[0].interim, true); assert.equal(events[0].results.length, 1)
  finish.resolve(); await Promise.all([first, second]); assert.equal(calls, 1)
})

test('access denials back off across queries with truthful status and a query-specific original link', async () => {
  let calls = 0
  const engine = createSearchEngine({ providerList: [provider('blocked')], adapterMap: new Map([['blocked', async () => { calls++; throw new Error('HTTP 403') }]]) })
  await engine('BMW E36'); const payload = await engine('Ford Bronco DR')
  assert.equal(calls, 1); assert.equal(payload.sources[0].status, 'error'); assert.equal(payload.sources[0].failureKind, 'blocked')
  assert.equal(payload.sources[0].deferred, true); assert.ok(payload.sources[0].retryAt)
  assert.equal(payload.sources[0].searchUrl, 'https://example.com/search?q=Ford%20Bronco%20DR')
  assert.deepEqual(payload.sources[0].coverage.checkedSections, [])
  await engine('Ford Bronco DR', { refresh: true }); assert.equal(calls, 2)
})

test('a blocked optional route does not suppress a provider with a working public catalog', async () => {
  let calls = 0
  const engine = createSearchEngine({ providerList: [provider('test')], adapterMap: new Map([['test', async () => {
    calls++; return { ...page('test'), failedPages: [{ url: 'https://example.com/optional', error: 'HTTP 403' }] }
  }]]) })
  await engine('Ford Bronco DR'); const result = await engine('Ford Bronco')
  assert.equal(calls, 2); assert.equal(result.results.length, 1); assert.equal(result.sources[0].deferred, undefined)
})

test('concurrent REST/SSE consumers share adapters; cancelling one does not cancel another', async () => {
  const started = gate(), finish = gate(), a = new AbortController(); let calls = 0
  const engine = createSearchEngine({ providerList: [provider('test')], adapterMap: new Map([['test', async () => { calls++; started.resolve(); await finish.promise; return page('test') }]]) })
  const first = engine('Ford Bronco DR', { signal: a.signal }), second = engine('Ford Bronco DR')
  await started.promise; await tick(); a.abort(); await assert.rejects(first, { name: 'AbortError' })
  finish.resolve(); const result = await second
  assert.equal(calls, 1); assert.equal(result.results.length, 1)
})

test('a relevant fast marketplace is not queued behind unrelated slow catalog scans', async () => {
  const order = []
  const engine = createSearchEngine({ providerList: [provider('scan'), provider('renderhub')], concurrency: 1,
    adapterMap: new Map(), genericSearch: async p => { order.push(p.id); return page(p.id) } })
  const result = await engine('Ford Bronco DR')
  assert.equal(order[0], 'renderhub'); assert.deepEqual(result.sources.map(source => source.provider), ['scan', 'renderhub'])
})

test('SSE partial updates do not inflate provider completion or result counts', async () => {
  const app = express()
  registerProgressiveSearchRoute(app, async (query, { emit }) => {
    const event = { type: 'source', source: { provider: 'test', count: 1 }, results: [row('test')] }
    emit({ ...event, interim: true }); emit({ ...event, interim: true }); emit(event)
    return { query, total: 1, providerCount: 1 }
  })
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search/stream?q=Ford%20Bronco%20DR`)
    const events = (await response.text()).split('\n').filter(line => line.startsWith('data:')).map(line => JSON.parse(line.slice(5)))
    const updates = events.filter(e => e.type === 'source')
    assert.deepEqual(updates.map(e => e.completed), [0, 0, 1]); assert.deepEqual(updates.map(e => e.totalResults), [1, 1, 1])
    assert.equal(events.at(-1).completed, 1)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
