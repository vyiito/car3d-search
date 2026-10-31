import { load } from 'cheerio'
import { createHash, randomBytes } from 'node:crypto'
import pLimit from 'p-limit'
import { canonicalizeVehicleIdentity, scoreReferenceIdentity } from './reference-engine.js'
import { makeZip } from './reference-adapter.js'

const ORIGIN = 'https://www.classic.com'
const MAX_PHOTOS = 200, MAX_IMAGE_BYTES = 12 * 1024 * 1024, MAX_ZIP_BYTES = 64 * 1024 * 1024
const GALLERY = '.gallery,[class*="gallery"],[id*="gallery"],[class*="carousel"],[class*="slideshow"],[data-gallery],[class*="photo-grid"]'
const EXCLUDE = 'aside,header,footer,nav,[class*="related"],[class*="recommend"],[class*="similar"],[class*="seller"],[class*="logo"]'
const clean = value => String(value || '').replace(/\s+/g, ' ').trim()
const normal = value => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
const safeName = value => normal(value).replace(/ /g, '_').slice(0, 90) || 'carro'
const idFor = value => createHash('sha256').update(value).digest('hex').slice(0, 24)
const problem = (message, statusCode = 502, state = 'error') => Object.assign(new Error(message), { statusCode, state })

function pageUrl(value, base = ORIGIN) {
  let url
  try { url = new URL(value, base) } catch { throw problem('Use uma página HTTPS do CLASSIC.COM.', 400) }
  if (url.protocol !== 'https:' || url.username || url.password || url.port || !['classic.com', 'www.classic.com'].includes(url.hostname)) throw problem('Use uma página HTTPS do CLASSIC.COM.', 400)
  url.hostname = 'www.classic.com'; url.hash = ''
  return url
}
function listingUrl(value, base = ORIGIN) {
  const url = pageUrl(value, base)
  if (!/^\/veh\/[^/]+\/?$/.test(url.pathname) && !/^\/a\/[^/]+\/lots\/[^/]+\/?$/.test(url.pathname)) throw problem('Use o link de um veículo ou lote do CLASSIC.COM.', 400)
  url.search = ''; return url.href
}
function imageUrl(value, base = ORIGIN) {
  try {
    const url = new URL(value, base)
    if (url.protocol !== 'https:' || url.hostname !== 'images.classic.com' || url.username || url.password || url.port || !url.pathname.startsWith('/vehicles/') || /\.(?:svg|gif)(?:$|\?)/i.test(url.pathname)) return null
    url.hash = ''; return url.href
  } catch { return null }
}
function matches(identity, title) {
  if (!identity.brand || !` ${normal(title)} `.includes(` ${normal(identity.brand)} `)) return false
  if (identity.yearTrusted && !new RegExp(`\\b${identity.year}\\b`).test(title)) return false
  return scoreReferenceIdentity(identity, { title }).ok
}
function jsonEntities($) {
  const values = []
  const visit = value => {
    if (Array.isArray(value)) return value.forEach(visit)
    if (!value || typeof value !== 'object') return
    values.push(value)
    for (const key of ['@graph', 'mainEntity', 'itemListElement', 'item']) if (value[key]) visit(value[key])
  }
  $('script[type="application/ld+json"]').each((_, node) => { try { visit(JSON.parse($(node).text())) } catch {} })
  return values
}
function extractListings(html, identity, base) {
  const $ = load(html), found = new Map()
  const add = (href, title, preview) => {
    let url
    try { url = listingUrl(href, base) } catch { return }
    title = clean(title)
    // The URL may carry a generation absent from the visible card title.
    const evidence = `${title} ${decodeURIComponent(new URL(url).pathname).replace(/[-/]/g, ' ')}`
    if (!title || !matches(identity, evidence)) return
    const prior = found.get(url)
    found.set(url, { id: idFor(url), title, url, imageUrl: imageUrl(preview) || prior?.imageUrl || null })
  }
  $('a[href]').each((_, node) => {
    const anchor = $(node)
    add(anchor.attr('href'), anchor.find('h2,h3,h4').first().text() || anchor.attr('title') || anchor.find('img').first().attr('alt') || anchor.text(), anchor.find('img').first().attr('data-src') || anchor.find('img').first().attr('src'))
  })
  for (const entity of jsonEntities($)) if (/^(Vehicle|Car|Product)$/i.test(String(entity['@type']))) {
    const preview = Array.isArray(entity.image) ? entity.image[0] : entity.image
    add(entity.url || entity['@id'], entity.name, typeof preview === 'string' ? preview : preview?.url)
  }
  const next = $('a[href],link[rel~="next"]').toArray().some(node => {
    try {
      const url = pageUrl($(node).attr('href'), base), current = new URL(base)
      const nextPage = Number(url.searchParams.get('page'))
      return url.pathname === '/search/' && (!url.searchParams.has('q') || url.searchParams.get('q') === current.searchParams.get('q'))
        && (/next/i.test($(node).attr('rel') || '') || (url.searchParams.has('page') && nextPage > Number(current.searchParams.get('page') || 1)))
    } catch { return false }
  })
  return { listings: [...found.values()].slice(0, 24), hasMore: next }
}
function extractGallery(html, identity, url) {
  const $ = load(html), entities = jsonEntities($)
  const title = clean($('h1').first().text() || $('meta[property="og:title"]').attr('content')).replace(/\s*[-|]\s*CLASSIC\.COM.*$/i, '')
  const breadcrumbs = clean($('[aria-label*="breadcrumb" i],.breadcrumb,[itemtype$="BreadcrumbList"]').text())
  const evidence = `${title} ${breadcrumbs}`
  if (!matches(identity, evidence)) return { status: 'mismatch', title, images: [], message: 'A página não confirma o mesmo ano, geração e versão do veículo pesquisado.' }
  const roots = $(GALLERY).filter((_, node) => !$(node).closest(EXCLUDE).length)
  const locked = roots.toArray().some(node => $(node).attr('data-locked') === 'true' || /(?:unlock|upgrade|subscribe|insider).{0,80}(?:photos|images|gallery)|(?:photos|images|gallery).{0,80}(?:unlock|upgrade|subscribe)/i.test($(node).text()))
    || entities.some(entity => entity.isAccessibleForFree === false && /^(Vehicle|Car|Product|ImageGallery)$/i.test(String(entity['@type'])))
  if (locked) return { status: 'access-required', title, images: [], message: 'Esta galeria exige acesso no CLASSIC.COM.' }
  const images = new Map()
  const add = (value, caption = '') => {
    const source = imageUrl(value, url)
    if (!source) return
    const parsed = new URL(source), key = parsed.pathname
    const quality = Number(parsed.searchParams.get('w') || parsed.searchParams.get('width') || parsed.searchParams.get('h')) || 100000
    if (!images.has(key) || quality > images.get(key).quality) images.set(key, { id: idFor(source), url: source, caption: clean(caption) || title, sourceUrl: url, quality })
  }
  for (const entity of entities) {
    if (!/^(Vehicle|Car|Product|ImageGallery)$/i.test(String(entity['@type'])) || !matches(identity, `${entity.name || ''} ${breadcrumbs}`)) continue
    for (const image of [entity.image || []].flat()) add(typeof image === 'string' ? image : image?.contentUrl || image?.url, image?.caption)
  }
  roots.find('img').each((_, node) => {
    const img = $(node)
    if (img.closest(EXCLUDE).length) return
    const sourceSet = String(img.attr('data-srcset') || img.attr('srcset') || '').split(',').map(value => {
      const [url, descriptor] = value.trim().split(/\s+/); return { url, size: parseFloat(descriptor) || 0 }
    }).sort((a, b) => b.size - a.size)
    const candidates = [img.attr('data-full'), img.attr('data-original'), img.closest('a').attr('href'), ...sourceSet.map(item => item.url), img.attr('data-src'), img.attr('src')]
    const source = candidates.find(value => value && imageUrl(value, url))
    if (source) add(source, img.attr('alt'))
  })
  const kind = images.size ? 'public-gallery' : 'preview-only'
  if (!images.size) add($('meta[property="og:image"]').attr('content'))
  const all = [...images.values()].map(({ quality, ...image }) => image)
  return { status: all.length ? 'ok' : 'empty', title, kind, images: all.slice(0, MAX_PHOTOS), limited: all.length > MAX_PHOTOS,
    message: kind === 'preview-only' ? 'A página expõe somente a imagem principal. A galeria completa não foi disponibilizada ao leitor público.' : 'Fotos públicas do exemplar selecionado. Verifique o anúncio original para confirmar seus detalhes.' }
}

