export async function probeVertexSearch() {
  const url = 'https://www.vertex-warehouse.com/search?query=Toyota%20Supra&type=fts'
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'VJ3DSearch/0.7 (+https://github.com/vyiito/car3d-search)', accept: 'text/html' }, redirect: 'follow' })
    const html = await response.text()
    const decoded = html
      .replace(/\\\\\"/g, '"')
      .replace(/\\\"/g, '"')
      .replace(/\\u0026/g, '&')
      .replace(/\\u003c/g, '<')
      .replace(/\\u003e/g, '>')
    console.log(`[vertex-rsc] bytes=${html.length} decoded=${decoded.length}`)
    for (const marker of ['initialData','itemsPerPage','created_by','pages','Toyota Supra','isNextPage','download_count','thumbnail','source_key']) {
      const lower = decoded.toLowerCase(), index = lower.indexOf(marker.toLowerCase())
      if (index < 0) { console.log(`[vertex-rsc] marker=${marker} index=-1`); continue }
      console.log(`[vertex-rsc] marker=${marker} index=${index} snippet=${decoded.slice(Math.max(0,index-500),Math.min(decoded.length,index+2000)).replace(/\s+/g,' ')}`)
    }
  } catch (error) {
    console.log(`[vertex-rsc] ERROR ${error instanceof Error ? error.message : String(error)}`)
  }
}
