import { test, expect } from '@playwright/test'
import { resolve } from 'node:path'
import { unzipSync, strFromU8 } from 'fflate'

const source = 'https://www.classic.com/veh/1991-acura-nsx-example/'
async function installTestRuntime(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    ;(window as any).chrome = { runtime: { id: 'test-reader', onMessage: { addListener(fn: unknown) { (window as any).readerHandler = fn } }, sendMessage: async () => ({ ready: true }) } }
  })
}

test('the public-page reader follows gallery controls and returns only published full-size images', async ({ page }) => {
  await installTestRuntime(page)
  await page.route('https://images.classic.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/mXPo5QAAAABJRU5ErkJggg==', 'base64') }))
  await page.route(source, route => route.fulfill({ contentType: 'text/html', body: `<h1>1991 Acura NSX</h1><dl><dt>Year</dt><dd>1991</dd><dt>Make</dt><dd>Acura</dd><dt>Model Family</dt><dd>NSX</dd></dl><button aria-label="Open full gallery" id="open">Photos</button><div id="vehicle-image-gallery" style="display:none"></div><script>
    const root=document.getElementById('vehicle-image-gallery');
    function picture(i){ root.innerHTML='<button>View All (4)</button><img alt="1991 Acura NSX photo" width="180" height="100" srcset="https://images.classic.com/vehicles/photo-'+i+'.jpg?w=1000 1000w, https://images.classic.com/vehicles/photo-'+i+'.jpg?w=2000 2000w"><span>'+(i+1)+' of 4</span>'+(i<3?'<button id="next">chevron_right</button>':''); if(i<3)document.getElementById('next').onclick=()=>picture(i+1); }
    document.getElementById('open').onclick=()=>{root.style.display='block';root.innerHTML='<p>View All (4)</p>'+[0,1,2,3].map(i=>'<button data-index="'+i+'"><img alt="1991 Acura NSX photo" width="80" height="50" src="https://images.classic.com/vehicles/photo-'+i+'.jpg?w=200"></button>').join(''); for(const b of root.querySelectorAll('button'))b.onclick=()=>picture(Number(b.dataset.index));}
    </script>` }))
  await page.goto(source)
  await page.addScriptTag({ path: resolve('classic-reader/classic-page.js') })
  const response = await page.evaluate(() => new Promise<any>(resolve => (window as any).readerHandler({ action: 'vj-classic-read', kind: 'gallery' }, { id: 'test-reader' }, resolve)))
  expect(response.error).toBeUndefined()
  expect(response.document.title).toBe('1991 Acura NSX'); expect(response.document.totalAvailable).toBe(4)
  expect(response.document.images.map((image: any) => image.url)).toEqual([0, 1, 2, 3].map(i => `https://images.classic.com/vehicles/photo-${i}.jpg?w=2000`))
  expect(response.document.limited).toBe(false); expect(response.document.resolution).toBe('published-full')
  expect(response.document.identityEvidence).toBe('1991 Acura NSX')
})

test('a verification page asks for manual access and never attempts to complete the challenge', async ({ page }) => {
  await installTestRuntime(page)
  const url = 'https://www.classic.com/search/?q=1991+Acura+NSX'
  await page.route(url, route => route.fulfill({ contentType: 'text/html', body: '<title>Just a moment...</title><h1>Verificação de segurança</h1><button onclick="window.clicked=true">Verify</button>' }))
  await page.goto(url); await page.addScriptTag({ path: resolve('classic-reader/classic-page.js') })
  const response = await page.evaluate(() => new Promise<any>(resolve => (window as any).readerHandler({ action: 'vj-classic-read', kind: 'search' }, { id: 'test-reader' }, resolve)))
  expect(response.error).toContain('verificação manual')
  expect(await page.evaluate(() => (window as any).clicked)).toBeUndefined()
})

