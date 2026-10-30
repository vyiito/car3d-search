import test from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createClassicReferences, registerClassicReferenceRoutes } from '../src/classic-references.js'

const origin = 'https://www.classic.com'
const listing = '/veh/2023-ford-bronco-dr-abc-123/'
const other = '/veh/2023-ford-bronco-raptor-456/'
const photo = name => `https://images.classic.com/vehicles/${name}.jpg`
const asset = { title: 'Ford Bronco DR 2023 - 3D Model', brand: 'Ford' }
const searchHtml = `<article><a href="${listing}"><h3>2023 Ford Bronco DR</h3><img src="${photo('cover')}"></a></article><article><a href="${other}">2023 Ford Bronco Raptor</a></article>`
const galleryHtml = `<h1>2023 Ford Bronco DR</h1><meta property="og:image" content="${photo('cover')}"><div class="gallery"><img alt="Front" src="${photo('front')}?w=200" srcset="${photo('front')}?w=600 600w, ${photo('front')}?w=1800 1800w"><a href="${photo('rear')}"><img src="${photo('rear')}?w=200" alt="Rear"></a></div><aside class="related"><h3>Ford Bronco Raptor</h3><img src="${photo('wrong')}"></aside><footer><img src="https://images.classic.com/logos/logo.jpg"></footer>`
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 8, 1, 2, 3, 4])
const html = text => new Response(text, { headers: { 'content-type': 'text/html' } })
function setup({ gallery = galleryHtml, search = searchHtml, imageResponse, ...options } = {}) {
  const requests = []
  const service = createClassicReferences({ ...options, fetchImpl: async (url, init) => {
    requests.push(String(url))
    if (init.signal?.aborted) throw init.signal.reason
    if (String(url).startsWith('https://images.classic.com/')) return imageResponse ? imageResponse(url) : new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } })
    return html(String(url).includes('/search/') ? search : gallery)
  } })
  return { service, requests }
}

test('CLASSIC search keeps the exact variant and year and caches the public query', async () => {
  const { service, requests } = setup()
  const found = await service.search(asset)
  assert.equal(found.status, 'ok'); assert.equal(found.listings.length, 1)
  assert.equal(found.listings[0].url, origin + listing)
  assert.equal(new URL(requests[0]).searchParams.get('q'), '2023 Ford Bronco DR')
  await service.search(asset); assert.equal(requests.length, 1)
  const wrongYear = await service.search({ title: '2022 Ford Bronco DR' })
  assert.equal(wrongYear.listings.length, 0)
})

test('gallery images belong to the chosen vehicle and prefer published full-size variants', async () => {
  const { service } = setup()
  const pack = await service.gallery(asset, origin + listing)
  assert.equal(pack.status, 'ok'); assert.equal(pack.kind, 'public-gallery')
  assert.deepEqual(pack.images.map(item => item.url), [photo('front') + '?w=1800', photo('rear')])
  assert.ok(pack.id); assert.ok(pack.images.every(item => item.id && item.sourceUrl === origin + listing))
})

test('a related heading cannot make a different generation or variant pass identity checks', async () => {
  const { service } = setup({ gallery: `<h1>2023 Ford Bronco Raptor</h1><div class="gallery"><img src="${photo('wrong')}"></div><aside class="related">2023 Ford Bronco DR</aside>` })
  const pack = await service.gallery(asset, origin + other)
  assert.equal(pack.status, 'mismatch'); assert.equal(pack.images.length, 0)
})

test('primary images are labeled as a preview, and restricted galleries are never extracted', async () => {
  const { service } = setup({ gallery: `<h1>2023 Ford Bronco DR</h1><meta property="og:image" content="${photo('cover')}">Loading gallery images...` })
  const pack = await service.gallery(asset, origin + listing)
  assert.equal(pack.kind, 'preview-only'); assert.equal(pack.images.length, 1)
  const locked = setup({ gallery: `<h1>2023 Ford Bronco DR</h1><div class="gallery" data-locked="true">Upgrade to unlock gallery<img src="${photo('secret')}"></div>` })
  const denied = await locked.service.gallery(asset, origin + listing)
  assert.equal(denied.status, 'access-required'); assert.equal(denied.images.length, 0)
})

test('a 403 is explicit and pauses requests across vehicles without fabricating results', async () => {
  let calls = 0
  const service = createClassicReferences({ fetchImpl: async () => { calls++; return new Response('Just a moment', { status: 403 }) } })
  const first = await service.search(asset), next = await service.search({ title: 'BMW M3 E36' })
  assert.equal(first.status, 'blocked'); assert.equal(next.status, 'blocked')
  assert.equal(next.listings.length, 0); assert.equal(calls, 1); assert.ok(next.retryAt)
  assert.equal(new URL(next.searchUrl).searchParams.get('q'), 'BMW M3 E36')
})

