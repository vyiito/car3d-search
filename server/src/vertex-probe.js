export async function probeVertexSearch() {
  const url = 'https://www.vertex-warehouse.com/search?q=Toyota%20Supra'
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'VJ3DSearch/0.5 (+https://github.com/vyiito/car3d-search)', accept: 'text/html' }, redirect: 'follow' })
    const html = await response.text()
    const lower = html.toLowerCase()
    const markers = ['toyota supra', 'jza80', '__next_data__', '/api/', 'models\\/', '\\u002fmodels\\u002f', 'searchparams']
    console.log(`[vertex-probe2] ${response.status} bytes=${html.length}`)
    for (const marker of markers) {
      const index = lower.indexOf(marker.toLowerCase())
      if (index < 0) { console.log(`[vertex-probe2] marker=${marker} index=-1`); continue }
      const snippet = html.slice(Math.max(0, index - 260), Math.min(html.length, index + 700)).replace(/\s+/g, ' ')
      console.log(`[vertex-probe2] marker=${marker} index=${index} snippet=${snippet}`)
    }
  } catch (error) {
    console.log(`[vertex-probe2] ERROR ${error instanceof Error ? error.message : String(error)}`)
  }
}
