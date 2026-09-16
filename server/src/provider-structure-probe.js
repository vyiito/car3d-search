import * as cheerio from 'cheerio'

const targets = [
  ['done3d','https://done3d.com/?s=Toyota%20Supra'],
  ['brasil','https://brasilsimulatormods.com/?s=Toyota%20Supra'],
  ['3drush','https://3drush.com/?s=Toyota%20Supra'],
]

export async function probeProviderStructures() {
  for (const [name,url] of targets) {
    try {
      const response = await fetch(url,{redirect:'follow',headers:{'user-agent':'VJ3DSearch/1.0 (+https://github.com/vyiito/car3d-search)','accept':'text/html,application/xhtml+xml'}})
      const html = await response.text()
      const $ = cheerio.load(html)
      const title = $('title').text().replace(/\s+/g,' ').trim()
      const hits=[]
      $('a[href]').each((_,el)=>{
        const node=$(el)
        const href=new URL(node.attr('href')||'',response.url).href
        const text=`${node.text()} ${node.attr('title')||''} ${node.attr('aria-label')||''}`.replace(/\s+/g,' ').trim()
        const parent=node.closest('article,.post,.item,.card,.search-result,.product,.elementor-post,.blog-item,li')
        const parentText=parent.text().replace(/\s+/g,' ').trim().slice(0,260)
        if(/supra|toyota/i.test(`${href} ${text} ${parentText}`)) hits.push({href,text,parentText})
      })
      console.log(`[html-links] ${name} status=${response.status} title=${title} articles=${$('article').length} searchResults=${$('.search-result').length} posts=${$('.post,.elementor-post').length} hits=${JSON.stringify(hits.slice(0,12))}`)
    } catch(error){console.log(`[html-links] ${name} ERROR ${error instanceof Error?error.message:String(error)}`)}
  }
}