test('gallery and image redirects cannot reach arbitrary hosts, private URLs or login pages', async () => {
  const { service, requests } = setup()
  await assert.rejects(service.gallery(asset, 'http://127.0.0.1/veh/car'), /CLASSIC.COM/)
  await assert.rejects(service.gallery(asset, 'https://www.classic.com@127.0.0.1/veh/car'), /CLASSIC.COM/)
  assert.equal(requests.length, 0)
  const redirected = createClassicReferences({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://localhost/private' } }) })
  const pack = await redirected.gallery(asset, origin + listing)
  assert.equal(pack.status, 'error'); assert.equal(pack.images.length, 0)
  const login = createClassicReferences({ fetchImpl: async () => new Response(null, { status: 302, headers: { location: '/account/login' } }) })
  assert.equal((await login.search(asset)).status, 'access-required')
})

test('ZIP accepts only server-issued photo IDs and includes the selected photos plus sources', async () => {
  const { service } = setup()
  const gallery = await service.gallery(asset, origin + listing)
  await assert.rejects(service.zip(gallery.id, { ids: ['https://127.0.0.1/secret'] }), /seleção/i)
  const zip = await service.zip(gallery.id, { ids: [gallery.images[1].id] })
  assert.equal(zip.buffer.readUInt32LE(0), 0x04034b50)
  assert.equal(zip.count, 1); assert.match(zip.buffer.toString(), /sources\.txt/)
  assert.match(zip.buffer.toString(), /rear\.jpg/); assert.doesNotMatch(zip.buffer.toString(), /front\.jpg/)
  const all = await service.zip(gallery.id, { all: true }); assert.equal(all.count, 2)
})

test('oversized images, non-images, failed downloads and expired packs cannot yield a misleading ZIP', async () => {
  let now = 100
  const expired = setup({ now: () => now, cacheTtlMs: 10 })
  const pack = await expired.service.gallery(asset, origin + listing); now = 200
  await assert.rejects(expired.service.zip(pack.id, { all: true }), /expirou/i)
  for (const imageResponse of [() => new Response('login', { headers: { 'content-type': 'text/html' } }), () => new Response(jpeg, { headers: { 'content-type': 'image/jpeg', 'content-length': String(20 * 1024 * 1024) } }), () => new Response(null, { status: 403 })]) {
    const { service } = setup({ imageResponse }), gallery = await service.gallery(asset, origin + listing)
    await assert.rejects(service.zip(gallery.id, { all: true }))
  }
})

test('JSON-LD only supplies photos from the matching vehicle, not related products or organizations', async () => {
  const data = { '@graph': [{ '@type': 'Vehicle', name: '2023 Ford Bronco DR', image: [photo('front'), { '@type': 'ImageObject', contentUrl: photo('rear') }] }, { '@type': 'Vehicle', name: '2023 Ford Bronco Raptor', image: photo('wrong') }, { '@type': 'Organization', image: photo('logo') }] }
  const { service } = setup({ gallery: `<h1>2023 Ford Bronco DR</h1><script type="application/ld+json">${JSON.stringify(data)}</script>` })
  assert.deepEqual((await service.gallery(asset, origin + listing)).images.map(i => i.url), [photo('front'), photo('rear')])
})

test('published gallery originals replace low-resolution JSON-LD copies without inventing URLs', async () => {
  const data = { '@type': 'Vehicle', name: '2023 Ford Bronco DR', image: photo('front') + '?w=300' }
  const { service } = setup({ gallery: `<h1>2023 Ford Bronco DR</h1><script type="application/ld+json">${JSON.stringify(data)}</script><div class="gallery"><img src="${photo('front')}?w=200" data-original="${photo('front')}?w=2400"></div>` })
  assert.deepEqual((await service.gallery(asset, origin + listing)).images.map(i => i.url), [photo('front') + '?w=2400'])
})

test('published pagination preserves the exact query and never fabricates a complete catalog', async () => {
  const { service, requests } = setup({ search: searchHtml + '<a href="?page=1" rel="next">Next</a>' })
  assert.equal((await service.search(asset)).hasMore, true)
  await service.search(asset, { page: 2 })
  assert.equal(new URL(requests[1]).searchParams.get('q'), '2023 Ford Bronco DR')
  assert.equal(new URL(requests[1]).searchParams.get('page'), '1')
  await assert.rejects(service.search(asset, { page: 200 }), /Página inválida/)
})

test('ZIP work is bounded and an excess request cannot grow an unlimited download queue', async () => {
  let release, requested
  const waiting = new Promise(resolve => { requested = resolve }), gate = new Promise(resolve => { release = resolve })
  const { service } = setup({ imageResponse: async () => { requested(); await gate; return new Response(jpeg, { headers: { 'content-type': 'image/jpeg' } }) } })
  const pack = await service.gallery(asset, origin + listing), first = service.zip(pack.id, { all: true })
  await waiting
  const second = service.zip(pack.id, { all: true }), third = service.zip(pack.id, { all: true })
  try { await assert.rejects(service.zip(pack.id, { all: true }), { statusCode: 429 }) }
  finally { release(); await Promise.all([first, second, third]) }
})

test('route validates requests and serves ZIP through a bounded JSON selection', async () => {
  const { service } = setup(), app = express(); app.use(express.json({ limit: '32kb' })); registerClassicReferenceRoutes(app, service)
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  try {
    assert.equal((await fetch(base + '/api/classic/references?title=x')).status, 400)
    const gallery = await (await fetch(base + '/api/classic/references/gallery?title=2023%20Ford%20Bronco%20DR&url=' + encodeURIComponent(origin + listing))).json()
    const response = await fetch(base + '/api/classic/references/zip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ galleryId: gallery.id, ids: [gallery.images[0].id] }) })
    assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /application\/zip/)
    assert.match(response.headers.get('content-disposition'), /attachment/)
    const invalid = await fetch(base + '/api/classic/references/zip', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ galleryId: gallery.id, ids: [] }) })
    assert.equal(invalid.status, 400)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
