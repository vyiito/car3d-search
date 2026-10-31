import test from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
const code = await readFile(new URL('../../classic-reader/background.js', import.meta.url), 'utf8')

function runtime({ earlyReady = false } = {}) {
  let listener, nextId = 10
  const created = [], removed = []
  const chrome = { runtime: { id: 'reader', onMessage: { addListener(fn) { listener = fn } } }, tabs: {
    async create(options) { const tab = { id: nextId++ }; created.push(options); const ready = () => listener({ action: 'vj-classic-ready' }, { id: 'reader', tab, url: options.url }, () => {}); if (earlyReady) ready(); else setTimeout(ready, 0); return tab },
    async sendMessage(id) { return { document: { url: created[id - 10].url, listings: [] } } },
    async remove(id) { removed.push(id) },
  } }
  vm.runInNewContext(code, { chrome, URL, Map, Promise, setTimeout, clearTimeout })
  const request = (message, sender = { id: 'reader', url: 'https://vyiito.github.io/car3d-search/', tab: { id: 3 } }) => new Promise(resolve => { if (!listener(message, sender, resolve)) resolve(undefined) })
  return { request, created, removed }
}

test('the browser reader opens only public CLASSIC pages requested from the VJ', async () => {
  const { request, created, removed } = runtime()
  const result = await request({ action: 'search', requestId: 'one', url: 'https://www.classic.com/search/?q=1991+Acura+NSX' })
  assert.equal(result.document.url, created[0].url); assert.equal(created[0].openerTabId, 3); assert.deepEqual(removed, [10])
  assert.equal(await request({ action: 'search', requestId: 'two', url: created[0].url }, { id: 'reader', url: 'https://evil.test', tab: { id: 4 } }), undefined)
  assert.equal(await request({ action: 'search', requestId: 'three', url: created[0].url }, { id: 'other-extension', url: 'https://vyiito.github.io/car3d-search/' }), undefined)
  assert.equal(created.length, 1)
})

test('a content script ready before tab creation resolves is not lost', async () => {
  const { request, removed } = runtime({ earlyReady: true })
  const result = await request({ action: 'search', requestId: 'early', url: 'https://www.classic.com/search/?q=Acura+NSX' })
  assert.ok(result.document); assert.deepEqual(removed, [10])
})

test('foreign URLs, credentials, HTTP and private account routes cannot be sent to the reader', async () => {
  const { request, created } = runtime()
  for (const url of ['https://evil.test/veh/car/', 'http://www.classic.com/veh/car/', 'https://www.classic.com/account/login', 'https://name:secret@www.classic.com/veh/car/']) {
    const response = await request({ action: 'gallery', requestId: url, url })
    assert.match(response.error, /somente páginas públicas/)
  }
  assert.equal(created.length, 0)
})
