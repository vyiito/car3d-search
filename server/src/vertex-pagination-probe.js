const UA = 'VJ3DSearch pagination probe'

function snippet(text, marker, radius = 1000) {
  const lower = text.toLowerCase()
  const index = lower.indexOf(marker.toLowerCase())
  if (index < 0) return null
  return text.slice(Math.max(0, index - radius), Math.min(text.length, index + radius)).replace(/\s+/g, ' ')
}

export async function probeVertexPagination() {
  try {
    const page = await fetch('https://www.vertex-warehouse.com/search?query=Toyota%20Supra&type=fts', { headers: { 'user-agent': UA, accept: 'text/html' } })
    const html = await page.text()
    const scripts = [...html.matchAll(/<script[^>]+src=["']([^"']+)["']/gi)].map(m => new URL(m[1], page.url).href)
    const scriptUrl = scripts.find(url => /\/search\/page-[^/]+\.js/.test(url))
    if (!scriptUrl) return console.log('[vertex-pagination-probe] search page bundle not found')
    const response = await fetch(scriptUrl, { headers: { 'user-agent': UA } })
    const js = await response.text()
    console.log(`[vertex-pagination-probe] bundle=${scriptUrl} bytes=${js.length}`)
    for (const marker of ['isNextPage','setPage','page + 1','page+1','z+1','P(z+1)','B(!0)','I(e=>','initialData','serverreference','createServerReference']) {
      const value = snippet(js, marker, 1300)
      if (value) console.log(`[vertex-pagination-probe] ${marker} :: ${value}`)
    }
    const refs = [...new Set(js.match(/[a-f0-9]{40}/g) || [])]
    console.log(`[vertex-pagination-probe] refs=${refs.join(',')}`)
    for (const ref of refs.slice(0,12)) {
      const value = snippet(js, ref, 700)
      if (value) console.log(`[vertex-pagination-probe] ref:${ref} :: ${value}`)
    }
  } catch (error) {
    console.log(`[vertex-pagination-probe] ERROR ${error instanceof Error ? error.message : String(error)}`)
  }
}