async function readBounded(response, maxBytes) {
  if (Number(response.headers.get('content-length')) > maxBytes) { await response.body?.cancel(); throw problem('O arquivo ultrapassa o limite de tamanho.', 413) }
  const reader = response.body?.getReader(), chunks = []; let bytes = 0
  if (!reader) throw problem('A fonte retornou um arquivo vazio.')
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      bytes += value.length; if (bytes > maxBytes) throw problem('O arquivo ultrapassa o limite de tamanho.', 413)
      chunks.push(Buffer.from(value))
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
  return Buffer.concat(chunks)
}
function imageExtension(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg'
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'webp'
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && /avif|avis/.test(bytes.toString('ascii', 8, 32))) return 'avif'
  throw problem('A fonte não retornou uma foto válida.')
}

export function createClassicReferences({ fetchImpl = fetch, now = Date.now, cacheTtlMs = 15 * 60 * 1000 } = {}) {
  const cache = new Map(), packs = new Map(), denied = new Map(), pageLimit = pLimit(2), zipLimit = pLimit(1)
  const remember = (map, key, value) => { map.delete(key); map.set(key, value); if (map.size > 60) map.delete(map.keys().next().value) }
  const searchUrlFor = identity => `${ORIGIN}/search/?q=${encodeURIComponent(identity.canonical)}`
  function failure(error, base, family) {
    const status = error.state || (/timeout|aborted/i.test(error.message) ? 'timeout' : 'error')
    const result = { ...base, status, message: status === 'timeout' ? 'O CLASSIC.COM demorou para responder. Tente novamente em alguns instantes.' : error.message }
    if (['blocked', 'access-required', 'rate-limit'].includes(status)) {
      result.retryAt = new Date(now() + 60000).toISOString()
      denied.set(family, { status, message: result.message, retryAt: result.retryAt, until: now() + 60000 })
    }
    return result
  }
  async function request(url, isImage, signal) {
    const check = value => isImage ? imageUrl(value) : pageUrl(value).href
    const deadline = AbortSignal.timeout(isImage ? 12000 : 10000)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    for (let redirects = 0; redirects < 4; redirects++) {
      const checked = check(url); if (!checked) throw problem('A fonte redirecionou para um domínio não permitido.')
      const response = await fetchImpl(checked, { signal: combined, redirect: 'manual', headers: { 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)', accept: isImage ? 'image/avif,image/webp,image/jpeg,image/png' : 'text/html,application/xhtml+xml' } })
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        const next = new URL(response.headers.get('location'), checked)
        await response.body?.cancel()
        if (!isImage && /\/(?:account|login|membership)(?:\/|$)/i.test(next.pathname)) throw problem('O CLASSIC.COM exige acesso para esta consulta.', 502, 'access-required')
        url = next.href; continue
      }
      if ([401, 402, 403, 429, 503].includes(response.status)) {
        await response.body?.cancel()
        if (response.status === 403) throw problem('O CLASSIC.COM bloqueou a consulta automática (HTTP 403). A busca no site original continua disponível.', 502, 'blocked')
        if ([401, 402].includes(response.status)) throw problem('O CLASSIC.COM exige acesso para esta consulta.', 502, 'access-required')
        if (response.status === 429) throw problem('O CLASSIC.COM limitou as consultas. Aguarde antes de tentar novamente.', 502, 'rate-limit')
        throw problem('O CLASSIC.COM está temporariamente indisponível (HTTP 503).')
      }
      if (!response.ok) { await response.body?.cancel(); throw problem(`O CLASSIC.COM respondeu com HTTP ${response.status}.`) }
      const contentType = response.headers.get('content-type') || ''
      if (!(isImage ? /^image\/(?:jpeg|png|webp|avif)(?:;|$)/i : /text\/html|application\/xhtml\+xml/i).test(contentType)) { await response.body?.cancel(); throw problem('A fonte retornou um formato inesperado.') }
      const buffer = await readBounded(response, isImage ? MAX_IMAGE_BYTES : 4 * 1024 * 1024)
      if (isImage) return { buffer, extension: imageExtension(buffer) }
      const html = buffer.toString('utf8')
      if (/cf-chl-|challenge-platform|<title>\s*(?:just a moment|attention required)/i.test(html)) throw problem('O CLASSIC.COM está exigindo uma verificação de acesso.', 502, 'blocked')
      return html
    }
    throw problem('A fonte excedeu o limite de redirecionamentos.')
  }
  async function cached(key, base, family, signal, task) {
    signal?.throwIfAborted()
    const hit = cache.get(key)
    if (hit && hit.until > now() && (!hit.value.images?.length || packs.get(hit.value.id)?.until > now())) return hit.value
    const blocked = denied.get(family); if (blocked?.until > now()) return { ...base, status: blocked.status, message: blocked.message, retryAt: blocked.retryAt }
    let value
    try {
      if (pageLimit.pendingCount >= 8) throw problem('Há muitas consultas de referências em andamento. Tente novamente em instantes.', 429)
      value = await pageLimit(() => { signal?.throwIfAborted(); return task() })
    } catch (error) { if (signal?.aborted) throw signal.reason; value = failure(error, base, family) }
    signal?.throwIfAborted()
    remember(cache, key, { value, until: now() + (['ok', 'empty', 'mismatch'].includes(value.status) ? cacheTtlMs : 60000) })
    return value
  }
  return {
    async search(asset, { signal, page = 1 } = {}) {
      const identity = canonicalizeVehicleIdentity(asset), searchUrl = searchUrlFor(identity)
      if (!identity.primaryModel || !identity.brand) throw problem('Informe a marca e o modelo do veículo.', 400)
      if (!Number.isInteger(page) || page < 1 || page > 5) throw problem('Página inválida. Consulte até 5 páginas por busca.', 400)
      const base = { query: identity.canonical, searchUrl, listings: [], page, hasMore: false }
      const url = pageUrl(searchUrl); if (page > 1) url.searchParams.set('page', String(page))
      return cached(`search:${url}`, base, 'search', signal, async () => {
        const html = await request(url.href, false, signal), parsed = extractListings(html, identity, url.href)
        return { ...base, ...parsed, status: parsed.listings.length ? 'ok' : 'empty', limited: page === 5 && parsed.hasMore,
          message: parsed.listings.length ? 'Exemplares compatíveis com a identidade informada.' : 'Nenhum exemplar com o mesmo ano, geração e versão foi confirmado nesta página.' }
      })
    },
    async gallery(asset, sourceUrl, { signal } = {}) {
      const url = listingUrl(sourceUrl), identity = canonicalizeVehicleIdentity(asset)
      const base = { query: identity.canonical, searchUrl: searchUrlFor(identity), sourceUrl: url, title: '', images: [], maxPhotos: MAX_PHOTOS, maxZipBytes: MAX_ZIP_BYTES }
      return cached(`gallery:${identity.canonical}:${url}`, base, 'gallery', signal, async () => {
        const html = await request(url, false, signal), data = extractGallery(html, identity, url)
        const pack = { ...base, ...data, id: randomBytes(18).toString('hex'), expiresAt: new Date(now() + cacheTtlMs).toISOString() }
        if (pack.images.length) remember(packs, pack.id, { pack, until: now() + cacheTtlMs })
        return pack
      })
    },
    importBrowser(asset, kind, document) {
      const identity = canonicalizeVehicleIdentity(asset)
      if (!document || typeof document !== 'object' || typeof document.url !== 'string' || document.url.length > 2000) throw problem('O leitor retornou uma página inválida.', 400)
      if (kind === 'search') {
        const url = pageUrl(document.url), page = Number(url.searchParams.get('page') || 1)
        if (!/^\/search\/?$/.test(url.pathname) || !Number.isInteger(page) || page < 1 || page > 5 || normal(url.searchParams.get('q')) !== normal(identity.canonical) || !Array.isArray(document.listings) || document.listings.length > 48) throw problem('A busca retornada pelo leitor não corresponde ao veículo.', 400)
        const found = new Map()
        for (const item of document.listings) {
          if (!item || typeof item.title !== 'string' || item.title.length > 200 || typeof item.url !== 'string' || item.url.length > 2000) throw problem('O leitor retornou um exemplar inválido.', 400)
          const source = listingUrl(item.url), evidence = `${item.title} ${new URL(source).pathname.replace(/[-/]/g, ' ')}`
          if (matches(identity, evidence)) found.set(source, { id: idFor(source), title: clean(item.title), url: source, imageUrl: imageUrl(item.imageUrl) })
        }
        let hasMore = false
        if (document.nextUrl) {
          const next = pageUrl(document.nextUrl)
          hasMore = /^\/search\/?$/.test(next.pathname) && Number(next.searchParams.get('page')) === page + 1 && normal(next.searchParams.get('q')) === normal(identity.canonical)
        }
        const listings = [...found.values()].slice(0, 24)
        return { query: identity.canonical, searchUrl: url.href, listings, page, hasMore, limited: page === 5 && hasMore, transport: 'browser', status: listings.length ? 'ok' : 'empty', message: listings.length ? 'Exemplares confirmados na página pública do CLASSIC.COM pelo seu navegador.' : 'Nenhum exemplar do mesmo veículo foi confirmado nesta página.' }
      }
      if (kind !== 'gallery' || typeof document.title !== 'string' || document.title.length > 200 || !Array.isArray(document.images) || document.images.length > MAX_PHOTOS) throw problem('O leitor retornou uma galeria inválida.', 400)
      const url = listingUrl(document.url), title = clean(document.title), base = { query: identity.canonical, searchUrl: searchUrlFor(identity), sourceUrl: url, title, maxPhotos: MAX_PHOTOS, maxZipBytes: MAX_ZIP_BYTES, transport: 'browser' }
      if (!matches(identity, `${title} ${String(document.identityEvidence || '').slice(0, 600)}`)) return { ...base, status: 'mismatch', images: [], message: 'A página não confirma o mesmo ano, geração e versão do veículo pesquisado.' }
      const images = new Map()
      for (const item of document.images) {
        const source = typeof item?.url === 'string' && item.url.length <= 2000 ? imageUrl(item.url) : null
        if (!source) throw problem('A galeria contém um endereço de foto não permitido.', 400)
        images.set(new URL(source).pathname, { id: idFor(source), url: source, caption: clean(item.caption).slice(0, 200) || title, sourceUrl: url })
      }
      const rows = [...images.values()], totalAvailable = Number.isSafeInteger(document.totalAvailable) && document.totalAvailable >= rows.length ? Math.min(document.totalAvailable, 100000) : rows.length
      const pack = { ...base, id: randomBytes(18).toString('hex'), status: rows.length ? 'ok' : 'empty', kind: 'public-gallery', images: rows, totalAvailable, limited: totalAvailable > rows.length, resolution: document.resolution === 'published-full' ? 'published-full' : 'published-preview', expiresAt: new Date(now() + cacheTtlMs).toISOString(), message: 'Fotos públicas do exemplar carregadas pelo seu navegador no CLASSIC.COM.' }
      if (rows.length) remember(packs, pack.id, { pack, until: now() + cacheTtlMs })
      return pack
    },
    zip(galleryId, selection = {}, { signal } = {}) {
      if (zipLimit.pendingCount >= 2) return Promise.reject(problem('Há outros ZIPs sendo preparados. Tente novamente em instantes.', 429))
      return zipLimit(async () => {
        const entry = packs.get(galleryId)
        if (!entry || entry.until <= now()) throw problem('A galeria expirou. Busque as fotos novamente.', 410)
        const pack = entry.pack, ids = selection.ids
        if (selection.all !== true && (!Array.isArray(ids) || !ids.length || ids.length > MAX_PHOTOS || ids.some(id => typeof id !== 'string' || !pack.images.some(image => image.id === id)))) throw problem('A seleção de fotos é inválida.', 400)
        const wanted = new Set(Array.isArray(ids) ? ids : []), images = selection.all === true ? pack.images : pack.images.filter(image => wanted.has(image.id))
        const deadline = AbortSignal.timeout(90000), failureAbort = new AbortController()
        const combined = AbortSignal.any([deadline, failureAbort.signal, ...(signal ? [signal] : [])]), photoLimit = pLimit(3)
        const files = new Array(images.length), manifest = new Array(images.length); let bytes = 0
        const tasks = images.map((image, index) => photoLimit(async () => {
          combined.throwIfAborted()
          const fetched = await request(image.url, true, combined)
          bytes += fetched.buffer.length
          if (bytes > MAX_ZIP_BYTES) throw problem('As fotos ultrapassam 64 MB por ZIP. Selecione um grupo menor.', 413)
          const name = `${String(index + 1).padStart(3, '0')}_${safeName(pack.title)}.${fetched.extension}`
          files[index] = { name, data: fetched.buffer }; manifest[index] = { file: name, caption: image.caption, originalImage: image.url, sourcePage: image.sourceUrl }
        }))
        try { await Promise.all(tasks) }
        catch (error) { failureAbort.abort(); await Promise.allSettled(tasks); throw error }
        files.push({ name: 'sources.txt', data: Buffer.from(`CLASSIC.COM — referências de ${pack.title}\nFonte: ${pack.sourceUrl}\nGerado: ${new Date(now()).toISOString()}\nFotos: ${images.length}\n\nOs direitos das fotografias pertencem aos respectivos titulares. A disponibilidade pública não transfere esses direitos.\n\n${JSON.stringify(manifest, null, 2)}`, 'utf8') })
        return { buffer: makeZip(files), count: images.length, filename: `${safeName(pack.title)}_CLASSIC_referencias.zip` }
      })
    },
  }
}

export function registerClassicReferenceRoutes(app, service = createClassicReferences()) {
  const assetFrom = query => {
    if (typeof query.title !== 'string' || query.title.trim().length < 2 || query.title.length > 160) throw problem('Informe o veículo com pelo menos dois caracteres.', 400)
    return { title: query.title.trim(), brand: typeof query.brand === 'string' ? query.brand.slice(0, 80) : undefined }
  }
  const handler = action => async (req, res) => {
    const controller = new AbortController()
    res.on('close', () => { if (!res.writableEnded) controller.abort() })
    try { await action(req, res, controller.signal) }
    catch (error) { if (!res.destroyed) res.status(error.statusCode || 502).json({ error: error.name === 'TimeoutError' ? 'O download demorou para concluir. Selecione menos fotos e tente novamente.' : error.message }) }
  }
  app.get('/api/classic/references', handler(async (req, res, signal) => {
    const result = await service.search(assetFrom(req.query), { signal, page: Number(req.query.page || 1) })
    if (!res.destroyed) res.set('Cache-Control', 'no-store').json(result)
  }))
  app.get('/api/classic/references/gallery', handler(async (req, res, signal) => {
    if (typeof req.query.url !== 'string' || req.query.url.length > 2000) throw problem('Informe o link do exemplar no CLASSIC.COM.', 400)
    const result = await service.gallery(assetFrom(req.query), req.query.url, { signal })
    if (!res.destroyed) res.set('Cache-Control', 'no-store').json(result)
  }))
  app.post('/api/classic/references/zip', handler(async (req, res, signal) => {
    if (typeof req.body?.galleryId !== 'string' || req.body.galleryId.length > 80) throw problem('A galeria é inválida.', 400)
    const zip = await service.zip(req.body.galleryId, { ids: req.body.ids, all: req.body.all }, { signal })
    if (!res.destroyed) res.set({ 'Content-Type': 'application/zip', 'Content-Disposition': `attachment; filename="${zip.filename}"`, 'Content-Length': zip.buffer.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }).send(zip.buffer)
  }))
  app.post('/api/classic/references/browser-import', handler(async (req, res) => {
    const result = service.importBrowser(assetFrom(req.body || {}), req.body?.kind, req.body?.document)
    if (!res.destroyed) res.set('Cache-Control', 'no-store').json(result)
  }))
}
