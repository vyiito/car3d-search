import test from 'node:test'
import assert from 'node:assert/strict'
import * as cheerio from 'cheerio'
import express from 'express'
import { elementImages, linkImages, pageImages, previewUrl } from '../src/preview-images.js'
import { createPreviewResolver, registerPreviewRoute } from '../src/preview-resolver.js'
import { extractHtmlResults } from '../src/search.js'
import { providers } from '../src/providers.js'
import { wireItems } from '../src/catalog-adapters.js'
import { renderItems } from '../src/commerce-adapters.js'
import { prepareResults } from '../src/search-core.js'

test('lazy and responsive images replace placeholders and keep HTTP URLs absolute', () => {
  const $ = cheerio.load('<div><img src="/spacer.gif" data-src="../models/bmw.jpg"><picture><source data-srcset="/small.webp 320w, /large.webp 800w"><img src="data:image/gif;base64,AA"></picture><img src="/logo.png"></div>')
  assert.deepEqual(elementImages($, $('div'), 'https://example.com/catalog/page'), ['https://example.com/models/bmw.jpg', 'https://example.com/large.webp', 'https://example.com/small.webp'])
})

test('matching links supply a model preview without copying the next model', () => {
  const $ = cheerio.load('<div><a href="/bmw"><img src="/bmw.jpg"></a><a href="/bmw">BMW E36</a></div><div><a href="/ford"><img src="/ford.jpg"></a></div><div><a href="/missing">BMW Missing</a></div>')
  assert.deepEqual(linkImages($, $('a').eq(1), 'https://example.com'), ['https://example.com/bmw.jpg'])
  assert.deepEqual(linkImages($, $('a').last(), 'https://example.com'), [])
  const rows = extractHtmlResults({ id: 'test', name: 'Test', baseUrl: 'https://example.com' }, 'BMW E36', 20, '<div class="card"><a href="/e36">BMW E36</a><a href="/e30"><img alt="BMW E30" src="/e30.jpg"></a></div>')
  assert.equal(rows[0].imageUrl, null)
})

test('RigModels anchor fallback keeps its lazy thumbnail and excludes search links', () => {
  const html = '<a href="model.php?view=BMW_E36-3d-model__123" title="BMW E36"><div class="modelbox_desktop"><img data-src="3dmodels/123/Thumb_BMW.jpg"></div></a><a href="/?searchkeyword=BMW">BMW E36</a>'
  const rows = extractHtmlResults(providers.find(p => p.id === 'rigmodels'), 'BMW E36', 20, html)
  assert.equal(rows.length, 1); assert.equal(rows[0].imageUrl, 'https://rigmodels.com/3dmodels/123/Thumb_BMW.jpg')
})

test('Wire Wheels own-link images and RenderHub flex cards retain the correct previews', () => {
  const wire = '<a class="portfolio-item gallery-item" href="bmw/"><img src="/resources/bmw.jpg" alt="BMW E36"></a>'
  assert.equal(prepareResults(wireItems(wire, 'https://wirewheelsclub.com/models/', 'BMW', false), 'BMW')[0].imageUrl, 'https://wirewheelsclub.com/resources/bmw.jpg')
  const render = '<div class="flexBox"><div class="borderBox"><div class="thmbBox"><a href="/author/bmw"><img src="https://cdn.renderhub.com/author/bmw.jpg" alt="BMW E36"></a></div><a href="/author/bmw">BMW E36 $10.00 FBX</a></div></div>'
  const rows = renderItems(render, 'BMW')
  assert.equal(rows[0].imageUrl, 'https://cdn.renderhub.com/author/bmw.jpg')
})

test('RenderHub sale flags and cart icons cannot replace the linked model thumbnail', () => {
  const url = 'https://cdn.renderhub.com/cars/ford-bronco-2023/ford-bronco-2023.jpg'
  const html = `<div class="flexBox"><div class="borderBox">
    <img class="itmFlag" src="https://cdn.renderhub.com/images/sale.png" alt="On Sale">
    <div class="thmbBox"><a href="/cars/ford-bronco-2023"><img src="${url}" alt="Ford Bronco 2023"></a></div>
    <a href="/cars/ford-bronco-2023">Ford Bronco 2023 $17.99 OBJ FBX</a>
    <img src="https://cdn.renderhub.com/images/icart.png" alt="Add To Cart">
  </div><div class="borderBox"><a href="/cars/ford-bronco-missing">Ford Bronco Missing $10.00 FBX</a></div></div>`
  const rows = renderItems(html, 'Ford Bronco')
  assert.equal(rows.length, 2)
  assert.equal(rows[0].imageUrl, url)
  assert.equal(rows[1].imageUrl, null)
  const $ = cheerio.load(html)
  assert.deepEqual(elementImages($, $('.borderBox').first(), 'https://www.renderhub.com'), [url])
})

test('RenderHub static site images are excluded from page metadata without excluding Saleen models', () => {
  const base = 'https://www.renderhub.com/cars/saleen-s7'
  const model = 'https://cdn.renderhub.com/cars/saleen-s7/saleen-s7.jpg'
  assert.equal(previewUrl('https://cdn.renderhub.com/images/sale.png', base), null)
  assert.equal(previewUrl('/images/sale.png', base), null)
  assert.equal(previewUrl(model, base), model)
  const $ = cheerio.load(`<meta property="og:image" content="https://cdn.renderhub.com/images/sale.png"><script type="application/ld+json">{"@type":"Product","image":"${model}"}</script><article><img src="/images/icart.png"></article>`)
  assert.deepEqual(pageImages($, base), [model])
})

