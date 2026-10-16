import { test, expect, type Page } from '@playwright/test'

const image = 'https://images.example.test/model.svg'
const model = (query = 'BMW E36', index = 0) => ({ id: 'legacy', title: query + ' ' + index, sourceId: 'rigmodels', source: 'RigModels', sourceType: '3d-models', sourceUrl: 'https://rigmodels.com/model.php?view=' + encodeURIComponent(query + index), imageUrl: null, formats: [], price: null, isFree: null, game: null, year: null, score: 1, vehicleClass: 'Car' })
async function serveSearch(page: Page, rows: (query: string) => object[] = query => [model(query)]) {
  await page.route('https://images.example.test/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#654ea3"/></svg>' }))
  await page.route(url => url.pathname === '/api/search/stream', route => {
    const query = new URL(route.request().url()).searchParams.get('q') || 'BMW E36'
    const results = rows(query)
    const events = [{ type: 'source', results, source: { provider: 'rigmodels', name: 'RigModels', status: 'ok', count: results.length, searchUrl: 'https://rigmodels.com', pagesFetched: 1 }, completed: 1 }, { type: 'done', providerCount: 1, completed: 1 }]
    return route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') })
  })
}

test('a broken thumbnail tries its published alternative before consulting the source', async ({ page }) => {
  let lookups = 0
  const alternative = 'https://rigmodels.com/previews/model.svg'
  await serveSearch(page, query => [{ ...model(query), imageUrl: 'https://images.example.test/broken.jpg', previewUrls: ['/previews/model.svg'] }])
  await page.route(alternative, route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="200" height="120" fill="#654ea3"/></svg>' }))
  await page.route('https://images.example.test/broken.jpg', route => route.fulfill({ status: 404 }))
  await page.route(url => url.pathname === '/api/preview', route => { lookups++; return route.fulfill({ json: { images: [] } }) })
  await page.goto('/?q=BMW+E36')
  await page.locator('.card').scrollIntoViewIfNeeded()
  await expect(page.locator('.thumb img')).toHaveAttribute('src', alternative)
  await expect.poll(() => page.locator('.thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(lookups).toBe(0)
})

test('a visible item without a listing image recovers the preview from its own page', async ({ page }) => {
  let lookups = 0, sourceUrl = ''
  await serveSearch(page)
  await page.route(url => url.pathname === '/api/preview', route => {
    lookups++; sourceUrl = new URL(route.request().url()).searchParams.get('url') || ''
    return route.fulfill({ json: { imageUrl: image, images: [image] } })
  })
  await page.goto('/?q=BMW+E36')
  await page.locator('.card').scrollIntoViewIfNeeded()
  await expect(page.locator('.thumb img')).toHaveAttribute('src', image)
  await expect.poll(() => page.locator('.thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(sourceUrl).toContain('model.php?view=BMW%20E360')
  expect(lookups).toBe(1)
  await page.screenshot({ path: '.qa/previews/recovered-card.png' })
})

test('RenderHub promotional images from old results are skipped and replaced by the car preview', async ({ page }) => {
  let lookups = 0, badgeRequests = 0
  const sale = 'https://cdn.renderhub.com/images/sale.png'
  const sourceUrl = 'https://www.renderhub.com/cars/ford-bronco-2023'
  await serveSearch(page, query => [{ ...model(query), sourceId: 'renderhub', source: 'RenderHub', sourceUrl, imageUrl: sale, previewUrls: [sale], gallery: ['https://cdn.renderhub.com/images/icart.png'] }])
  await page.route('https://cdn.renderhub.com/images/**', route => { badgeRequests++; return route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="30"><text y="25">SALE</text></svg>' }) })
  await page.route(url => url.pathname === '/api/preview', route => {
    lookups++
    expect(new URL(route.request().url()).searchParams.get('url')).toBe(sourceUrl)
    return route.fulfill({ json: { images: [sale, image] } })
  })
  await page.goto('/?q=Ford+Bronco')
  await page.locator('.card').scrollIntoViewIfNeeded()
  await expect(page.locator('.thumb img')).toHaveAttribute('src', image)
  await expect.poll(() => page.locator('.thumb img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  expect(lookups).toBe(1)
  expect(badgeRequests).toBe(0)
})

test('unavailable metadata leaves an honest fallback without retrying on each render', async ({ page }) => {
  let lookups = 0
  await serveSearch(page)
  await page.route(url => url.pathname === '/api/preview', route => { lookups++; return route.fulfill({ status: 502, json: { error: 'Source unavailable' } }) })
  await page.goto('/?q=BMW+E36')
  await page.locator('.card').scrollIntoViewIfNeeded()
  await expect.poll(() => lookups).toBe(1)
  await expect(page.locator('.thumb')).toContainText('SEM PREVIEW')
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('Toyota Supra')
  await page.waitForTimeout(250)
  expect(lookups).toBe(1)
  await expect(page.locator('.card')).toHaveCount(1)
})

test('changing the query aborts preview recovery and prevents old images from replacing the new model', async ({ page }) => {
  let requested = false, aborted = false
  let releaseOld!: () => void
  const pendingOld = new Promise<void>(resolve => { releaseOld = resolve })
  await serveSearch(page)
  page.on('requestfailed', request => { if (request.url().includes('/api/preview')) aborted = true })
  await page.route(url => url.pathname === '/api/preview', async route => {
    const old = (new URL(route.request().url()).searchParams.get('url') || '').includes('BMW')
    if (old) { requested = true; await pendingOld }
    await route.fulfill({ json: { images: [old ? 'https://images.example.test/old.svg' : image] } }).catch(() => {})
  })
  await page.goto('/?q=BMW+E36')
  await page.locator('.card').scrollIntoViewIfNeeded()
  await expect.poll(() => requested).toBe(true)
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('Toyota Supra')
  await page.locator('.searchBox button').click()
  await expect(page.locator('.card h3')).toHaveText('Toyota Supra 0')
  await page.locator('.card').scrollIntoViewIfNeeded()
  await expect(page.locator('.thumb img')).toHaveAttribute('src', image)
  releaseOld()
  await expect.poll(() => aborted).toBe(true)
  await expect(page.locator('.thumb img')).toHaveAttribute('src', image)
})

test('offscreen cards wait until the user approaches them before fetching metadata', async ({ page }) => {
  const requested: string[] = []
  await serveSearch(page, query => Array.from({ length: 18 }, (_, index) => model(query, index)))
  await page.route(url => url.pathname === '/api/preview', route => {
    requested.push(new URL(route.request().url()).searchParams.get('url') || '')
    return route.fulfill({ json: { images: [image] } })
  })
  await page.goto('/?q=BMW+E36')
  await page.locator('.card').first().scrollIntoViewIfNeeded()
  await expect.poll(() => requested.length).toBeGreaterThan(0)
  expect(requested.some(url => url.endsWith('E3617'))).toBe(false)
  await page.locator('.card').filter({ hasText: 'BMW E36 17' }).scrollIntoViewIfNeeded()
  await expect.poll(() => requested.some(url => url.endsWith('E3617'))).toBe(true)
})
