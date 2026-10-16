import * as cheerio from 'cheerio'
import { crawlCatalog } from './catalog-crawler.js'
import { catalogResult } from './structured-adapters.js'
import { providers } from './providers.js'
import { linkImages } from './preview-images.js'
import { isGameQuery } from './query-plan.js'

const base = 'https://www.gta5-mods.com'
export const gta5SearchUrl = query => `${base}/search/${encodeURIComponent(query.replaceAll('/', '-')).replaceAll('%20', '+')}`

export function gta5Items(html, query, pageUrl = base) {
  const $ = cheerio.load(html), rows = []
  $('.file-list-obj').each((_, el) => {
    const card = $(el), anchor = card.find('.name a[href]').first()
    let url
    try { url = new URL(anchor.attr('href'), pageUrl) } catch { return }
    if (url.hostname !== 'www.gta5-mods.com' || !/^\/vehicles\/[^/]+\/?$/.test(url.pathname)) return
    const title = (anchor.attr('title') || anchor.text()).replace(/\s+/g, ' ').trim()
    const tags = card.find('.categories li').map((_, tag) => $(tag).text().trim()).get()
    if (!title || /\b(?:handling|sounds?|wheels?|rims?|livery|liveries|paint ?jobs?|skins?|textures?)\b/i.test(tags.join(' ') + ' ' + title)) return
    const row = catalogResult('gta5-mods', { title, sourceUrl: url.href,
      imageUrl: linkImages($, anchor, pageUrl)[0] || null,
      author: card.find('.bottom a[href*="/users/"]').first().text().trim() || null,
      description: tags.join(' · ') || null, tags, vehicleEvidence: 'catalog', game: 'GTA V',
      price: 0, isFree: true, priceLabel: 'GRÁTIS',
      vehicleClass: tags.includes('Bike') ? 'Motorcycle' : tags.includes('SUV') ? 'SUV' : tags.includes('Truck') ? 'Truck / Pickup' : tags.includes('Bus') ? 'Bus' : tags.includes('Aircraft') ? 'Aircraft' : tags.includes('Boat') ? 'Boat' : 'Car',
    })
    if (row) rows.push(row)
  })
  return rows
}

export function searchGta5(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providers.find(provider => provider.id === 'gta5-mods'),
    seeds: [isGameQuery(query) ? `${base}/vehicles` : gta5SearchUrl(query)],
    parse: (html, pageUrl) => gta5Items(html, query, pageUrl),
  })
}
