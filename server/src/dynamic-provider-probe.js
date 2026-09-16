import { searchBrasilSimulatorMods } from './brasil-adapter.js'
const UA='VJ3DSearch/1.3 (+https://github.com/vyiito/car3d-search)'
function compact(v){return String(v||'').replace(/\s+/g,' ')}

async function post3dsky(body){
  const response=await fetch('https://3dsky.org/api/models',{method:'POST',redirect:'follow',headers:{'user-agent':UA,accept:'application/json','content-type':'application/json','accept-language':'en-US,en;q=0.9'},body:JSON.stringify(body)})
  const data=await response.json().catch(()=>null)
  return {response,data}
}

export async function runDynamicProviderProbe(){
  try{
    const bsm=await searchBrasilSimulatorMods('Toyota Supra',25)
    console.log(`[bsm-native] count=${bsm.results.length} pages=${bsm.pagesFetched}`)
  }catch(e){console.log(`[bsm-native] ERROR ${e instanceof Error?e.message:String(e)}`)}

  try{
    const {response,data}=await post3dsky({query:'Toyota Supra',order:'relevance',page:1,types:['free']})
    const models=data?.data?.models||[]
    console.log(`[3dsky-free] status=${response.status} total=${data?.data?.total_value??'n/a'} page=${data?.data?.page??'n/a'} per=${data?.data?.per_page??'n/a'} count=${models.length} types=${models.map(x=>x.model_type).join(',')} sample=${models.slice(0,5).map(x=>`${x.title_en||x.title}|${x.slug}|${x.model_type}|usd=${x.price_usd}|path=${x.images?.[0]?.web_path||''}|platform=${x.properties?.platform?.titleEn||x.properties?.platform?.title||''}`).join(' || ')}`)
  }catch(e){console.log(`[3dsky-free] ERROR ${e instanceof Error?e.message:String(e)}`)}

  try{
    const response=await fetch('https://3dwarehouse.sketchup.com/build-info-f166055.json',{headers:{'user-agent':UA,accept:'application/json'}})
    const data=await response.text()
    console.log(`[3dw-build] status=${response.status} body=${compact(data).slice(0,1000)}`)
    const main=await (await fetch('https://3dwarehouse.sketchup.com/assets/index-DxBaKD0H.js',{headers:{'user-agent':UA}})).text()
    const patterns=['apiBase:', 'apiVersion:', 'apiBase=', 'apiVersion=', 'production:', 'whp-api', 'api.sketchup', '3dwarehouse-api']
    for(const pattern of patterns){const i=main.toLowerCase().indexOf(pattern.toLowerCase());if(i>=0)console.log(`[3dw-config] ${pattern}@${i} ${compact(main.slice(Math.max(0,i-700),i+1800))}`)}
  }catch(e){console.log(`[3dw-config] ERROR ${e instanceof Error?e.message:String(e)}`)}
}
