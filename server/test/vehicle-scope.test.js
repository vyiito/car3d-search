import test from 'node:test'
import assert from 'node:assert/strict'
import { isVehicleResult, prepareResults, relevanceScore } from '../src/search-core.js'
import { decorateResult } from '../src/search.js'
import { searchWordPress } from '../src/structured-adapters.js'
import { createSearchEngine } from '../src/search-engine.js'
import { search3DSky } from '../src/3dsky-adapter.js'

const row = (title, extra = {}) => ({ title, sourceId: 'done3d', source: 'Done3D', sourceUrl: 'https://done3d.com/models/' + encodeURIComponent(title), vehicleClass: 'Car', game: 'Assetto Corsa', score: 1, formats: [], ...extra })

// Observed in the production `car` response on 2026-10-15.
const nonVehicles = ['AKS 74U Carbine', 'Amaroo Park Raceway v2.2 (Assettomods) – Patreon Download', 'Canberra Street Circuit (Assettomods) – Patreon Download', 'Bathurst 2001 v1.0 (Assettomods) – Patreon Download', 'Cartoon Medieval City House', 'Athletic Cartoon Girl', 'Carpet', 'Anzi Carpet Hand Tufted Carpet', 'Caracole Classic King Bed', 'Abstract art in carved frames', 'Auto Overpass Editable Low Poly', 'Car Seat 010 Concept$2.00', 'Car Seats of Ford Mustang Shelby$25.00', 'Common Car Textures', 'Download Assetto Corsa Rally For PC', 'City Car Driving 2.0 PC Download Full Version']

test('generic and game searches reject observed non-vehicles even from a dedicated source', () => {
  for (const title of nonVehicles) {
    const result = row(title)
    for (const query of ['car', 'Assetto Corsa', title]) assert.equal(relevanceScore(result, query), 0, `${query}: ${title}`)
    assert.equal(decorateResult(result, { id: 'done3d' }), null, title)
  }
})

test('game, inferred class, brand, tags and model flags cannot rescue unrelated subjects', () => {
  for (const title of ['BMW Garage', 'Nissan Skyline City Map', 'Ford Rifle', 'Porsche 911 skin', 'Ferrari showroom', 'Car wallpaper', 'MG42', 'RAM 16GB', 'Lotus flower', 'Jaguar animal']) {
    const result = row(title, { brand: 'BMW', tags: ['car', 'BMW'], isModelListing: true, vehicleEvidence: 'catalog', description: 'BMW E36 and Toyota Supra are in this game.' })
    // Explicit catalog evidence can retain unusual car names, never maps,
    // weapons, parts or unrelated props; ambiguous names need title evidence.
    if (['RAM 16GB', 'Lotus flower'].includes(title)) delete result.vehicleEvidence
    assert.equal(isVehicleResult(result), false, title)
  }
})

test('valid cars, trucks, bikes, aircraft and armed vehicles survive overlapping names', () => {
  const titles = ['BMW M3 E36', 'Nissan Skyline R34', 'Toyota Supra MK4', 'Ferrari 488 Pista', 'Honda City', 'Lincoln Town Car', 'Porsche 911 GT3 Track Car', 'Lotus Exige 240R Track RBMS', 'Mini Cooper', 'Seat Ibiza', 'MAN TGX', 'RAM 1500', 'Jaguar F-Type', 'Caterpillar D6', 'Ducati Panigale V4', '1933 Duesenberg SJ Speedster', '1967 Shelby Cobra GT500', 'Dallara Stradale-X', 'Asphalt 8 Airborne: 2017 Equus Bass 770 M&T', 'Mercedes-AMG C 63 Touring Car 2016 Models&Textures', 'CarPack ACD 687', 'Aleš Pogačar LS3 S14A', 'F1 2010 Red Bull RB6', 'Boeing 747 airplane', 'Fishing boat', 'M1A2 Abrams tank with machine gun', 'Mars rover', 'retro bumper car']
  for (const title of titles) assert.equal(isVehicleResult(row(title)), true, title)
  assert.equal(isVehicleResult(row('Chevrolet Corvette ZR1 C6 Circuit', { vehicleEvidence: 'catalog' })), true)
  assert.equal(isVehicleResult(row('Chevrolet Corvette C6 Circuit Map', { vehicleEvidence: 'catalog' })), false)
})

