import { test, expect, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { zipSync, strToU8, unzipSync } from 'fflate'

const car = { id: 'bronco', title: '2023 Ford Bronco DR', sourceId: 'renderhub', source: 'RenderHub', sourceType: '3d-models', sourceUrl: 'https://www.renderhub.com/example/ford-bronco-dr', imageUrl: null, formats: ['OBJ'], price: 20, isFree: false, year: 2023, brand: 'Ford', vehicleClass: 'SUV', score: 50 }
const listing = { id: 'listing', title: '2023 Ford Bronco DR', url: 'https://www.classic.com/veh/2023-ford-bronco-dr-123/', imageUrl: null }
const photos = [1, 2, 3].map(index => ({ id: `photo-${index}`, url: `https://images.classic.com/vehicles/${index}.jpg`, caption: `Bronco · foto ${index}`, sourceUrl: listing.url }))
const search = { status: 'ok', query: car.title, searchUrl: 'https://www.classic.com/search/?q=2023%20Ford%20Bronco%20DR', listings: [listing], page: 1, hasMore: false, message: 'Exemplares compatíveis com a identidade informada.' }
const gallery = { id: 'gallery-1', status: 'ok', kind: 'public-gallery', title: car.title, query: car.title, searchUrl: search.searchUrl, sourceUrl: listing.url, images: photos, message: 'Fotos públicas do exemplar selecionado.', maxPhotos: 200, maxZipBytes: 67108864 }

async function setup(page: Page, blocked = false) {
  const zipBodies: any[] = [], searches: string[] = []
  await page.route('https://images.classic.com/**', route => route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/mXPo5QAAAABJRU5ErkJggg==', 'base64') }))
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/search/stream') return route.fulfill({ contentType: 'text/event-stream', body: [{ type: 'source', source: { provider: 'renderhub', name: 'RenderHub', status: 'ok', count: 1 }, results: [car], completed: 1 }, { type: 'done', completed: 1, providerCount: 1 }].map(e => `data: ${JSON.stringify(e)}\n\n`).join('') })
    if (url.pathname === '/api/details') return route.fulfill({ json: { ...car, gallery: [] } })
    if (url.pathname === '/api/classic/references') {
      searches.push(url.searchParams.get('title') || '')
      return route.fulfill({ json: blocked ? { ...search, status: 'blocked', listings: [], message: 'O CLASSIC.COM bloqueou a consulta automática (HTTP 403). A busca no site original continua disponível.' } : search })
    }
    if (url.pathname === '/api/classic/references/gallery') return route.fulfill({ json: gallery })
    if (url.pathname === '/api/classic/references/zip') {
      const body = route.request().postDataJSON(); zipBodies.push(body)
      const chosen = body.all ? photos : photos.filter(p => body.ids.includes(p.id))
      const files = Object.fromEntries(chosen.map(p => [p.id + '.jpg', strToU8(p.id)]))
      return route.fulfill({ contentType: 'application/zip', body: Buffer.from(zipSync({ ...files, 'sources.txt': strToU8(listing.url) })) })
    }
    return route.fulfill({ status: 404, json: { error: 'No fixture' } })
  })
  await page.goto('/?q=Ford+Bronco+DR')
  await page.locator('.card h3').click()
  await expect(page.locator('.classicPanel')).toBeVisible()
  return { zipBodies, searches }
}

test('opening a car loads its exact references; selected and all ZIP downloads contain the intended files', async ({ page }) => {
  const { zipBodies, searches } = await setup(page)
  const panel = page.locator('.classicPanel')
  await expect(panel.locator('.classicPhoto')).toHaveCount(3)
  expect(new Set(searches)).toEqual(new Set([car.title]))
  await page.getByRole('button', { name: 'FOTOS DO CARRO REAL', exact: true }).click()
  await expect(panel.getByRole('heading', { name: /Referências/ })).toBeInViewport()
  const selectedButton = panel.getByRole('button', { name: /Baixar selecionadas/ })
  await expect(selectedButton).toBeDisabled()
  await panel.getByLabel('Selecionar foto 1', { exact: true }).check()
  await panel.getByLabel('Selecionar foto 3', { exact: true }).check()
  await panel.getByRole('button', { name: 'Ampliar foto 2', exact: true }).click()
  await expect(panel.locator('.classicPreview figcaption')).toContainText('2 / 3')
  const first = page.waitForEvent('download'); await selectedButton.click()
  const download = await first, entries = unzipSync(await readFile((await download.path())!))
  expect(Object.keys(entries).sort()).toEqual(['photo-1.jpg', 'photo-3.jpg', 'sources.txt'])
  expect(zipBodies[0]).toEqual({ galleryId: 'gallery-1', ids: ['photo-1', 'photo-3'], all: false })
  const second = page.waitForEvent('download'); await panel.getByRole('button', { name: /Baixar todas/ }).click()
  const all = await second
  expect(Object.keys(unzipSync(await readFile((await all.path())!)))).toHaveLength(4)
  await expect(panel.getByRole('status').filter({ hasText: 'ZIP preparado' })).toContainText('3 foto(s)')
})

