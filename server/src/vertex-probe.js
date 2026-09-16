export async function probeVertexSearch() {
  const variants = [
    'https://www.vertex-warehouse.com/search?q=Toyota%20Supra',
    'https://www.vertex-warehouse.com/search?query=Toyota%20Supra',
    'https://www.vertex-warehouse.com/search?search=Toyota%20Supra',
    'https://www.vertex-warehouse.com/search?keyword=Toyota%20Supra',
    'https://www.vertex-warehouse.com/search?searchKeyword=Toyota%20Supra',
  ]
  for (const url of variants) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'VJ3DSearch/0.5 (+https://github.com/vyiito/car3d-search)', accept: 'text/html' }, redirect: 'follow' })
      const html = await response.text()
      const modelLinks = (html.match(/\/models\/[a-z0-9-]+\/[a-z0-9-]+\/[a-z0-9-]+/gi) || []).length
      const supra = /toyota\s+supra|supra\s+jza80/i.test(html)
      console.log(`[vertex-probe] ${response.status} ${url} final=${response.url} bytes=${html.length} modelLinks=${modelLinks} supra=${supra}`)
    } catch (error) {
      console.log(`[vertex-probe] ERROR ${url} ${error instanceof Error ? error.message : String(error)}`)
    }
  }
}