test('descriptions and vehicle-like defaults do not establish an unknown item as a vehicle', () => {
  assert.equal(isVehicleResult(row('Unknown asset', { description: 'BMW E36 sports car', brand: 'BMW' })), false)
  assert.equal(isVehicleResult(row('Unknown asset', { vehicleEvidence: 'catalog' })), true)
  assert.equal(isVehicleResult(row('Vehicle pack', { includedVehicles: ['AK47 Rifle', 'Tokyo Map'] })), false)
  assert.equal(isVehicleResult(row('Collection', { includedVehicles: ['BMW E36'] })), true)
  assert.equal(isVehicleResult(row('Collection', { includedVehicles: ['AK47 Rifle', 'Tokyo Map'] })), false)
})

test('a vehicle mentioned inside a scene does not make the scene a vehicle listing', () => {
  for (const title of ['Car parking with spaces for the disabled', 'Boy with a car', 'Car Stage', 'Train Car and Tunel Animated']) assert.equal(isVehicleResult(row(title)), false, title)
  assert.equal(isVehicleResult(row('BMW E36 Stage 3')), true)
  assert.equal(isVehicleResult(row('Cartoon Bulldozer')), true)
})

test('a non-vehicle category URL overrides title and copied vehicle metadata', () => {
  for (const path of ['/maps/BMW-E36', '/weapons/car', '/tracks/Ferrari', '/liveries/Porsche-911']) assert.equal(isVehicleResult(row('BMW E36', { sourceUrl: 'https://example.com' + path })), false)
})

test('vehicle filtering runs before final result limits and cached SSE/REST delivery', async () => {
  const provider = { id: 'done3d', name: 'Done3D', baseUrl: 'https://done3d.com', buildUrl: () => 'https://done3d.com' }
  const engine = createSearchEngine({ providerList: [provider], adapterMap: new Map([['done3d', async () => ({ results: [...nonVehicles.map(title => row(title)), row('BMW E36')], pagesFetched: 1, stopReason: 'exhausted' })]]) })
  const events = []
  const payload = await engine('car', { perSource: 1, emit: event => events.push(event) })
  assert.deepEqual(payload.results.map(item => item.title), ['BMW E36'])
  assert.equal(events[0].source.count, 1)
  const cached = await engine('car', { perSource: 1 })
  assert.equal(cached.cached, true); assert.equal(cached.total, 1)
})

test('typed WordPress car catalogs retain unusual trim names but still exclude explicit maps', async t => {
  const posts = ['Chevrolet Corvette ZR1 C6 Circuit', 'Unknown special edition', 'BMW E36 map'].map((title, index) => ({ title: { rendered: title }, link: 'https://www.assettohub.com/model-' + index }))
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify(posts), { headers: { 'content-type': 'application/json', 'x-wp-totalpages': '1' } }))
  const payload = await searchWordPress('assettohub', 'Assetto Corsa', 20)
  assert.deepEqual(payload.results.map(item => item.title).sort(), posts.slice(0, 2).map(post => post.title.rendered).sort())
})

test('transport taxonomy can establish unusual model names before adapter limits', async t => {
  const models = ['Experimental Z', 'BMW Map', 'Glock Pistol'].map((title, index) => ({ title_en: title, slug: 'model-' + index, category_parent: { slug: 'transport' }, model_type: 'free' }))
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ data: { models, total_value: 3, per_page: 60 } }), { headers: { 'content-type': 'application/json' } }))
  const payload = await search3DSky('car', 20)
  assert.deepEqual(prepareResults(payload.results, 'car').map(item => item.title), ['Experimental Z'])
})
