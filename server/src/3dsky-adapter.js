import { relevanceScore } from './search-core.js'
import { searchFetch as fetch, searchPageLimit, searchCheckpoint } from './search-context.js'
const UA='VJ3DSearch/1.6 (+https://github.com/vyiito/car3d-search)'
const API='https://3dsky.org/api/models'
const BASE='https://3dsky.org'
const IMAGE_BASE='https://b5.3dsky.org'
const YEAR_RE=/\b(19[3-9]\d|20[0-3]\d)\b/
const FORMAT_RE=/\b(fbx|obj|3ds|max|blend|c4d|dae|gltf|glb|stl|3mf)\b/gi
const BRANDS=['Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Chevrolet','Citroen','Dodge','Ferrari','Fiat','Ford','Funco Motorsports','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mercedes','Mini','Mitsubishi','Nissan','Opel','Pagani','Peugeot','Pontiac','Porsche','Renault','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo']
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
function brandOf(text){const n=norm(text);return BRANDS.find(b=>n.includes(norm(b)))||null}
function formatsOf(model){const text=[model?.properties?.platform?.titleEn,model?.properties?.platform?.title,model?.properties?.format?.titleEn,model?.properties?.format?.title].filter(Boolean).join(' ');return [...new Set((text.match(FORMAT_RE)||[]).map(x=>x.toUpperCase()))]}
function imageOf(model){const path=model?.images?.[0]?.web_path;if(!path)return null;try{return new URL(path.replace(/^\/+/,''),`${IMAGE_BASE}/`).href}catch{return null}}
function isTransport(model){return model?.category_parent?.slug==='transport'||model?.category?.slug==='ground-transport'||/transport/i.test(`${model?.category_parent?.title_en||''} ${model?.category?.title_en||''}`)}
function vehicleClass(text){const n=norm(text);if(/\b(suv|crossover|4x4|off.?road)\b/.test(n))return 'SUV';if(/\b(race|racing|gt3|gt4|rally|drift|formula)\b/.test(n))return 'Race Car';if(/\b(truck|pickup|pick-up|lorry)\b/.test(n))return 'Truck / Pickup';if(/\b(bus|coach|minibus)\b/.test(n))return 'Bus';if(/\b(van|minivan|mpv)\b/.test(n))return 'Van';if(/\b(motorcycle|motorbike|scooter|bike)\b/.test(n))return 'Motorcycle';return 'Car'}
function sizeOf(bytes,kb){const value=Number(bytes||0)||Number(kb||0)*1024;if(!value)return null;const mb=value/1024/1024;return mb>=1024?`${(mb/1024).toFixed(1)} GB`:`${mb.toFixed(mb>=100?0:1)} MB`}
export function skyPrice(model) {
  if (model?.model_type === 'free') return { price: 0, isFree: true, priceLabel: 'GRÁTIS' }
  const usd = model?.price_usd
  if (usd !== null && usd !== undefined && usd !== '' && Number.isFinite(Number(usd)) && Number(usd) > 0) {
    return { price: Number(usd), isFree: false, priceLabel: '$'+Number(usd).toFixed(2) }
  }
  // The API's price field is a local price, not USD. Do not label it dollars.
  const native = model?.price
  return { price: null, isFree: false, priceLabel: native !== null && native !== undefined && native !== '' && Number.isFinite(Number(native)) && Number(native)>0 ? String(native)+' · MOEDA NA FONTE' : 'PRO' }
}
async function page(query,page){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);try{const response=await fetch(API,{method:'POST',signal:controller.signal,redirect:'follow',headers:{'user-agent':UA,accept:'application/json','content-type':'application/json','accept-language':'en-US,en;q=0.9'},body:JSON.stringify({query,order:'relevance',page,types:['free','pro']})});if(!response.ok)throw new Error(`3DSky HTTP ${response.status}`);return await response.json()}finally{clearTimeout(timer)}}
export async function search3DSky(query,limit=60){
  const results=[],seen=new Set()
  let pagesFetched=0,totalPages=1,totalAvailable=0
  for(let p=1;p<=totalPages&&results.length<limit&&p<=searchPageLimit();p++){
    const payload=await page(query,p),data=payload?.data||{},models=Array.isArray(data.models)?data.models:[]
    pagesFetched++;totalAvailable=Number(data.total_value||0)
    totalPages=Math.max(1,Math.ceil(totalAvailable/Math.max(1,Number(data.per_page||60))))
    for(const model of models){
      if(!isTransport(model)||!model?.slug)continue
      const title=String(model.title_en||model.title||'').trim(),url=BASE+'/3dmodels/show/'+encodeURIComponent(model.slug)
      if(!title||!relevanceScore({title,brand:brandOf(title),vehicleEvidence:'catalog'},query)||seen.has(url))continue
      seen.add(url)
      const year=title.match(YEAR_RE)?.[1],market=skyPrice(model)
      results.push({id:'3dsky:'+model.slug,title,source:'3DSky',sourceId:'3dsky',vehicleEvidence:'catalog',sourceType:'3d-models',sourceUrl:url,imageUrl:imageOf(model),formats:formatsOf(model),...market,downloadable:null,downloadUrl:null,author:null,description:[model.model_type,model.category_parent?.title_en,model.category?.title_en,model.properties?.render?.title].filter(Boolean).join(' · ')||null,fileSize:sizeOf(model.data_file_size,model.properties?.size_kb),brand:brandOf(title),game:null,year:year?Number(year):null,vehicleClass:vehicleClass(title),score:10})
    }
    searchCheckpoint({results:[...results],pagesFetched,hasMore:p<totalPages,totalAvailable,sections:[API]})
    if(!models.length)break
  }
  const hasMore=pagesFetched<totalPages||results.length>limit
  return{results:results.slice(0,limit),pagesFetched,hasMore,totalAvailable,sections:[API],stopReason:hasMore?results.length>=limit?'result-limit':'page-limit':'exhausted'}
}
