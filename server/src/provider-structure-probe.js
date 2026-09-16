import * as cheerio from 'cheerio'
const UA='VJ3DSearch/1.1 (+https://github.com/vyiito/car3d-search)'

async function get(url, accept='text/html,*/*'){
  const response=await fetch(url,{redirect:'follow',headers:{'user-agent':UA,accept}})
  return {response,text:await response.text()}
}
async function probe(name,url){
  try{const {response,text}=await get(url,'application/json,text/html,*/*');console.log(`[deep-probe] ${name} status=${response.status} final=${response.url} bytes=${text.length} snippet=${text.replace(/\s+/g,' ').slice(0,1500)}`)}catch(error){console.log(`[deep-probe] ${name} ERROR ${error instanceof Error?error.message:String(error)}`)}
}
async function bundleProbe(name,url,markers){
  try{
    const {response,text:html}=await get(url)
    const $=cheerio.load(html)
    const scripts=$('script[src]').map((_,el)=>{try{return new URL($(el).attr('src'),response.url).href}catch{return null}}).get().filter(Boolean)
    console.log(`[bundle-probe] ${name} scripts=${scripts.slice(0,15).join(',')}`)
    for(const script of scripts.slice(-10)){
      try{
        const {text}=await get(script,'application/javascript,*/*')
        const lower=text.toLowerCase()
        const found=markers.filter(m=>lower.includes(m.toLowerCase()))
        if(!found.length) continue
        const snippets=[]
        for(const marker of found){const i=lower.indexOf(marker.toLowerCase());snippets.push(`${marker}:${text.slice(Math.max(0,i-350),i+900).replace(/\s+/g,' ')}`)}
        console.log(`[bundle-hit] ${name} script=${script} ${snippets.join(' || ')}`)
      }catch{}
    }
  }catch(error){console.log(`[bundle-probe] ${name} ERROR ${error instanceof Error?error.message:String(error)}`)}
}

export async function probeProviderStructures(){
  await probe('brasil-car-33662','https://brasilsimulatormods.com/wp-json/wp/v2/cars/33662?_embed=1')
  await probe('brasil-search-page2','https://brasilsimulatormods.com/wp-json/wp/v2/search?search=Toyota%20Supra&per_page=10&page=2')
  await bundleProbe('3dsky','https://3dsky.org/3dmodels?search=Toyota%20Supra%20car',['api/models','models?','search'])
  await bundleProbe('vosan','https://vosan.co/explore?search=Toyota%20Supra',['/api/','search','explore','axios','fetch('])
  await bundleProbe('3dwarehouse','https://3dwarehouse.sketchup.com/search/?q=Toyota%20Supra%20car%20vehicle',['graphql','/api/','search','models','fetch('])
}
