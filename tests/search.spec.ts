import { test, expect, type Page } from '@playwright/test'

const result = (index: number, query = 'BMW E36') => ({
  id: 'legacy-duplicate-id', title: `${query} ${index}`, source: index % 2 ? 'Sketchfab' : 'CGTrader', sourceId: index % 2 ? 'sketchfab' : 'cgtrader', sourceType: '3d-models',
  sourceUrl: `https://example.com/${query.replace(/\s/g, '-')}/${index}`, imageUrl: null,
  formats: index % 2 ? ['obj', '.OBJ'] : ['FBX'], price: index % 3 === 0 ? null : index % 2 ? 0 : 25,
  isFree: index % 3 === 0 ? null : index % 2 === 1, downloadUrl: null, downloadable: null,
  game: index % 2 ? 'FH5' : 'Assetto Corsa', year: 1993 + index % 6, brand: 'BMW', vehicleClass: 'Car', score: 60,
})
const source = (id: string, count: number) => ({ provider: id, name: id === 'sketchfab' ? 'Sketchfab' : 'CGTrader', status: 'ok', count, pagesFetched: 1, searchUrl: 'https://example.com/search', durationMs: 20 })

async function mockSearch(page: Page, count = 64) {
  const requests: string[] = []
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url())
    if (url.pathname.includes('/search/stream')) {
      const query = url.searchParams.get('q') || 'BMW E36'
      requests.push(query)
      const rows = Array.from({ length: count }, (_, index) => result(index, query))
      const groups = ['sketchfab', 'cgtrader'].map(id => rows.filter(row => row.sourceId === id))
      const events = [{ type: 'start', providerCount: 2 }, ...groups.map((results, index) => ({ type: 'source', source: source(index === 0 ? 'sketchfab' : 'cgtrader', results.length), results, completed: index + 1 })), { type: 'done', providerCount: 2, completed: 2, totalResults: count }]
      await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') })
    } else if (url.pathname === '/api/details') await route.fulfill({ json: { title: 'BMW E36 1', downloadUrl: null, gallery: [], formats: ['OBJ'], year: 1994 } })
    else if (url.pathname === '/api/references') await route.fulfill({ json: { images: [], angleCoverage: [], query: 'BMW E36', packId: 'test', downloadableCount: 0 } })
    else await route.fulfill({ status: 503, json: { error: 'Unavailable' } })
  })
  return requests
}

test('unique cards, combined filters, removable chips and pagination', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  await mockSearch(page)
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(50)
  await expect(page.locator('.catalogCounters strong')).toHaveText('64')
  await page.locator('.catalogPagination').getByRole('button', { name: '2', exact: true }).click()
  await expect(page.locator('.card')).toHaveCount(14)
  await page.locator('.marketSegment').getByRole('button', { name: /^Grátis/ }).click()
  await expect(page.locator('.card')).toHaveCount(21)
  await page.locator('.facetChips').getByRole('button', { name: /^OBJ/ }).click()
  await expect(page.locator('.card')).toHaveCount(21)
  await page.locator('.activeFilterStrip').getByRole('button', { name: 'OBJ', exact: true }).click()
  await expect(page).toHaveURL(/price=/)
  await page.getByRole('button', { name: 'LIMPAR FILTROS', exact: true }).click()
  await expect(page.locator('.catalogCounters strong')).toHaveText('64')
  expect(errors).toEqual([])
})

test('same query retries; a new query clears filters unless preserve is checked', async ({ page }) => {
  const requests = await mockSearch(page, 12)
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(12)
  const before = requests.length
  await page.locator('.searchBox button').click()
  await expect.poll(() => requests.length).toBeGreaterThan(before)
  await page.locator('.marketSegment').getByRole('button', { name: /^Pago/ }).click()
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('Toyota Supra')
  await page.locator('.searchBox button').click()
  await expect(page.locator('.card')).toHaveCount(12)
  await page.locator('.marketSegment').getByRole('button', { name: /^Pago/ }).click()
  await page.getByRole('checkbox', { name: 'Manter filtros na próxima pesquisa' }).check()
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('Porsche 911')
  await page.locator('.searchBox button').click()
  await expect(page.locator('.card')).toHaveCount(4)
})

test('filters survive reload and browser back restores the previous query', async ({ page }) => {
  await mockSearch(page, 12)
  await page.goto('/?q=BMW+E36&price=Gr%C3%A1tis&format=obj&game=FH5')
  await expect(page.locator('.card')).toHaveCount(4)
  await page.reload()
  await expect(page.locator('.card')).toHaveCount(4)
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('Toyota Supra')
  await page.locator('.searchBox button').click()
  await expect(page.locator('.card')).toHaveCount(12)
  await page.goBack()
  await expect(page.getByRole('textbox', { name: 'Pesquisar veículos' })).toHaveValue('BMW E36')
  await expect(page.locator('.card')).toHaveCount(4)
})

test('navigation source selection uses IDs and brand navigation does not reload', async ({ page }) => {
  await mockSearch(page, 12)
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(12)
  await page.locator('.topbar nav').getByRole('link', { name: 'FONTES' }).click()
  await page.locator('.vjHubCard').filter({ hasText: 'Sketchfab' }).click()
  await expect(page.locator('.card')).toHaveCount(6)
  await page.locator('.topbar nav').getByRole('link', { name: 'MARCAS' }).click()
  await page.locator('.vjHubCard').filter({ hasText: /^\d+Toyota/ }).click()
  await expect(page.getByRole('textbox', { name: 'Pesquisar veículos' })).toHaveValue('Toyota')
  await expect(page.locator('.card')).toHaveCount(12)
})

