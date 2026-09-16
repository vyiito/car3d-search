import * as cheerio from 'cheerio'
import { searchBrasilSimulatorMods } from './brasil-adapter.js'
const UA='VJ3DSearch/1.2 (+https://github.com/vyiito/car3d-search)'
async function text(url,accept='text/html,*/*'){const r=await fetch(url,{headers:{'user-agent':UA,accept},redirect:'follow'});return {r,t:await r.text()}}
function compact(v){return String(v||'').replace(/\s+/g,' ')}
function contexts(source, needles, radius=1000){const lower=source.toLowerCase(),out=[];for(const needle of needles){let from=0,count=0;while(count<7){const i=lower.indexOf(needle.toLowerCase(),from);if(i<0)break;out.push(`${needle}@${i}:${compact(source.slice(Math.max(0,i-radius),i+radius))}`);from=i+needle.length;count++}}return out}

export async function runDynamicProviderProbe(){
  try{
    const bsm=await searchBrasilSimulatorMods('Toyota Supra',25)
    console.log(`[bsm-native] count=${bsm.results.length} pages=${bsm.pagesFetched} sample=${bsm.results.slice(0,4).map(x=>`${x.title}|${x.imageUrl?'img':'noimg'}|${x.game||'nogame'}`).join(' || ')}`)
  }catch(e){console.log(`[bsm-native] ERROR ${e instanceof Error?e.message:String(e)}`)}

  try{
    const {r,t:html}=await text('https://3dwarehouse.sketchup.com/search/?q=Toyota%20Supra%20car%20vehicle')
    const $=cheerio.load(html)
    const main=$('script[src]').map((_,e)=>{try{return new URL($(e).attr('src'),r.url).href}catch{return null}}).get().filter(Boolean).find(u=>/\/assets\/index-.*\.js/.test(u))
    if(main){
      const {t:js}=await text(main,'application/javascript,*/*')
      const lazy=[...js.matchAll(/assets\/[A-Za-z0-9_.-]*SearchResults[A-Za-z0-9_.-]*\.js/g)].map(m=>m[0])
      console.log(`[3dw-probe] main=${main} lazy=${[...new Set(lazy)].join(',')}`)
      for(const path of [...new Set(lazy)].slice(0,5)){
        const url=new URL(`/${path.replace(/^\//,'')}`,r.url).href
        const {t:chunk}=await text(url,'application/javascript,*/*')
        console.log(`[3dw-chunk] url=${url} bytes=${chunk.length} contexts=${contexts(chunk,['api.sketchup.com','/api/','searchService','search?','query=','graphql','axios','fetch(','pageSize','offset','cursor'],900).join(' || ')}`)
      }
    }
  }catch(e){console.log(`[3dw-probe] ERROR ${e instanceof Error?e.message:String(e)}`)}

  try{
    const {t:js}=await text('https://3dsky.org/base-assets/main.89a1826cc03b2765.js','application/javascript,*/*')
    console.log(`[3dsky-probe2] bytes=${js.length} contexts=${contexts(js,['modelRequest','getModels(','loadModels','y0.models','modelsListService','apiModelUrl+','filter_models'],1250).join(' || ')}`)
  }catch(e){console.log(`[3dsky-probe2] ERROR ${e instanceof Error?e.message:String(e)}`)}
}
