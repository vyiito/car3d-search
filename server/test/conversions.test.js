import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import express from 'express'
import { createConversionService } from '../src/conversions.js'

const workerSecret = 'test-worker-secret-not-a-real-credential'
const workerId = 'test_windows_01'
const input = Buffer.concat([Buffer.from('sc6969'), Buffer.alloc(30)])
const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4])

async function fixture(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'vj-conversion-test-'))
  const app = express(); app.use(express.json())
  const service = createConversionService({ directory, workerSecret, ...options }); service.register(app); await service.ready
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(async () => { service.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(directory, { recursive: true, force: true }) })
  const request = (path, { body, headers, ...init } = {}) => fetch(base + path, { ...init, headers: { ...(body && !Buffer.isBuffer(body) ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body && !Buffer.isBuffer(body) ? JSON.stringify(body) : body })
  const worker = (path, body, lease) => request(path, { method: 'POST', body, headers: { Authorization: `Bearer ${workerSecret}`, ...(lease ? { 'X-Lease-Token': lease } : {}) } })
  const connect = async () => { assert.equal((await worker('/api/converter-worker/heartbeat', { workerId })).status, 200) }
  const upload = carFolder => request('/api/conversions', { method: 'POST', body: input, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'Ford%20Mustang.kn5', ...(carFolder ? { 'X-Car-Folder': carFolder } : {}) } })
  const get = saved => request(`/api/conversions/${saved.job.id}`, { headers: { Authorization: `Bearer ${saved.accessToken}` } })
  const claim = async () => (await worker('/api/converter-worker/claim', { workerId })).json()
  return { directory, service, request, worker, connect, upload, get, claim, base }
}

test('uploads require a connected authorized worker and unsupported input never enters the queue', async t => {
  const f = await fixture(t)
  assert.equal((await f.upload()).status, 503)
  assert.equal((await f.request('/api/converter-worker/heartbeat', { method: 'POST', body: { workerId } })).status, 401)
  await f.connect()
  const bad = await f.request('/api/conversions', { method: 'POST', body: Buffer.from('not a KN5'), headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'test.kn5' } })
  assert.equal(bad.status, 415)
  assert.deepEqual(await readdir(f.directory), [])
  const traversal = await f.request('/api/conversions', { method: 'POST', body: input, headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': '..%5Cbad.kn5' } })
  assert.equal(traversal.status, 400)
  assert.equal((await f.upload('../other-car')).status, 400)
})

test('an upload is private, leases are fenced, and only the owner can obtain a temporary ZIP ticket', async t => {
  const f = await fixture(t); await f.connect()
  const response = await f.upload('mnba_ford_mustang_gt_2018'); assert.equal(response.status, 201)
  const saved = await response.json()
  assert.equal(saved.job.filename, 'Ford Mustang.kn5')
  assert.equal((await f.request(`/api/conversions/${saved.job.id}`)).status, 404)
  assert.equal((await f.request(`/api/conversions/${saved.job.id}`, { headers: { Authorization: 'Bearer wrong' } })).status, 404)
  assert.equal((await f.get(saved)).status, 200)
  const state = JSON.parse(await readFile(join(f.directory, saved.job.id, 'state.json')))
  assert.notEqual(state.tokenHash, saved.accessToken)
  assert.equal(state.accessToken, undefined); assert.equal(state._write, undefined)
  const task = await f.claim()
  assert.equal(task.id, saved.job.id)
  assert.equal(task.carFolder, 'mnba_ford_mustang_gt_2018')
  const jobPath = `/api/converter-worker/jobs/${task.id}`
  assert.equal((await f.worker(jobPath + '/progress', { stage: 'converting' }, 'wrong')).status, 409)
  assert.equal((await f.request(jobPath + '/input', { headers: { Authorization: `Bearer ${workerSecret}`, 'X-Lease-Token': task.leaseToken } })).status, 200)
  assert.equal((await f.worker(jobPath + '/progress', { stage: 'converting' }, task.leaseToken)).status, 200)
  assert.equal((await f.worker(jobPath + '/progress', { stage: 'decrypting' }, task.leaseToken)).status, 400)
  const report = { vertices: 3, triangles: 1, meshes: 1, materials: 1, textures: 1, placeholderTextures: 0 }
  assert.equal((await f.worker(jobPath + '/report', report, task.leaseToken)).status, 200)
  await f.worker(jobPath + '/progress', { stage: 'packaging' }, task.leaseToken)
  await f.worker(jobPath + '/progress', { stage: 'uploading' }, task.leaseToken)
  const result = await f.request(jobPath + '/result', { method: 'POST', body: zip, headers: { Authorization: `Bearer ${workerSecret}`, 'X-Lease-Token': task.leaseToken, 'Content-Type': 'application/zip' } })
  assert.equal(result.status, 200)
  const job = await (await f.get(saved)).json()
  assert.equal(job.status, 'completed'); assert.deepEqual(job.report, report)
  assert.equal(job.leaseToken, undefined); assert.equal(job.tokenHash, undefined)
  await assert.rejects(readFile(join(f.directory, task.id, 'input.kn5')))
  assert.equal((await f.request(`/api/conversions/${task.id}/download-ticket`, { method: 'POST' })).status, 404)
  const ticket = await (await f.request(`/api/conversions/${task.id}/download-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${saved.accessToken}` } })).json()
  const download = await f.request(ticket.url)
  assert.equal(download.status, 200)
  assert.match(download.headers.get('content-disposition'), /Ford_Mustang-OBJ.zip/)
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), zip)
  assert.equal((await f.request(ticket.url)).status, 410)
})

