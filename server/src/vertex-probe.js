function absolute(value, base) { try { return new URL(value, base).href } catch { return null } }

export async function probeVertexSearch() {
  const url = 'https://www.vertex-warehouse.com/search?query=Toyota%20Supra&type=fts'
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'VJ3DSearch/0.6 (+https://github.com/vyiito/car3d-search)', accept: 'text/html' }, redirect: 'follow' })
    const html = await response.text()
    const scriptUrls = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(match => absolute(match[1], response.url)).filter(Boolean)
    const pageScript = scriptUrls.find(value => /\/search\/page-[^/]+\.js/.test(value))
    console.log(`[vertex-action] pageScript=${pageScript || 'none'}`)
    if (!pageScript) return

    const jsResponse = await fetch(pageScript, { headers: { 'user-agent': 'VJ3DSearch/0.6' } })
    const js = await jsResponse.text()
    const lower = js.toLowerCase()
    for (const marker of ['full text search','legacy search','query','fts','serverreference','createServerReference','next-action','searchresult','pagination','sources']) {
      const index = lower.indexOf(marker.toLowerCase())
      if (index < 0) continue
      const snippet = js.slice(Math.max(0,index-500), Math.min(js.length,index+1400)).replace(/\s+/g,' ')
      console.log(`[vertex-action] marker=${marker} index=${index} snippet=${snippet}`)
    }
    const hexIds = [...new Set(js.match(/\b[a-f0-9]{32,64}\b/gi) || [])].slice(0,20)
    console.log(`[vertex-action] hexIds=${hexIds.join(',')}`)
  } catch (error) {
    console.log(`[vertex-action] ERROR ${error instanceof Error ? error.message : String(error)}`)
  }
}
