import * as cheerio from 'cheerio'
import { providers } from './providers.js'
import { crawlCatalog } from './catalog-crawler.js'
import { bazaItems, wireItems } from './catalog-adapters.js'
import { renderItems, galleryItems } from './commerce-adapters.js'
import { zifirItems, cgmoodItems } from './remaining-adapters.js'
import { extractHtmlResults } from './search.js'
import { enrich3DCad } from './market-adapters.js'
import { catalogResult } from './structured-adapters.js'
import { searchCheckpoint } from './search-context.js'
import { vehicleQueryVariants } from './query-plan.js'

const providerById = new Map(providers.map(provider => [provider.id, provider]))

function sectionsMatching(pattern) {
  return (html, base) => {
    const $ = cheerio.load(html), sections = new Set()
    $('a[href]').each((_, el) => {
      try { const url = new URL($(el).attr('href'), base); url.hash = ''; if (pattern.test(url.pathname)) sections.add(url.href) } catch {}
    })
    return [...sections]
  }
}

export function searchBazaSections(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providerById.get('3d-baza'),
    seeds: ['https://3d-baza.com/Car', 'https://3d-baza.com/Truck', 'https://3d-baza.com/Bus'],
    parse: html => bazaItems(html, query),
    discoverSections: sectionsMatching(/^\/(?:Car|Truck|Bus|Motorcycle|Motorbike)(?:\/(?!filter\/)[^/?]+)?\/?$/),
  })
}

export function searchRenderHubSections(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providerById.get('renderhub'),
    seeds: [...vehicleQueryVariants(query).map(term => `https://www.renderhub.com/3d-models?s=${encodeURIComponent(term)}`), 'https://www.renderhub.com/3d-models/vehicles/cars', 'https://www.renderhub.com/3d-models/vehicles/trucks', 'https://www.renderhub.com/3d-models/vehicles/motorcycles', 'https://www.renderhub.com/free-3d-models/vehicles/cars'],
    parse: html => renderItems(html, query),
    discoverSections: sectionsMatching(/^\/(?:free-)?3d-models\/vehicles\/(?:cars|trucks|motorcycles|buses|vans)\/?$/),
  })
}

export function searchWireSections(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providerById.get('wire-wheels-club'),
    seeds: ['https://wirewheelsclub.com/models/', `https://store.wirewheelsclub.com/?s=${encodeURIComponent(query)}&post_type=product`, 'https://store.wirewheelsclub.com/products/'],
    parse: (html, url) => wireItems(html, url, query, new URL(url).hostname === 'store.wirewheelsclub.com'),
    discoverSections: sectionsMatching(/^\/product-category\/(?:muscle-car|race-car|convertible|offroad|coupe|sedan|hatchback)\/?$/),
  })
}

export function searchZifirSections(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providerById.get('zifir3d'),
    seeds: [`https://zifir3d.com/search?query=${encodeURIComponent(query)}`, 'https://zifir3d.com/'],
    parse: html => zifirItems(html, query),
    discoverSections: sectionsMatching(/^\/catalog\/(?:convertible|classic|coupe|hatchback|sedan|wagon|suv|racing-car-3d-models|concept-car|police-car|other-models)\/?$/),
  })
}

export function searchCGMoodSections(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providerById.get('cgmood'),
    seeds: ['https://cgmood.com/category/transport/cars'], parse: html => cgmoodItems(html, query),
    discoverSections: sectionsMatching(/^\/category\/transport(?:\/(?:cars|trucks|motorcycles|buses|vans))?\/?$/),
  })
}

export function searchGallerySections(query, limit = 60) {
  return crawlCatalog({ query, limit, provider: providerById.get('3dcar-ru'), seeds: ['https://3dcar.ru/gallery'], parse: html => galleryItems(html, query) })
}

export function searchExportSections(query, limit = 60) {
  const provider = providerById.get('3dexport')
  return crawlCatalog({ query, limit, provider,
    seeds: [`https://3dexport.com/3d-models/${encodeURIComponent(query.trim().replace(/\s+/g, '-'))}`, 'https://3dexport.com/3d-models/cars'],
    parse: html => extractHtmlResults(provider, query, Number.MAX_SAFE_INTEGER, html),
    discoverSections: sectionsMatching(/^\/(?:free-)?3d-models\/(?:cars|trucks|motorcycles|buses|vans|transport)\/?$/),
  })
}

export async function searchCADSections(query, limit = 60) {
  const provider = providerById.get('3dcadbrowser')
  const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  const brand = query.match(/^(?:Mercedes(?:-Benz)?|Alfa Romeo|Land Rover|Aston Martin|[a-z]+)/i)?.[0]
  const payload = await crawlCatalog({ query, limit, provider,
    seeds: [...new Set([`https://www.3dcadbrowser.com/3d-models/${slug(query)}`, ...(brand ? [`https://www.3dcadbrowser.com/3d-models/${slug(brand)}`] : []), 'https://www.3dcadbrowser.com/3d-models/car'])],
    parse: (html, base) => {
      const $ = cheerio.load(html), results = []
      $('a[href*="/3d-model/"]').each((_, el) => {
        const anchor = $(el), card = anchor.closest('article,li,tr,.card,.model,.item').length ? anchor.closest('article,li,tr,.card,.model,.item').first() : anchor.parent()
        const title = (anchor.attr('title') || anchor.find('img').attr('alt') || anchor.text()).replace(/\s+/g, ' ').trim()
        if (!title) return
        const image = anchor.find('img').attr('src') || card.find('img').first().attr('src')
        const body = card.text(), formats = [...new Set((body.match(/\b(?:fbx|obj|blend|3ds|max|skp|stl|step|c4d)\b/gi) || []).map(value => value.toUpperCase()))]
        const row = catalogResult('3dcadbrowser', { title, sourceUrl: new URL(anchor.attr('href'), base).href,
          imageUrl: image ? new URL(image, base).href : null, formats,
        })
        if (row) results.push(row)
      })
      return results
    },
  })
  const results = [...payload.results]
  for (let index = 0; index < results.length; index++) {
    results[index] = await enrich3DCad(results[index], query)
    searchCheckpoint({ ...payload, results: [...results] })
  }
  return { ...payload, results }
}