test('cancellation invalidates worker progress and prevents stale results from resurrecting a job', async t => {
  const f = await fixture(t); await f.connect()
  const saved = await (await f.upload()).json(), task = await f.claim()
  const cancelled = await f.request(`/api/conversions/${task.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${saved.accessToken}` } })
  assert.equal((await cancelled.json()).status, 'cancelled')
  assert.equal((await f.worker(`/api/converter-worker/jobs/${task.id}/progress`, { stage: 'converting' }, task.leaseToken)).status, 409)
  assert.equal((await f.worker('/api/converter-worker/heartbeat', { workerId, jobId: task.id, leaseToken: task.leaseToken })).status, 409)
  assert.equal((await (await f.get(saved)).json()).status, 'cancelled')
  assert.deepEqual(await readdir(join(f.directory, task.id)), ['state.json'])
})

test('upload limits are enforced and failed streams release queue/storage reservations', async t => {
  const f = await fixture(t, { maxInputBytes: 20 }); await f.connect()
  assert.equal((await f.upload()).status, 413)
  assert.deepEqual(await readdir(f.directory), [])
})

test('a lost worker lease fails safely and expiry deletes both files and access', async t => {
  let time = 1000
  const f = await fixture(t, { now: () => time, leaseMs: 500, retentionMs: 10000 }); await f.connect()
  const saved = await (await f.upload()).json(), task = await f.claim()
  time += 501
  assert.equal((await (await f.get(saved)).json()).status, 'failed')
  assert.equal((await f.worker(`/api/converter-worker/jobs/${task.id}/progress`, { stage: 'converting' }, task.leaseToken)).status, 409)
  time += 10000
  assert.equal((await f.get(saved)).status, 404)
  assert.deepEqual(await readdir(f.directory), [])
})

test('per-client rate limits and queue capacity bound public conversion work', async t => {
  const f = await fixture(t, { rateLimit: 2 }); await f.connect()
  assert.equal((await f.upload()).status, 201)
  assert.equal((await f.upload()).status, 201)
  assert.equal((await f.upload()).status, 429)
})

test('restarting the service never reissues a previously claimed native conversion', async t => {
  const f = await fixture(t); await f.connect()
  const saved = await (await f.upload()).json(); await f.claim()
  const restarted = createConversionService({ directory: f.directory, workerSecret }); t.after(() => restarted.close())
  await restarted.ready
  const app = express(); app.use(express.json()); restarted.register(app)
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve))
  t.after(() => { server.closeAllConnections(); server.close() })
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/conversions/${saved.job.id}`, { headers: { Authorization: `Bearer ${saved.accessToken}` } })
  assert.equal((await response.json()).status, 'failed')
})
