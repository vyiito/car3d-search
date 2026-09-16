const targets = [
  ['cgtrader','https://www.cgtrader.com/3d-models/supra'],
  ['vosan','https://vosan.co/explore?search=Toyota%20Supra'],
  ['done3d','https://done3d.com/?s=Toyota%20Supra'],
  ['3dsky','https://3dsky.org/3dmodels?search=Toyota%20Supra%20car'],
  ['3dwarehouse','https://3dwarehouse.sketchup.com/search/?q=Toyota%20Supra%20car%20vehicle'],
  ['3drush','https://3drush.com/?s=Toyota%20Supra'],
  ['brasil','https://brasilsimulatormods.com/?s=Toyota%20Supra'],
]

export async function probeProviderStructures() {
  for (const [name,url] of targets) {
    try {
      const response = await fetch(url,{redirect:'follow',headers:{'user-agent':'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)','accept':'text/html,application/xhtml+xml'}})
      const html = await response.text()
      const lower = html.toLowerCase()
      const markers = ['listingitem','toyota supra','__next_data__','self.__next_f','initialdata','application/ld+json','search-result','product-card','model-card','nuxt','__data__'].filter(marker=>lower.includes(marker))
      const focus = ['listingitem','toyota supra','initialdata','__next_data__','self.__next_f'].map(marker=>[marker,lower.indexOf(marker)]).find(([,index])=>index>=0)
      const snippet = focus ? html.slice(Math.max(0,focus[1]-300),Math.min(html.length,focus[1]+1500)).replace(/\s+/g,' ') : ''
      console.log(`[structure-probe] ${name} status=${response.status} final=${response.url} bytes=${html.length} markers=${markers.join(',')} snippet=${snippet}`)
    } catch(error){console.log(`[structure-probe] ${name} ERROR ${error instanceof Error?error.message:String(error)}`)}
  }
}
