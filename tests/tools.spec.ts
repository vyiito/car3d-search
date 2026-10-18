import { test, expect } from '@playwright/test'

const token = 'a'.repeat(64)
const job = (index = 1, status = 'completed') => ({ id: `12345678-1234-1234-1234-${String(index).padStart(12, '0')}`, filename: `Carro ${index}.kn5`, status, progress: status === 'completed' ? 100 : 10, createdAt: Date.now() - index * 1000, updatedAt: Date.now(), expiresAt: Date.now() + 3600000, queuePosition: 1, error: null, outputBytes: 5000, report: { vertices: 3, triangles: 1, meshes: 1, materials: 1, textures: 1, placeholderTextures: 0 } })
const capabilities = { enabled: true, online: true, maxInputBytes: 134217728, maxOutputBytes: 268435456, retentionMinutes: 60, waiting: 0 }

test('site typography loads from the site when external font services are unavailable', async ({ page }) => {
  const external: string[] = [], local: string[] = []
  page.on('request', request => { const url = new URL(request.url()); if (/fonts\.(googleapis|gstatic)\.com/.test(url.hostname)) external.push(request.url()); if (url.pathname.startsWith('/fonts/')) local.push(request.url()) })
  await page.route(/https:\/\/fonts\.(googleapis|gstatic)\.com\//, route => route.abort())
  await page.route('**/api/conversions/capabilities', route => route.fulfill({ json: capabilities }))
  await page.goto('/tools.html')
  const loaded = await page.evaluate(async () => {
    await document.fonts.load('400 16px "Archivo Black"', 'CATÁLOGO')
    await document.fonts.load('800 16px Inter', 'Veículos · Škoda')
    return [...document.fonts].filter(font => font.status === 'loaded').map(font => font.family)
  })
  expect(loaded.some(name => name.includes('Archivo Black'))).toBe(true)
  expect(loaded.some(name => name.includes('Inter'))).toBe(true)
  expect(local.length).toBeGreaterThan(0)
  expect(external).toEqual([])
})

test('tools navigation opens a separate page on desktop and mobile without being swallowed by the navigation hub', async ({ page }) => {
  await page.route('**/api/**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ json: { results: [], sources: [], providerCount: 33, searchedProviders: 0, successfulProviders: 0, ...capabilities } }) : route.continue())
  await page.goto('/')
  await page.locator('.toolsNavLink').click()
  await expect(page).toHaveURL(/tools\.html/)
  await expect(page.getByRole('heading', { name: /DA PISTA/ })).toBeVisible()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.locator('.toolsMobileLink').click()
  await expect(page).toHaveURL(/tools\.html/)
  await expect(page.getByRole('tab', { name: /Conversor KN5/ })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('offline state blocks uploads and invalid files show a useful error', async ({ page }) => {
  await page.route('**/api/conversions/capabilities', route => route.fulfill({ json: { ...capabilities, online: false } }))
  await page.goto('/tools.html')
  await expect(page.getByText('Conversor offline', { exact: true })).toBeVisible()
  await page.getByLabel('Selecionar arquivo KN5').setInputFiles({ name: 'bad.exe', mimeType: 'application/octet-stream', buffer: Buffer.alloc(50) })
  await expect(page.getByRole('alert')).toContainText('Selecione um arquivo .kn5')
  await page.getByLabel('Selecionar arquivo KN5').setInputFiles({ name: 'Carro.kn5', mimeType: 'application/octet-stream', buffer: Buffer.from('sc6969'.padEnd(30, '0')) })
  await expect(page.getByRole('button', { name: 'CONVERTER ARQUIVO' })).toBeDisabled()
  await expect(page.locator('.kn5Dropzone')).toContainText('Carro.kn5')
})

test('upload progress becomes a resumable conversion and refresh preserves private history', async ({ page }) => {
  const queued = job(1, 'queued')
  let uploads = 0
  await page.route('**/api/conversions**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.endsWith('/capabilities')) return route.fulfill({ json: capabilities })
    if (path === '/api/conversions' && route.request().method() === 'POST') {
      uploads++
      expect(route.request().headers()['x-file-name']).toBe('Carro%201.kn5')
      expect(route.request().headers()['x-car-folder']).toBe('original_car_folder')
      expect(route.request().postDataBuffer()?.subarray(0, 6).toString()).toBe('sc6969')
      return route.fulfill({ status: 201, json: { job: queued, accessToken: token } })
    }
    expect(route.request().headers().authorization).toBe(`Bearer ${token}`)
    return route.fulfill({ json: job() })
  })
  await page.goto('/tools.html')
  await expect(page.getByText('Conversor online', { exact: true })).toBeVisible()
  await page.getByLabel('Selecionar arquivo KN5').setInputFiles({ name: 'Carro 1.kn5', mimeType: 'application/octet-stream', buffer: Buffer.from('sc6969'.padEnd(30, '0')) })
  await page.getByLabel('Pasta original do carro').fill('original_car_folder')
  await page.getByRole('button', { name: 'CONVERTER ARQUIVO' }).click()
  await expect(page.getByRole('heading', { name: 'Pronto para baixar' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'BAIXAR ZIP' })).toBeEnabled()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Pronto para baixar' })).toBeVisible()
  expect(uploads).toBe(1)
})

test('conversion history has real pagination and hash navigation survives refresh', async ({ page }) => {
  const history = Array.from({ length: 8 }, (_, index) => ({ job: job(index + 1), accessToken: token }))
  await page.addInitScript(data => localStorage.setItem('vj:conversions:v1', JSON.stringify(data)), history)
  await page.route('**/api/conversions**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill({ json: route.request().url().endsWith('/capabilities') ? capabilities : job() }) : route.continue())
  await page.goto('/tools.html#history')
  await expect(page.locator('.historyList article')).toHaveCount(6)
  await page.getByRole('button', { name: 'Próxima página de conversões' }).click()
  await expect(page.locator('.historyList article')).toHaveCount(2)
  await expect(page.locator('.historyList')).toContainText('Carro 8.kn5')
  await page.getByRole('button', { name: 'Página anterior de conversões' }).click()
  await expect(page.locator('.historyList article')).toHaveCount(6)
  await page.reload()
  await expect(page.getByRole('tab', { name: /Minhas conversões/ })).toHaveAttribute('aria-selected', 'true')
})

test('a cancelled conversion stays cancelled and a server restart does not display a false ready download', async ({ page }) => {
  let cancelled = false
  const saved = { job: job(1, 'decrypting'), accessToken: token }
  await page.addInitScript(data => localStorage.setItem('vj:conversions:v1', JSON.stringify([data])), saved)
  await page.route('**/api/conversions**', route => {
    if (!new URL(route.request().url()).pathname.startsWith('/api/')) return route.continue()
    if (route.request().url().endsWith('/capabilities')) return route.fulfill({ json: capabilities })
    if (route.request().method() === 'DELETE') { cancelled = true; return route.fulfill({ json: job(1, 'cancelled') }) }
    return route.fulfill({ json: job(1, cancelled ? 'cancelled' : 'decrypting') })
  })
  await page.goto('/tools.html')
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Cancelado' })).toBeVisible()
  await page.unroute('**/api/conversions**')
  await page.route('**/api/conversions**', route => new URL(route.request().url()).pathname.startsWith('/api/') ? route.fulfill(route.request().url().endsWith('/capabilities') ? { json: capabilities } : { status: 404, json: { error: 'expired' } }) : route.continue())
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Expirado' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'BAIXAR ZIP' })).toHaveCount(0)
})
