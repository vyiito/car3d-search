import * as cheerio from 'cheerio'

export function previewUrl(value, base) {
  if (!value || typeof value !== 'string') return null
  try {
    const url = new URL(value.trim(), base)
    if (!['http:', 'https:'].includes(url.protocol)) return null
    if (/(?:^|[\/_.-])(?:logo|avatar)(?:s)?(?:[\/_.-]|$)/i.test(url.pathname)) return null
    if (/(?:^|\/)(?:logos?|avatars?|icons?|emoji|sprites?)(?:\/|[_.-])/i.test(url.pathname)) return null
    if (/(?:^|\/)(?:blank|spacer|transparent|placeholder|loading|no[-_]?(?:image|thumbnail)|default[-_]?(?:image|thumbnail))(?:[_.\/-]|$)/i.test(url.pathname)) return null
    // These pages publish HTTP OG URLs although their images also use HTTPS.
    if (url.protocol === 'http:' && /^(?:www\.)?rigmodels\.com$/i.test(url.hostname)) url.protocol = 'https:'
    return url.href
  } catch { return null }
}

function srcsetImages(value) {
  return String(value || '').split(',').map(part => {
    const [url, size = '0'] = part.trim().split(/\s+/)
    return { url, size: parseFloat(size) || 0 }
  }).sort((a, b) => b.size - a.size).map(item => item.url)
}

export function elementImages($, root, base, excludeChrome = false) {
  const images = []
  const add = value => { const url = previewUrl(value, base); if (url && !images.includes(url)) images.push(url) }
  root.filter('img,source').add(root.find('img,source')).each((_, el) => {
    const node = $(el)
    if (node.closest('[class*="related"],[class*="recommend"],[class*="similar"]').length || (excludeChrome && node.closest('header,footer,nav,aside').length)) return
    if (Number(node.attr('width')) > 0 && Number(node.attr('width')) <= 32 && Number(node.attr('height')) > 0 && Number(node.attr('height')) <= 32) return
    for (const key of ['data-srcset', 'data-lazy-srcset', 'srcset']) srcsetImages(node.attr(key)).forEach(add)
    for (const key of ['data-full', 'data-src', 'data-lazy-src', 'data-original', 'data-lazy', 'src']) add(node.attr(key))
  })
  root.filter('[style]').add(root.find('[style]')).each((_, el) => {
    if ($(el).closest('[class*="related"],[class*="recommend"],[class*="similar"]').length || (excludeChrome && $(el).closest('header,footer,nav,aside').length)) return
    const style = $(el).attr('style') || ''
    for (const match of style.matchAll(/(?:background(?:-image)?\s*:[^;]*?)url\(\s*['"]?([^'"\)]+)['"]?\s*\)/gi)) add(match[1])
  })
  root.find('noscript').each((_, el) => {
    const fragment = cheerio.load($(el).text())
    fragment('img').each((_, image) => add(fragment(image).attr('src')))
  })
  return images
}

// Links to the same model can separate its image from its title. Never use a
// neighboring card's image just because it is the first image in the grid.
export function linkImages($, anchor, base) {
  let target
  try { target = new URL(anchor.attr('href'), base).href } catch { return [] }
  const images = []
  const add = values => values.forEach(url => { if (!images.includes(url)) images.push(url) })
  const links = $('a[href]').filter((_, el) => {
    try { return new URL($(el).attr('href'), base).href === target } catch { return false }
  })
  links.each((_, el) => add(elementImages($, $(el), base)))
  if (images.length) return images
  let node = anchor.parent()
  for (let depth = 0; depth < 3 && node.length && !node.is('body,html'); depth++, node = node.parent()) {
    const others = node.find('a[href]').filter((_, el) => {
      try { return new URL($(el).attr('href'), base).href !== target && elementImages($, $(el), base).length > 0 } catch { return false }
    })
    if (others.length) break
    add(elementImages($, node, base))
    if (images.length) break
  }
  return images
}

export function pageImages($, base) {
  const images = []
  const add = value => { const url = previewUrl(value, base); if (url && !images.includes(url)) images.push(url) }
  $('meta[property="og:image"],meta[property="og:image:secure_url"],meta[name="twitter:image"],meta[name="twitter:image:src"]').each((_, el) => add($(el).attr('content')))
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const visit = object => {
        if (Array.isArray(object)) return object.forEach(visit)
        if (!object || typeof object !== 'object') return
        if (object['@graph']) visit(object['@graph'])
        const values = Array.isArray(object.image) ? object.image : [object.image]
        values.forEach(value => add(typeof value === 'string' ? value : value?.contentUrl || value?.url))
        if (/ImageObject/i.test(String(object['@type']))) add(object.contentUrl || object.url)
      }
      visit(JSON.parse($(el).text()))
    } catch {}
  })
  // Product/gallery selectors precede general article content and site chrome.
  for (const selector of ['.work-image', '#current', '.project-detail-image-main', '.gallery', '.swiper', '.carousel', '.product-gallery', '.model-gallery', 'article', 'main', '.content', '.product', '.model']) {
    $(selector).each((_, el) => elementImages($, $(el), base, true).forEach(add))
  }
  return images.slice(0, 10)
}