test('the VJ uses the connected browser after an HTTP refusal and imports its public gallery', async ({ page }) => {
  const title = '1991 Acura NSX', imports: any[] = []
  await page.addInitScript(({ source, title }) => {
    window.addEventListener('message', event => {
      const d = event.data
      if (event.source !== window || d?.channel !== 'vj-classic-reader-v1') return
      if (d.type === 'PING') window.postMessage({ channel: d.channel, type: 'RESPONSE', id: d.id, installed: true }, location.origin)
      if (d.type === 'REQUEST') {
        const document = d.action === 'search' ? { url: d.url, listings: [{ title, url: source }], nextUrl: null } : { url: source, title, images: [{ url: 'https://images.classic.com/vehicles/test.jpg?w=2000' }], totalAvailable: 1, resolution: 'published-full' }
        window.postMessage({ channel: d.channel, type: 'RESPONSE', id: d.id, document }, location.origin)
      }
    })
  }, { source, title })
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const path = new URL(route.request().url()).pathname
    const model = { title, id: 'nsx', sourceId: 'renderhub', source: 'RenderHub', sourceType: '3d-models', sourceUrl: 'https://www.renderhub.com/example/nsx', imageUrl: null, formats: [], price: null, vehicleClass: 'Car', brand: 'Acura', year: 1991 }
    if (path === '/api/search/stream') return route.fulfill({ contentType: 'text/event-stream', body: [{ type: 'source', results: [model], source: { provider: 'renderhub', name: 'RenderHub', status: 'ok', count: 1 }, completed: 1 }, { type: 'done', completed: 1, providerCount: 1 }].map(e => `data: ${JSON.stringify(e)}\n\n`).join('') })
    if (path === '/api/details') return route.fulfill({ json: model })
    if (path === '/api/classic/references') return route.fulfill({ json: { query: title, searchUrl: 'https://www.classic.com/search/?q=1991+Acura+NSX', status: 'blocked', listings: [], page: 1, hasMore: false, message: 'HTTP 403' } })
    if (path === '/api/classic/references/browser-import') {
      const body = route.request().postDataJSON(); imports.push(body)
      return route.fulfill({ json: body.kind === 'search' ? { query: title, searchUrl: body.document.url, status: 'ok', transport: 'browser', listings: [{ id: 'listing', title, url: source }], page: 1, hasMore: false, message: 'Exemplares confirmados pelo navegador.' } : { id: 'browser-gallery', title, sourceUrl: source, query: title, status: 'ok', transport: 'browser', resolution: 'published-full', images: [{ id: 'photo', url: 'https://images.classic.com/vehicles/test.jpg?w=2000', caption: title, sourceUrl: source }], message: 'Fotos públicas carregadas pelo navegador.', maxPhotos: 200, maxZipBytes: 67108864 } })
    }
    return route.fulfill({ status: 404, json: { error: 'No fixture' } })
  })
  await page.route('https://images.classic.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/mXPo5QAAAABJRU5ErkJggg==', 'base64') }))
  await page.goto('/?q=1991+Acura+NSX'); await page.locator('.card h3').click()
  const panel = page.locator('.classicPanel')
  await expect(panel.locator('.classicPhoto')).toHaveCount(1)
  await expect(panel).toContainText('Carregada pelo leitor do navegador')
  expect(imports.some(item => item.kind === 'search')).toBe(true); expect(imports.some(item => item.kind === 'gallery')).toBe(true)
  const zip = await page.request.get('/classic-reader.zip'); expect(zip.ok()).toBe(true)
  const entries = unzipSync(await zip.body()), manifest = JSON.parse(strFromU8(entries['classic-reader/manifest.json']))
  expect(manifest.manifest_version).toBe(3); expect(manifest.permissions).toBeUndefined(); expect(manifest.host_permissions).toBeUndefined()
  expect(manifest.content_scripts[1].matches).toEqual(['https://www.classic.com/search*', 'https://www.classic.com/veh/*', 'https://www.classic.com/a/*/lots/*'])
})