test('page previews use OG, JSON-LD and model galleries while ignoring site chrome', () => {
  const $ = cheerio.load('<meta property="og:image" content="/site-logo.png"><script type="application/ld+json">{"@graph":[{"@type":"Product","image":{"url":"/model.jpg"}}]}</script><header><img src="/header.jpg"></header><img class="work-image" src="/real-gallery.jpg"><img src="/avatar.png"><article><section class="related-models"><img src="/neighbor.jpg"></section></article>')
  assert.deepEqual(pageImages($, 'https://example.com/model'), ['https://example.com/model.jpg', 'https://example.com/real-gallery.jpg'])
  const rig = cheerio.load('<meta property="og:image" content="http://rigmodels.com/3dmodels/123/Prev_BMW.jpg">')
  assert.deepEqual(pageImages(rig, 'https://rigmodels.com/model.php'), ['https://rigmodels.com/3dmodels/123/Prev_BMW.jpg'])
})

const providerList = [{ id: 'test', baseUrl: 'https://example.com' }]
test('preview resolver validates sources, coalesces requests and caches successful metadata', async () => {
  let calls = 0
  const resolve = createPreviewResolver({ providerList, fetchPage: async url => { calls++; return { html: '<meta property="og:image" content="/bmw.jpg">', url } } })
  const [a, b] = await Promise.all([resolve('test', 'https://example.com/bmw'), resolve('test', 'https://example.com/bmw#preview')])
  assert.equal(calls, 1); assert.deepEqual(a, b); assert.equal(a.imageUrl, 'https://example.com/bmw.jpg')
  await resolve('test', 'https://example.com/bmw'); assert.equal(calls, 1)
  await assert.rejects(resolve('unknown', 'https://example.com/bmw'), /Unknown provider/)
  for (const url of ['https://example.com.evil.test/bmw', 'https://evil.test/bmw', 'https://user:pass@example.com/bmw', 'file:///model']) await assert.rejects(resolve('test', url), /outside provider host/)
  assert.equal(calls, 1)
})

test('preview requests remain bounded and transient failures expire sooner than images', async () => {
  let active = 0, maximum = 0, clock = 0, calls = 0
  const resolve = createPreviewResolver({ providerList, concurrency: 2, now: () => clock, fetchPage: async url => {
    calls++; active++; maximum = Math.max(maximum, active)
    await new Promise(r => setTimeout(r, 10)); active--
    if (calls === 1) throw new Error('HTTP 503')
    return { url, html: '<meta property="og:image" content="/model.jpg">' }
  } })
  const failed = await resolve('test', 'https://example.com/first'); assert.ok(failed.error)
  await resolve('test', 'https://example.com/first'); assert.equal(calls, 1)
  clock = 31000
  await Promise.all(Array.from({ length: 4 }, (_, i) => resolve('test', 'https://example.com/' + i)))
  assert.equal(maximum, 2)
  assert.ok((await resolve('test', 'https://example.com/first')).imageUrl)
})

test('preview resolver reads metadata only and does not follow model downloads', async () => {
  const urls = []
  const resolve = createPreviewResolver({ providerList, fetchPage: async url => { urls.push(url); return { url, html: '<meta property="og:image" content="/model.jpg"><a href="https://files.example.com/model.zip">Download</a>' } } })
  await resolve('test', 'https://example.com/bmw')
  assert.deepEqual(urls, ['https://example.com/bmw'])
  const archives = createPreviewResolver({ providerList: [{ id: 'mediafire-rr3', baseUrl: 'https://www.mediafire.com' }], fetchPage: async () => { throw new Error('must not fetch archive') } })
  const p = await archives('mediafire-rr3', 'https://www.mediafire.com/file/key/car.7z/file')
  assert.deepEqual(p.images, []); assert.equal(p.error, undefined)
})

test('preview fetches follow only provider redirects and accept HTML metadata', async t => {
  const requested = []
  t.mock.method(globalThis, 'fetch', async value => {
    const url = String(value); requested.push(url)
    if (url.endsWith('/redirect')) return new Response(null, { status: 302, headers: { location: '/bmw' } })
    if (url.endsWith('/unsafe')) return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/private' } })
    return new Response('<meta property="og:image" content="/preview.jpg">', { headers: { 'content-type': 'text/html' } })
  })
  const resolve = createPreviewResolver({ providerList })
  assert.equal((await resolve('test', 'https://example.com/redirect')).imageUrl, 'https://example.com/preview.jpg')
  assert.match((await resolve('test', 'https://example.com/unsafe')).error, /outside provider host/)
  assert.deepEqual(requested, ['https://example.com/redirect', 'https://example.com/bmw', 'https://example.com/unsafe'])
})

test('preview route serves fallback URLs and rejects invalid requests', async t => {
  const app = express()
  registerPreviewRoute(app, createPreviewResolver({ providerList, fetchPage: async url => ({ url, html: '<meta property="og:image" content="/bmw.jpg">' }) }))
  const server = app.listen(0); t.after(() => server.close())
  await new Promise(resolve => server.once('listening', resolve))
  const base = 'http://127.0.0.1:' + server.address().port
  assert.equal((await fetch(base + '/api/preview')).status, 400)
  assert.equal((await fetch(base + '/api/preview?sourceId=test&url=https://evil.test')).status, 400)
  const response = await fetch(base + '/api/preview?sourceId=test&url=https://example.com/bmw')
  assert.equal(response.status, 200); assert.equal((await response.json()).imageUrl, 'https://example.com/bmw.jpg')
})
