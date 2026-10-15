import { elementImages, pageImages } from './preview-images.js'
import { searchFetch as fetch, searchPageLimit, searchCheckpoint } from './search-context.js'
import { crawlCatalog } from './catalog-crawler.js'
import { catalogResult } from './structured-adapters.js'
import { relevanceScore } from './search-core.js'
import { providers } from './providers.js'
import * as cheerio from 'cheerio'
import pLimit from 'p-limit'

const UA='VJ3DSearch/1.6 (+https://github.com/vyiito/car3d-search)'
const BROWSE='https://games.vosan.co/browse/assetto-corsa'
const DETAIL_BASE='https://vosan.co'
const pageLimit=pLimit(5)
const detailLimit=pLimit(5)
const YEAR_RE=/\b(19[3-9]\d|20[0-3]\d)\b/
const PRICE_RE=/(?:US\$|\$|€|£)\s?(\d+(?:[.,]\d{1,2})?)/i
const BRANDS=['Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Cadillac','Chevrolet','Dodge','Ferrari','Fiat','Ford','Funco Motorsports','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mercedes','Mini','Mitsubishi','Nissan','Opel','Pagani','Peugeot','Pontiac','Porsche','Renault','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo']
const clean=v=>String(v||'').replace(/\s+/g,' ').trim()
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
const esc=v=>v.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')
function score(text,query){const s=norm(text),tokens=norm(query).split(/\s+/).filter(t=>t.length>1);let n=0;for(const t of tokens)if(s.includes(t))n++;if(s.includes(norm(query)))n+=3;return n}
function brandOf(text){const s=norm(text);return BRANDS.find(b=>new RegExp(`(^|[^a-z0-9])${esc(norm(b))}([^a-z0-9]|$)`,'i').test(s))||null}
function vehicleClass(text){const s=norm(text);if(/\b(suv|crossover|4x4|off.?road)\b/.test(s))return 'SUV';if(/\b(formula|gt3|gt4|drift|race|racing|rally|vdc|d1gp|formula drift)\b/.test(s))return 'Race Car';return 'Car'}
function priceFrom(text){const match=clean(text).match(PRICE_RE);if(!match)return null;const value=Number(match[1].replace(',','.'));return Number.isFinite(value)?value:null}
async function fetchHtml(url,timeout=12000){const c=new AbortController(),timer=setTimeout(()=>c.abort(),timeout);try{const r=await fetch(url,{signal:c.signal,redirect:'follow',headers:{'user-agent':UA,accept:'text/html,application/xhtml+xml','accept-language':'en-US,en;q=0.9'}});if(!r.ok)throw new Error(`VOSAN HTTP ${r.status}`);return{html:await r.text(),finalUrl:r.url}}finally{clearTimeout(timer)}}
function browseUrl(page){const u=new URL(BROWSE);u.searchParams.set('category','cars');u.searchParams.set('page',String(page));u.searchParams.set('sort','latest');return u.href}
function maxPage(html){const $=cheerio.load(html);let max=1;$('a[href]').each((_,el)=>{try{const u=new URL($(el).attr('href'),BROWSE),p=Number(u.searchParams.get('page')||0);if(Number.isFinite(p))max=Math.max(max,p)}catch{}});return Math.min(Math.max(max,1),24)}
function candidates(html,query){const $=cheerio.load(html),out=[],seen=new Set();$('a[href]').each((_,el)=>{const a=$(el);let u;try{u=new URL(a.attr('href'),DETAIL_BASE)}catch{return}if(!/(?:^|\.)vosan\.co$/i.test(u.hostname)||!/^\/(cars|car_packs)\//i.test(u.pathname))return;const card=a.closest('article,[class*="card"],[class*="Card"],li').first();const title=clean(a.attr('title')||a.find('h1,h2,h3,h4').first().text()||a.text()||card.find('h1,h2,h3,h4').first().text());const text=clean(`${title} ${card.text()}`);if(!title||(!/^\/car_packs\//i.test(u.pathname)&&score(text,query)<=0)||seen.has(u.href))return;seen.add(u.href);const rawImg=elementImages($,card.length?card:a,u.href)[0]||null;let imageUrl=null;try{if(rawImg)imageUrl=new URL(rawImg,u.href).href}catch{}out.push({title,sourceUrl:u.href,imageUrl,relevance:score(text,query)})});return out}
function meta($,property){return $(`meta[property="${property}"],meta[name="${property}"]`).first().attr('content')||null}
async function enrich(candidate){try{const{html}=await fetchHtml(candidate.sourceUrl,10000),$=cheerio.load(html),text=clean($('body').text());const h1=clean($('h1').first().text()),title=h1||candidate.title;const description=clean(meta($,'description')||$('.description,[class*="description"],.entry-content').first().text()).slice(0,520)||null;const image=pageImages($,candidate.sourceUrl)[0]||candidate.imageUrl||null;const author=clean($('a[href*="/partner/"],a[href*="/profile/"]').first().text())||null;const yearMatch=`${title} ${description||''}`.match(YEAR_RE);const explicitFree=/(?:^|\s)FREE(?:\s|$)/i.test(text);const premium=/\b(?:Premium|Buy Now|Purchase)\b/i.test(text.slice(0,7000));const parsedPrice=priceFrom(text.slice(0,10000));const isFree=explicitFree&&!premium&&!(parsedPrice&&parsedPrice>0);const price=isFree?0:parsedPrice;return{id:`vosan:${Buffer.from(candidate.sourceUrl).toString('base64url').slice(0,28)}`,title,source:'VOSAN',sourceId:'vosan',vehicleEvidence:'catalog',sourceType:'game-mods',sourceUrl:candidate.sourceUrl,imageUrl:image,formats:[],price,isFree:isFree?true:premium||parsedPrice!==null?false:null,downloadable:null,downloadUrl:null,author,description:[isFree?'FREE':premium?'PREMIUM':null,description].filter(Boolean).join(' · ')||null,fileSize:null,includedVehicles:/\/car_packs\//i.test(candidate.sourceUrl)?$('.description,[class*="description"],.entry-content').find('li,h2,h3').map((_,el)=>clean($(el).text())).get().filter(value=>value.length<180):[],brand:brandOf(title),game:'Assetto Corsa',year:yearMatch?Number(yearMatch[1]):null,vehicleClass:vehicleClass(`${title} ${description||''}`),score:candidate.relevance+7}}catch{return null}}
export async function searchVosan(query,limit=60){
  const provider=providers.find(item=>item.id==='vosan')
  const payload=await crawlCatalog({query,limit,provider,
    seeds:[browseUrl(1)+'&search='+encodeURIComponent(query),BROWSE+'?category=car-pack&page=1&sort=latest&search='+encodeURIComponent(query)],
    parse:async(html)=>Promise.all(candidates(html,query).map(async candidate=>{if(/\/car_packs\//i.test(candidate.sourceUrl))return await enrich(candidate)||catalogResult('vosan',{vehicleEvidence:'catalog',title:candidate.title,sourceUrl:candidate.sourceUrl,imageUrl:candidate.imageUrl,game:'Assetto Corsa'});return catalogResult('vosan',{vehicleEvidence:'catalog',title:candidate.title,sourceUrl:candidate.sourceUrl,imageUrl:candidate.imageUrl,game:'Assetto Corsa'})})),
  })
  // Preserve all catalog hits before attempting detail enrichment. A slow
  // detail page must not hide the car that the listing already exposed.
  searchCheckpoint(payload)
  const results=[]
  for(const item of payload.results){
    const detail=await enrich({...item,relevance:item.score})
    results.push(detail&&relevanceScore(detail,query)?detail:item)
    searchCheckpoint({...payload,results:[...results,...payload.results.slice(results.length)]})
  }
  return {...payload,results}
}
