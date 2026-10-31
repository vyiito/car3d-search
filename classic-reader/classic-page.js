(() => {
  const MAX_PHOTOS = 200
  const visible = node => {
    if (!node) return false
    const rect = node.getBoundingClientRect(), style = getComputedStyle(node)
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden' && rect.bottom > 0 && rect.top < innerHeight && rect.right > 0 && rect.left < innerWidth
  }
  const text = node => String(node?.textContent || '').replace(/\s+/g, ' ').trim()
  const failure = () => /just a moment|um momento|attention required|verifica[çc][aã]o de seguran[çc]a/i.test(document.title + ' ' + document.body.innerText.slice(0, 800))
    ? 'O CLASSIC.COM exige uma verificação manual. Abra a busca no site original, conclua a verificação e tente novamente.' : null
  function waitFor(check, timeout = 12000) {
    return new Promise((resolve, reject) => {
      const initial = check(); if (initial) return resolve(initial)
      const observer = new MutationObserver(() => { const value = check(); if (value) { clearTimeout(timer); observer.disconnect(); resolve(value) } })
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error(failure() || 'A página não disponibilizou os resultados ao leitor.')) }, timeout)
      observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true })
    })
  }
  function imageUrl(value) {
    try {
      const url = new URL(value)
      return url.protocol === 'https:' && url.hostname === 'images.classic.com' && !url.username && !url.password && !url.port && url.pathname.startsWith('/vehicles/') ? url.href : null
    } catch { return null }
  }
  function imageCandidates(img) {
    let srcset = img.getAttribute('srcset') || '', src = img.getAttribute('src') || ''
    // Only published image attributes used by the public gallery's lazy loader.
    try {
      for (const [operation, options] of JSON.parse(img.getAttribute('data-load-img') || '[]')) if (operation === 'set_attr' && Array.isArray(options?.attr)) {
        if (options.attr[0] === 'srcset') srcset ||= options.attr[1]
        if (options.attr[0] === 'src') src ||= options.attr[1]
      }
    } catch {}
    return [...srcset.split(',').map(item => { const [url, descriptor] = item.trim().split(/\s+/); return { url, size: parseFloat(descriptor) || 0 } }).sort((a, b) => b.size - a.size).map(item => item.url), src].map(imageUrl).filter(Boolean)
  }
  function searchDocument() {
    const listings = new Map()
    for (const anchor of document.querySelectorAll('h3 a[href]')) {
      const url = new URL(anchor.getAttribute('href'), location.href)
      if (url.origin !== location.origin || !/^\/veh\/[^/]+\/?$/.test(url.pathname)) continue
      const card = anchor.closest('[id^="vehicle-item-"]') || anchor.parentElement?.parentElement
      const img = card?.querySelector('img[alt]')
      listings.set(url.href, { title: text(anchor), url: url.href, imageUrl: img ? imageCandidates(img)[0] || null : null })
    }
    const next = [...document.querySelectorAll('a[href]')].find(a => text(a) === 'chevron_right')
    return { url: location.href, listings: [...listings.values()].slice(0, 24), nextUrl: next?.href || null }
  }
  async function readGallery() {
    const heading = await waitFor(() => document.querySelector('h1'))
    const open = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open full gallery' && visible(b))
      || [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === 'Open gallery' && visible(b))
      || [...document.querySelectorAll('button')].find(b => /^photo_library\s+\d+\s+photos$/i.test(text(b)) && visible(b))
    if (!open) throw new Error('Esta página não expõe uma galeria pública. Confira o acesso no CLASSIC.COM.')
    open.click()
    const root = await waitFor(() => { const node = document.querySelector('#vehicle-image-gallery'); return visible(node) && node.querySelector('img') ? node : null })
    const viewAll = [...root.querySelectorAll('button')].find(b => /^View All\s*\(\d+\)$/i.test(text(b)) && visible(b))
    if (/\b\d+\s+of\s+\d+\b/i.test(text(root)) && viewAll) { viewAll.click(); await waitFor(() => !/\b\d+\s+of\s+\d+\b/i.test(root.innerText)) }
    const total = Number(text(root).match(/View All\s*\((\d+)\)/i)?.[1]) || root.querySelectorAll('img').length
    const fullPhotos = new Map(), thumbnails = new Map(), deadline = Date.now() + 60000
    const collect = () => {
      for (const img of root.querySelectorAll('img')) {
        const source = imageCandidates(img)[0]
        if (!source) continue
        const key = new URL(source).pathname, photo = { url: source, caption: img.alt || text(heading) }
        if (img.getAttribute('srcset') || img.getAttribute('data-load-img')?.includes('srcset')) fullPhotos.set(key, photo)
        else thumbnails.set(key, photo)
      }
    }
    collect()
    const first = [...root.querySelectorAll('img')].find(visible)
    first?.closest('button')?.click()
    await waitFor(() => [...root.querySelectorAll('img')].some(i => i.getAttribute('srcset') || i.getAttribute('data-load-img')?.includes('srcset')), 8000)
    let previous = ''
    while (fullPhotos.size < Math.min(MAX_PHOTOS, total) && Date.now() < deadline) {
      collect()
      if (fullPhotos.size >= Math.min(MAX_PHOTOS, total)) break
      const position = text(root).match(/\b(\d+)\s+of\s+(\d+)(?!\d)/i)?.[0] || ''
      const next = [...root.querySelectorAll('button')].find(b => visible(b) && text(b) === 'chevron_right')
      if (!next || position === previous) break
      previous = position; next.click()
      await waitFor(() => {
        const current = text(root).match(/\b(\d+)\s+of\s+(\d+)(?!\d)/i)?.[0] || ''
        return current && current !== position
      }, 6000)
    }
    collect()
    const photos = fullPhotos.size ? [...fullPhotos.values()] : [...thumbnails.values()]
    const specs = [...document.querySelectorAll('dt')].filter(dt => /^(Year|Make|Model Family|Model Generation|Model Variant|Model Trim)$/.test(text(dt))).map(dt => text(dt.nextElementSibling)).join(' ')
    return { url: location.href, title: text(heading), identityEvidence: specs, images: photos.slice(0, MAX_PHOTOS), totalAvailable: total, limited: photos.length < total, resolution: fullPhotos.size ? 'published-full' : 'published-preview' }
  }
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message.action !== 'vj-classic-read') return
    const run = async () => {
      const error = failure(); if (error) throw new Error(error)
      if (message.kind === 'gallery') return { document: await readGallery() }
      await waitFor(() => document.querySelector('h3 a[href*="/veh/"]') || /did not match|no results/i.test(document.body.innerText))
      return { document: searchDocument() }
    }
    run().then(respond).catch(error => respond({ error: error.message }))
    return true
  })
  chrome.runtime.sendMessage({ action: 'vj-classic-ready' }).catch(() => {})
})()
