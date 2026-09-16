function absolute(value, base) { try { return new URL(value, base).href } catch { return null } }

export async function probeVertexSearch() {
  const url = 'https://www.vertex-warehouse.com/search?q=Toyota%20Supra'
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'VJ3DSearch/0.5 (+https://github.com/vyiito/car3d-search)', accept: 'text/html' }, redirect: 'follow' })
    const html = await response.text()
    const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(match => absolute(match[1], response.url)).filter(Boolean)
    console.log(`[vertex-bundles] scripts=${scriptUrls.length}`)
    const keywords = ['algolia','typesense','meilisearch','supabase','searchmodels','full text search','/api/','next-action','searchparams','prisma']
    for (const scriptUrl of scriptUrls.slice(0, 40)) {
      try {
        const jsResponse = await fetch(scriptUrl, { headers: { 'user-agent': 'VJ3DSearch/0.5' } })
        if (!jsResponse.ok) continue
        const js = await jsResponse.text()
        const lower = js.toLowerCase()
        const hits = keywords.filter(keyword => lower.includes(keyword))
        if (!hits.length) continue
        const snippets = hits.slice(0, 4).map(keyword => {
          const index = lower.indexOf(keyword)
          return js.slice(Math.max(0,index-180), Math.min(js.length,index+420)).replace(/\s+/g,' ')
        })
        console.log(`[vertex-bundles] ${scriptUrl} hits=${hits.join(',')} snippets=${snippets.join(' || ')}`)
      } catch {}
    }
  } catch (error) {
    console.log(`[vertex-bundles] ERROR ${error instanceof Error ? error.message : String(error)}`)
  }
}