test('unknown price, invalid year range, keyboard details and distinct favorites', async ({ page }) => {
  await mockSearch(page, 12)
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(12)
  await page.locator('.favoriteButton').nth(0).click()
  await page.locator('.favoriteButton').nth(1).click()
  await expect(page.locator('.heroMetrics')).toContainText('2 favoritos')
  await page.locator('.marketSegment').getByRole('button', { name: /^Não informado/ }).click()
  await expect(page.locator('.card')).toHaveCount(4)
  await page.getByRole('spinbutton', { name: 'Ano inicial' }).fill('2000')
  await page.getByRole('spinbutton', { name: 'Ano final' }).fill('1990')
  await expect(page.getByRole('alert')).toContainText('ano inicial')
  await page.getByRole('button', { name: 'LIMPAR FILTROS', exact: true }).click()
  await page.locator('.card').first().focus(); await page.keyboard.press('Enter')
  await expect(page.locator('.assetDetail')).toBeVisible()
  await page.keyboard.press('Escape'); await expect(page.locator('.assetDetail')).toHaveCount(0)
})

test('mobile filters open, apply and close without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mockSearch(page, 12)
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(12)
  await page.getByRole('button', { name: /^FILTROS/ }).click()
  await expect(page.locator('.filtersPanel')).toBeVisible()
  await page.locator('.marketSegment').getByRole('button', { name: /^Grátis/ }).click()
  await page.getByRole('button', { name: 'Fechar filtros', exact: true }).click({ position: { x: 380, y: 50 } })
  await expect(page.locator('.filtersPanel')).not.toBeVisible()
  await expect(page.locator('.card')).toHaveCount(4)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
})

test('broken streams preserve partial results and offer a retry; no results differs from filtered empty', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), route => route.fulfill({ contentType: 'text/event-stream', body: `data: ${JSON.stringify({ type: 'source', source: source('sketchfab', 1), results: [result(1)], completed: 1 })}\n\n` }))
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(1)
  await expect(page.getByRole('alert')).toContainText('interrompida')
  await expect(page.getByRole('button', { name: 'Tentar novamente', exact: true })).toBeVisible()
  await page.locator('.marketSegment').getByRole('button', { name: /^Pago/ }).click()
  await expect(page.locator('.emptyState')).toContainText('Há resultados na busca')
})

test('missing streaming endpoint falls back to REST; invalid input explains the minimum', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/api/search') await route.fulfill({ json: { results: [result(1)], sources: [source('sketchfab', 1)], searchedProviders: 1, providerCount: 1, total: 1 } })
    else await route.fulfill({ status: 404, json: { error: 'Stream endpoint unavailable' } })
  })
  await page.goto('/?q=BMW+E36')
  await expect(page.locator('.card')).toHaveCount(1)
  await expect(page.locator('.apiWarning')).toHaveCount(0)
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('x')
  await page.locator('.searchBox button').click()
  await expect(page.getByRole('alert')).toContainText('pelo menos 2 caracteres')
})

test('late responses from the previous query cannot replace the current results', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const query = new URL(route.request().url()).searchParams.get('q') || 'BMW E36'
    if (query === 'BMW E36') await new Promise(resolve => setTimeout(resolve, 300))
    const events = [{ type: 'source', source: source('sketchfab', 1), results: [result(1, query)], completed: 1 }, { type: 'done', completed: 1, providerCount: 1 }]
    await route.fulfill({ contentType: 'text/event-stream', body: events.map(event => `data: ${JSON.stringify(event)}\n\n`).join('') }).catch(() => {})
  })
  await page.goto('/?q=BMW+E36')
  await page.getByRole('textbox', { name: 'Pesquisar veículos' }).fill('Toyota Supra')
  await page.locator('.searchBox button').click()
  await expect(page.locator('.card h3')).toHaveText('Toyota Supra 1')
  await page.waitForTimeout(400)
  await expect(page.locator('.card h3')).toHaveText('Toyota Supra 1')
})

test('shared asset links open details even when the asset is absent from search results', async ({ page }) => {
  await mockSearch(page, 0)
  await page.goto('/?q=BMW+E36&asset='+encodeURIComponent('https://sketchfab.com/3d-models/example-id'))
  await expect(page.locator('.assetDetail')).toBeVisible()
  await expect(page.locator('.assetTitleBlock h1')).toHaveText('BMW E36 1')
})

test('game family facet shows its matching count and no-result messages are accurate', async ({ page }) => {
  await page.route(url => url.pathname.startsWith('/api/'), async route => {
    const events = [{ type: 'source', source: source('sketchfab', 1), results: [result(1, 'Need for Speed Heat')].map(row => ({...row, game:'NFS Heat'})), completed: 1 }, { type: 'done', completed: 1, providerCount: 1 }]
    await route.fulfill({ contentType:'text/event-stream', body:events.map(event=>`data: ${JSON.stringify(event)}\n\n`).join('') })
  })
  await page.goto('/?q=Need+for+Speed&game=Need+for+Speed')
  await expect(page.locator('.card')).toHaveCount(1)
  await expect(page.locator('.gameFacets button.active b')).toHaveText('1')
  await page.unrouteAll()
  await mockSearch(page, 0)
  await page.goto('/?q=Unknown')
  await expect(page.locator('.emptyState')).toContainText('NENHUM RESULTADO PARA ESTA PESQUISA')
  await expect(page.locator('.emptyState button')).toHaveCount(0)
})
