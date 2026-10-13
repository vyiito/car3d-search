import fs from 'node:fs/promises'
import path from 'node:path'
import { createRequire } from 'node:module'
import { providers } from '../server/src/providers.js'

const require = createRequire(new URL('../server/package.json', import.meta.url))
const { load } = require('cheerio')
const pLimit = (await import('../server/node_modules/p-limit/index.js')).default
const limit = pLimit(5)
const output = path.resolve(process.argv[2] || '.qa/source-audit')
await fs.mkdir(output, { recursive: true })
const keywords = /car|vehicle|truck|motorcycle|transport|bus|tractor|van|brand|model|game|free|premium|collection|download|forza|racing|assetto|beamng|sketchup/i
const rows = await Promise.all(providers.map(provider => limit(async () => {
  const urls = [...new Set([provider.browseUrl || provider.collectionUrl || provider.buildUrl('BMW'), new URL(provider.baseUrl).origin + '/'])]
  const pages = []
  for (const url of urls) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'user-agent': 'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)' } })
      const html = await response.text()
      await fs.writeFile(path.join(output, `${provider.id}-${pages.length}.html`), html)
      const $ = load(html), links = new Map()
      $('a[href]').each((_, el) => {
        const a = $(el), text = a.text().replace(/\s+/g, ' ').trim(), raw = a.attr('href')
        try {
          const target = new URL(raw, response.url)
          if (!['http:', 'https:'].includes(target.protocol) || !keywords.test(`${text} ${target.pathname}`)) return
          if (target.hostname.replace(/^www\./, '') !== new URL(provider.baseUrl).hostname.replace(/^www\./, '') && !target.hostname.endsWith('.' + new URL(provider.baseUrl).hostname.replace(/^www\./, ''))) return
          if (text && text.length < 100) links.set(target.href, text)
        } catch {}
      })
      pages.push({ url, finalUrl: response.url, status: response.status, title: $('title').text().trim(),
        headings: $('h1,h2').map((_, el) => $(el).text().trim()).get().slice(0, 8),
        forms: $('form').map((_, el) => ({ action: $(el).attr('action'), method: $(el).attr('method'), inputs: $(el).find('input,select').map((_, input) => $(input).attr('name')).get() })).get(),
        links: [...links].map(([url, text]) => ({ text, url })).slice(0, 90),
        scripts: $('script[src]').map((_, el) => $(el).attr('src')).get().slice(0, 8),
      })
    } catch (error) { pages.push({ url, status: 'error', error: error.message }) }
  }
  const row = { id: provider.id, name: provider.name, pages }
  console.log(provider.id, pages.map(page => page.status).join('/'), pages[0]?.links?.length || 0)
  return row
})))
await fs.writeFile(path.join(output, 'navigation.json'), JSON.stringify({ generatedAt: new Date().toISOString(), sources: rows }, null, 2))
console.log('Audit saved:', output)