test('a blocked source has an original search link and never offers a fictitious gallery or ZIP', async ({ page }) => {
  await setup(page, true)
  const panel = page.locator('.classicPanel')
  await expect(panel).toContainText('HTTP 403')
  await expect(panel.getByRole('link', { name: 'Buscar no site' })).toHaveAttribute('href', search.searchUrl)
  await expect(panel.getByRole('button', { name: /Baixar todas/ })).toHaveCount(0)
  await panel.getByLabel('Marca, modelo, geração, versão e ano').fill('BMW M3 E36')
  const request = page.waitForRequest(request => new URL(request.url()).pathname === '/api/classic/references')
  await panel.getByRole('button', { name: 'Buscar referências', exact: true }).click()
  expect(new URL((await request).url()).searchParams.get('title')).toBe('BMW M3 E36')
})

test('gallery errors and expired ZIPs remain visible; public preview is labeled honestly', async ({ page }) => {
  await setup(page)
  const panel = page.locator('.classicPanel')
  await expect(panel.locator('.classicPhoto')).toHaveCount(3)
  await page.route(url => url.pathname === '/api/classic/references/zip', route => route.fulfill({ status: 410, json: { error: 'A galeria expirou. Busque as fotos novamente.' } }))
  await panel.getByRole('button', { name: /Baixar todas/ }).click()
  await expect(panel.getByRole('alert')).toContainText('expirou')
  await page.route(url => url.pathname === '/api/classic/references/gallery', route => route.fulfill({ json: { ...gallery, kind: 'preview-only', images: [photos[0]], message: 'A página expõe somente a imagem principal. A galeria completa não foi disponibilizada ao leitor público.' } }))
  await panel.getByRole('button', { name: listing.title, exact: true }).click()
  await expect(panel).toContainText('somente a imagem principal')
  await expect(panel.getByRole('button', { name: /Baixar todas/ })).toContainText('(1)')
  await page.route(url => url.pathname === '/api/classic/references/gallery', route => route.fulfill({ json: { ...gallery, status: 'mismatch', images: [], message: 'A página não confirma o mesmo ano, geração e versão do veículo pesquisado.' } }))
  await panel.getByRole('button', { name: listing.title, exact: true }).click()
  await expect(panel).toContainText('não confirma o mesmo ano')
  await expect(panel.locator('.classicPhoto')).toHaveCount(0)
})

test('mobile references fit the viewport and keep checkbox and preview actions usable by keyboard', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 })
  await setup(page)
  const panel = page.locator('.classicPanel')
  await expect(panel.locator('.classicPhoto')).toHaveCount(3)
  await panel.getByLabel('Selecionar foto 2', { exact: true }).focus(); await page.keyboard.press('Space')
  await expect(panel.getByLabel('Selecionar foto 2', { exact: true })).toBeChecked()
  await panel.getByRole('button', { name: 'Ampliar foto 3', exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(panel.locator('.classicPreview figcaption')).toContainText('3 / 3')
  expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
  await page.getByRole('button', { name: 'FOTOS DO CARRO REAL', exact: true }).click()
  await expect(panel.getByRole('heading', { name: /Referências/ })).toBeInViewport()
  await page.screenshot({ path: testInfo.outputPath('classic-mobile-fixture.png') })
})

test('changing exemplars aborts a pending gallery and its late response cannot replace the current photos', async ({ page }) => {
  await setup(page)
  const panel = page.locator('.classicPanel'), second = { ...listing, id: 'second', title: '2023 Ford Bronco DR · exemplar B', url: 'https://www.classic.com/veh/2023-ford-bronco-dr-second/' }
  await expect(panel.locator('.classicPhoto')).toHaveCount(3)
  await page.route(url => url.pathname === '/api/classic/references', route => route.fulfill({ json: { ...search, listings: [listing, second] } }))
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  await page.route(url => url.pathname === '/api/classic/references/gallery', async route => {
    if (new URL(route.request().url()).searchParams.get('url') === listing.url) {
      await gate
      return route.fulfill({ json: gallery }).catch(() => {})
    }
    return route.fulfill({ json: { ...gallery, id: 'second-gallery', title: second.title, sourceUrl: second.url, images: [{ ...photos[0], id: 'second-photo' }] } })
  })
  try {
    await panel.getByRole('button', { name: 'Buscar referências', exact: true }).click()
    await panel.getByRole('button', { name: second.title, exact: true }).click()
    await expect(panel.locator('.classicGalleryTitle h4')).toHaveText(second.title)
    release()
    await expect(panel.locator('.classicPhoto')).toHaveCount(1)
    await expect(panel.locator('.classicGalleryTitle h4')).toHaveText(second.title)
    await panel.getByLabel('Selecionar foto 1', { exact: true }).check()
    const request = page.waitForRequest(request => new URL(request.url()).pathname === '/api/classic/references/zip')
    await panel.getByRole('button', { name: /Baixar selecionadas/ }).click()
    expect((await request).postDataJSON()).toEqual({ galleryId: 'second-gallery', ids: ['second-photo'], all: false })
  } finally { release() }
})
