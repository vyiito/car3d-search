import React, { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, CalendarRange, CarFront, Check, ChevronDown, CircleCheck, CircleX,
  Columns3, Database, Download, FileText, Filter, Gamepad2, Gauge, Globe2, Grid2X2,
  Heart, History, ImageOff, Layers3, List, LoaderCircle, RotateCcw, Search,
  ShieldCheck, SlidersHorizontal, X, Zap,
} from 'lucide-react'
import { providers, type Provider } from './data/providers'
import { type GlobalSearchResult, type SourceSearchStatus } from './api/search'
import { progressiveSearch } from './api/progressive'
import DiscoveryCarousel from './components/DiscoveryCarousel'
import ResultDetailView from './components/ResultDetailView'
import BrandsExplorer from './components/BrandsExplorer'
import GamesExplorer from './components/GamesExplorer'
import './styles.css'
import './v2.css'
import './market.css'
import './progressive.css'

type KindFilter = 'Todos' | '3D Model' | 'Game Mod'
type SortMode = 'Mix de fontes' | 'Relevância' | 'Mais recentes' | 'Menor preço' | 'Maior preço' | 'Nome A-Z' | 'Fonte'
type DownloadMode = 'Todos' | 'Direto' | 'Via fonte'
type ImageMode = 'Todos' | 'Com imagem' | 'Sem imagem'
type PriceMode = 'Todos' | 'Grátis' | 'Pago'
type VehicleGroup = 'Todos' | 'Car' | 'SUV' | 'Race Car' | 'Motorcycle' | 'Truck / Pickup' | 'Van' | 'Bus' | 'Utility / Tractor'
type ViewMode = 'grid' | 'compact' | 'showcase'
type FacetSkip = 'source' | 'game' | 'format' | 'price' | 'vehicle' | null

const vehicleGroups: { value: VehicleGroup; label: string }[] = [
  { value: 'Todos', label: 'Todos' }, { value: 'Car', label: 'Carros' }, { value: 'SUV', label: 'SUVs' },
  { value: 'Race Car', label: 'Corrida' }, { value: 'Motorcycle', label: 'Motos' },
  { value: 'Truck / Pickup', label: 'Caminhões / Pickups' }, { value: 'Van', label: 'Vans' },
  { value: 'Bus', label: 'Ônibus' }, { value: 'Utility / Tractor', label: 'Utilitários / Tratores' },
]

const searchIdeas = ['Honda City','Toyota Supra MK4','BMW E36','Porsche 911 GT3','Nissan Skyline R34','Subaru Forester STI','Mitsubishi Lancer Evolution','2018 Funco Motorsports F9','Scania R','Ferrari F40','Mazda RX-7','Honda NSX']
const PAGE_SIZE = 50

function providerSearchUrl(provider: Provider, term: string) {
  const clean = term.trim()
  if (!clean) return provider.searchUrl || provider.url
  if (provider.searchUrl?.includes('{query}')) return provider.searchUrl.replace('{query}', encodeURIComponent(clean))
  try { return `https://www.google.com/search?q=${encodeURIComponent(`site:${new URL(provider.url).hostname.replace(/^www\./,'')} ${clean} car vehicle 3d`)}` }
  catch { return provider.searchUrl || provider.url }
}

function toggleValue(list: string[], value: string) { return list.includes(value) ? list.filter(item => item !== value) : [...list, value] }
function mergeSearchResults(current: GlobalSearchResult[], incoming: GlobalSearchResult[]) {
  const map = new Map(current.map(item => [`${item.sourceId}|${item.sourceUrl}`, item]))
  for (const item of incoming) {
    const key = `${item.sourceId}|${item.sourceUrl}`
    const previous = map.get(key)
    if (!previous || item.score >= previous.score) map.set(key, previous ? { ...previous, ...item } : item)
  }
  return [...map.values()]
}
function upsertSourceStatus(current: SourceSearchStatus[], incoming: SourceSearchStatus) {
  const next = current.filter(item => item.provider !== incoming.provider)
  return [...next, incoming].sort((a,b) => a.name.localeCompare(b.name))
}
function paginationItems(current: number, total: number): Array<number | '…'> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const values = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2].filter(page => page >= 1 && page <= total))
  const pages = [...values].sort((a,b) => a - b)
  const out: Array<number | '…'> = []
  pages.forEach((page,index) => { if (index && page - pages[index - 1] > 1) out.push('…'); out.push(page) })
  return out
}
function safeParse<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback } }
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
const DUPLICATE_NOISE = new Set([
  '3d','model','models','car','cars','vehicle','vehicles','free','download','downloads','texture','textures','asset','assets',
  'game','ready','updated','update','highpoly','midpoly','lowpoly','high','mid','low','poly','source','ripped','rip','pack',
  'asphalt','legends','carx','drift','racing','simulator','forza','need','speed','real','gran','turismo','assoluto','mobile',
  'official','the','and','with','from','edition','mt','m','t'
])
const DUPLICATE_VARIANTS = new Set([
  'rs','turbo','carrera','competition','nismo','sti','wrx','evo','evolution','sv','svj','performante','spyder','roadster',
  'convertible','cabrio','wagon','estate','sedan','coupe','hatchback','dtm','lm','gr','zr1','z06','clubsport'
])
function duplicateNormalize(value:string) {
  let text = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  const colon = text.indexOf(':')
  if (colon > 0 && /(racing|simulator|asphalt|forza|speed|wrc|carx|assoluto|gran turismo|ridge racer|drift)/.test(text.slice(0,colon))) text = text.slice(colon + 1)
  text = text
    .replace(/['"“”‘’][^'"“”‘’]{2,70}['"“”‘’]/g,' ')
    .replace(/\bgt[\s-]?r\b/g,'gtr')
    .replace(/\btype[\s-]?r\b/g,'typer')
    .replace(/\bmx[\s-]?5\b/g,'mx5')
    .replace(/\bmk[\s-]?iv\b/g,'mk4')
    .replace(/\bmk[\s-]?v\b/g,'mk5')
    .replace(/\bmk[\s-]?vi\b/g,'mk6')
    .replace(/\b(19|20)\d{2}\b/g,' ')
    .replace(/[^a-z0-9]+/g,' ')
  return text.trim()
}
function duplicateTokens(result:GlobalSearchResult) {
  const brandTokens = new Set(duplicateNormalize(result.brand || '').split(/\s+/).filter(Boolean))
  const tokens = duplicateNormalize(result.title).split(/\s+/)
    .filter(token => token.length > 1 && !brandTokens.has(token) && !DUPLICATE_NOISE.has(token))
  return [...new Set(tokens)]
}
function duplicateFeatures(result:GlobalSearchResult) {
  return {
    brand: duplicateNormalize(result.brand || ''),
    year: result.year || null,
    vehicleClass: result.vehicleClass || '',
    tokens: duplicateTokens(result),
  }
}
function likelyDuplicate(a:ReturnType<typeof duplicateFeatures>, b:ReturnType<typeof duplicateFeatures>) {
  if (a.brand && b.brand && a.brand !== b.brand) return false
  if (a.year && b.year && a.year !== b.year) return false
  if ((a.vehicleClass === 'Motorcycle') !== (b.vehicleClass === 'Motorcycle')) return false
  if (!a.tokens.length || !b.tokens.length) return false
  const left = new Set(a.tokens), right = new Set(b.tokens)
  const intersection = a.tokens.filter(token => right.has(token))
  if (!intersection.length) return false
  const extras = [...a.tokens.filter(token=>!right.has(token)), ...b.tokens.filter(token=>!left.has(token))]
  if (extras.some(token => DUPLICATE_VARIANTS.has(token))) return false
  const minSize = Math.min(left.size,right.size), unionSize = new Set([...left,...right]).size
  const containment = intersection.length / Math.max(1,minSize)
  const jaccard = intersection.length / Math.max(1,unionSize)
  const sharedStrong = intersection.filter(token => /\d/.test(token))
  if (intersection.length >= 2 && containment >= .84) return true
  if (intersection.length >= 2 && jaccard >= .72) return true
  if (sharedStrong.length >= 1 && intersection.length >= 2 && containment >= .66) return true
  return left.size === right.size && intersection.length === left.size
}
function buildDuplicateGroups(items:GlobalSearchResult[]) {
  const features = items.map(duplicateFeatures)
  const parent = items.map((_,index)=>index)
  const find=(value:number):number=>{while(parent[value]!==value){parent[value]=parent[parent[value]];value=parent[value]}return value}
  const union=(a:number,b:number)=>{const ra=find(a),rb=find(b);if(ra!==rb)parent[rb]=ra}
  const tokenIndex = new Map<string,number[]>()
  features.forEach((feature,index)=>feature.tokens.forEach(token=>{const list=tokenIndex.get(token)||[];list.push(index);tokenIndex.set(token,list)}))
  features.forEach((feature,index)=>{
    const candidates=new Set<number>()
    const usefulTokens=[...feature.tokens]
      .map(token=>[token,tokenIndex.get(token)||[]] as const)
      .filter(([,matches])=>matches.length>1&&matches.length<=80)
      .sort((a,b)=>a[1].length-b[1].length)
      .slice(0,3)
    for(const [,matches] of usefulTokens){
      for(const other of matches){
        if(other>index)candidates.add(other)
        if(candidates.size>=120)break
      }
      if(candidates.size>=120)break
    }
    candidates.forEach(other=>{if(likelyDuplicate(feature,features[other]))union(index,other)})
  })
  const keyById=new Map<string,string>(), sourceSets=new Map<string,Set<string>>(), itemCounts=new Map<string,number>()
  items.forEach((item,index)=>{
    const key=`dup:${find(index)}`
    keyById.set(item.id,key)
    itemCounts.set(key,(itemCounts.get(key)||0)+1)
    const sources=sourceSets.get(key)||new Set<string>();sources.add(item.sourceId || item.source);sourceSets.set(key,sources)
  })
  const sourceCounts=new Map<string,number>()
  sourceSets.forEach((sources,key)=>sourceCounts.set(key,sources.size))
  return { keyById, sourceCounts, itemCounts }
}
function duplicateRepresentativeScore(result:GlobalSearchResult) {
  return result.score + (result.imageUrl?3:0) + (result.downloadUrl?2:0) + Math.min(result.formats.length,4) * .25 + (result.description?0.5:0)
}
function quickDuplicateKey(result:GlobalSearchResult) {
  const tokens=duplicateTokens(result).slice(0,6)
  return `${duplicateNormalize(result.brand||'')}|${result.year||''}|${result.vehicleClass||''}|${tokens.join(' ')}`
}
function buildQuickDuplicateCounts(items:GlobalSearchResult[]) {
  const sourceSets=new Map<string,Set<string>>()
  for(const item of items){
    const key=quickDuplicateKey(item)
    const sources=sourceSets.get(key)||new Set<string>()
    sources.add(item.sourceId||item.source)
    sourceSets.set(key,sources)
  }
  const counts=new Map<string,number>()
  sourceSets.forEach((sources,key)=>counts.set(key,sources.size))
  return counts
}
function marketKind(result: GlobalSearchResult): 'free' | 'paid' | 'unknown' {
  if (result.isFree === true || result.price === 0) return 'free'
  if (result.isFree === false || (typeof result.price === 'number' && result.price > 0)) return 'paid'
  return 'unknown'
}
function formatPrice(result: GlobalSearchResult) {
  if (marketKind(result) === 'free') return 'GRÁTIS'
  if (typeof result.price === 'number' && result.price > 0) return `$${result.price.toFixed(result.price % 1 ? 2 : 0)}`
  if (marketKind(result) === 'paid') return 'PAGO'
  return 'PREÇO NA FONTE'
}
function qualitySignals(result: GlobalSearchResult) {
  const text = `${result.title} ${result.description || ''}`.toLowerCase()
  const signals: string[] = []
  if (/\bpbr\b|physically based/.test(text)) signals.push('PBR')
  if (/texture|textured|4k|8k/.test(text)) signals.push('TEXTURAS')
  if (/rigged|rigging/.test(text)) signals.push('RIGGED')
  if (/interior|cockpit/.test(text)) signals.push('INTERIOR')
  if (/engine bay|engine model|motor model/.test(text)) signals.push('MOTOR')
  if (/high.?poly|high poly/.test(text)) signals.push('HIGH POLY')
  if (/low.?poly|low poly/.test(text)) signals.push('LOW POLY')
  if (/game.?ready|game ready/.test(text)) signals.push('GAME READY')
  if (result.formats.some(f => ['BLEND','FBX','OBJ','GLB','GLTF'].includes(f))) signals.push('BLENDER')
  if (result.formats.some(f => ['STL','3MF'].includes(f))) signals.push('PRINT 3D')
  if (result.formats.some(f => ['KN5','UNITYPACKAGE'].includes(f))) signals.push('CONVERSÃO')
  return [...new Set(signals)].slice(0,5)
}
function mixBySource(items: GlobalSearchResult[]) {
  const groups = new Map<string, GlobalSearchResult[]>()
  for (const item of [...items].sort((a,b)=>b.score-a.score)) { const group=groups.get(item.source)||[]; group.push(item); groups.set(item.source,group) }
  const ordered=[...groups.values()].sort((a,b)=>(b[0]?.score||0)-(a[0]?.score||0)), mixed:GlobalSearchResult[]=[]
  for(let i=0;mixed.length<items.length;i+=1){let added=false;for(const group of ordered)if(group[i]){mixed.push(group[i]);added=true}if(!added)break}
  return mixed
}
function countValues(items: GlobalSearchResult[], getValues: (item: GlobalSearchResult) => string[]) {
  const map = new Map<string,number>()
  items.forEach(item => getValues(item).filter(Boolean).forEach(value => map.set(value,(map.get(value)||0)+1)))
  return map
}
function facetRows(map: Map<string,number>, selected: string[]) {
  const keys = new Set([...map.keys(),...selected])
  return [...keys].map(key => [key,map.get(key)||0] as [string,number]).sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0]))
}
function SelectFilter({ label, value, onChange, options }: { label:string; value:string; onChange:(value:string)=>void; options:string[] }) {
  return <div className="filterBlock"><label>{label}</label><div className="selectWrap"><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(option=><option key={option}>{option}</option>)}</select><ChevronDown size={14}/></div></div>
}

function App(){
  const [query,setQuery]=useState('')
  const [submittedQuery,setSubmittedQuery]=useState('')
  const [selectedBrand,setSelectedBrand]=useState<string|null>(null)
  const [kind,setKind]=useState<KindFilter>('Todos')
  const [vehicleClass,setVehicleClass]=useState<VehicleGroup>('Todos')
  const [priceMode,setPriceMode]=useState<PriceMode>('Todos')
  const [selectedFormats,setSelectedFormats]=useState<string[]>([])
  const [selectedSources,setSelectedSources]=useState<string[]>([])
  const [selectedGames,setSelectedGames]=useState<string[]>([])
  const [downloadMode,setDownloadMode]=useState<DownloadMode>('Todos')
  const [imageMode,setImageMode]=useState<ImageMode>('Todos')
  const [yearFrom,setYearFrom]=useState('')
  const [yearTo,setYearTo]=useState('')
  const [sortMode,setSortMode]=useState<SortMode>('Mix de fontes')
  const [viewMode,setViewMode]=useState<ViewMode>(()=>safeParse<ViewMode>('vj:view','grid'))
  const [groupDuplicates,setGroupDuplicates]=useState(false)
  const [searchFocused,setSearchFocused]=useState(false)
  const [filtersOpen,setFiltersOpen]=useState(false)
  const [remoteResults,setRemoteResults]=useState<GlobalSearchResult[]>([])
  const [sourceStatuses,setSourceStatuses]=useState<SourceSearchStatus[]>([])
  const [currentPage,setCurrentPage]=useState(1)
  const [searchedSourceCount,setSearchedSourceCount]=useState(0)
  const [loading,setLoading]=useState(false)
  const [apiError,setApiError]=useState<string|null>(null)
  const [selectedResult,setSelectedResult]=useState<GlobalSearchResult|null>(null)
  const [pendingAssetUrl,setPendingAssetUrl]=useState<string|null>(null)
  const [favorites,setFavorites]=useState<GlobalSearchResult[]>(()=>safeParse<GlobalSearchResult[]>('vj:favorites',[]))
  const [history,setHistory]=useState<string[]>(()=>safeParse<string[]>('vj:history',[]))
  const [brandHistory,setBrandHistory]=useState<string[]>(()=>safeParse<string[]>('vj:brands',[]))

  useEffect(()=>{
    const params=new URLSearchParams(window.location.search),brand=params.get('brand'),game=params.get('game'),asset=params.get('asset')
    const initial=brand||params.get('q')
    if(initial&&initial.length>=2){setQuery(initial);setSubmittedQuery(initial);if(brand)setSelectedBrand(brand);if(game)setSelectedGames([game])}
    if(asset)setPendingAssetUrl(asset)
  },[])

  useEffect(()=>{
    if(!submittedQuery)return
    const controller=new AbortController()
    setLoading(true);setApiError(null);setRemoteResults([]);setSourceStatuses([]);setCurrentPage(1);setSearchedSourceCount(0)
    progressiveSearch(submittedQuery,{
      onSource:event=>{
        setRemoteResults(current=>mergeSearchResults(current,event.results))
        setSourceStatuses(current=>upsertSourceStatus(current,event.source))
        setSearchedSourceCount(event.completed)
      },
      onDone:event=>{setSearchedSourceCount(event.completed);setLoading(false)},
      onError:message=>setApiError(message),
    },controller.signal).catch(error=>{
      if(error?.name==='AbortError')return
      setApiError(`O agregador progressivo não respondeu. As ${providers.length} fontes continuam acessíveis pela busca direta.`)
    }).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[submittedQuery])
  useEffect(()=>{if(!pendingAssetUrl||!remoteResults.length)return;const found=remoteResults.find(r=>r.sourceUrl===pendingAssetUrl);if(found){setSelectedResult(found);setPendingAssetUrl(null)}},[pendingAssetUrl,remoteResults])
  useEffect(()=>{save('vj:view',viewMode)},[viewMode])
  useEffect(()=>{const onKey=(event:KeyboardEvent)=>{const target=event.target as HTMLElement|null,typing=target&&['INPUT','TEXTAREA','SELECT'].includes(target.tagName);if(!typing&&event.key==='/'){event.preventDefault();document.getElementById('vj-search-input')?.focus()}if(!typing&&event.key.toLowerCase()==='f'&&submittedQuery&&!selectedResult)setFiltersOpen(v=>!v);if(!typing&&event.key.toLowerCase()==='g')setViewMode('grid');if(!typing&&event.key.toLowerCase()==='c')setViewMode('compact')};window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey)},[submittedQuery,selectedResult])

  const suggestions=useMemo(()=>{const q=query.trim().toLowerCase();return q?searchIdeas.filter(term=>term.toLowerCase().includes(q)).slice(0,5):[]},[query])
  const rawResults=remoteResults
  const deferredResults=useDeferredValue(rawResults)
  const uiResults=loading?deferredResults:rawResults
  const yearBounds=useMemo(()=>{const years=uiResults.map(r=>r.year).filter((y):y is number=>Boolean(y));return years.length?{min:Math.min(...years),max:Math.max(...years)}:{min:1950,max:new Date().getFullYear()+1}},[uiResults])

  const applyFilters=(items:GlobalSearchResult[],skip:FacetSkip=null)=>{
    const from=yearFrom?Number(yearFrom):null,to=yearTo?Number(yearTo):null
    return items.filter(result=>{
      const price=marketKind(result)
      const matchesPrice=skip==='price'||priceMode==='Todos'||(priceMode==='Grátis'?price==='free':price==='paid')
      const matchesKind=kind==='Todos'||(kind==='3D Model'?result.sourceType==='3d-models':result.sourceType==='game-mods')
      const matchesVehicle=skip==='vehicle'||vehicleClass==='Todos'||result.vehicleClass===vehicleClass
      const matchesFormats=skip==='format'||!selectedFormats.length||selectedFormats.some(f=>result.formats.includes(f))
      const matchesSources=skip==='source'||!selectedSources.length||selectedSources.includes(result.source)
      const matchesGames=skip==='game'||!selectedGames.length||Boolean(result.game&&selectedGames.includes(result.game))
      const matchesDownload=downloadMode==='Todos'||(downloadMode==='Direto'?Boolean(result.downloadUrl):!result.downloadUrl)
      const matchesImage=imageMode==='Todos'||(imageMode==='Com imagem'?Boolean(result.imageUrl):!result.imageUrl)
      const matchesYear=(!from&&!to)||(Boolean(result.year)&&(!from||(result.year||0)>=from)&&(!to||(result.year||9999)<=to))
      return matchesPrice&&matchesKind&&matchesVehicle&&matchesFormats&&matchesSources&&matchesGames&&matchesDownload&&matchesImage&&matchesYear
    })
  }

  const sourceCounts=useMemo(()=>countValues(applyFilters(uiResults,'source'),r=>[r.source]),[uiResults,priceMode,kind,vehicleClass,selectedFormats,selectedGames,downloadMode,imageMode,yearFrom,yearTo])
  const gameCounts=useMemo(()=>countValues(applyFilters(uiResults,'game'),r=>r.game?[r.game]:[]),[uiResults,priceMode,kind,vehicleClass,selectedFormats,selectedSources,downloadMode,imageMode,yearFrom,yearTo])
  const formatCounts=useMemo(()=>countValues(applyFilters(uiResults,'format'),r=>r.formats),[uiResults,priceMode,kind,vehicleClass,selectedSources,selectedGames,downloadMode,imageMode,yearFrom,yearTo])
  const priceCounts=useMemo(()=>{const map=new Map<string,number>();applyFilters(uiResults,'price').forEach(r=>map.set(marketKind(r),(map.get(marketKind(r))||0)+1));return map},[uiResults,kind,vehicleClass,selectedFormats,selectedSources,selectedGames,downloadMode,imageMode,yearFrom,yearTo])
  const vehicleCounts=useMemo(()=>countValues(applyFilters(uiResults,'vehicle'),r=>[r.vehicleClass]),[uiResults,priceMode,kind,selectedFormats,selectedSources,selectedGames,downloadMode,imageMode,yearFrom,yearTo])
  const sourceRows=useMemo(()=>facetRows(sourceCounts,selectedSources),[sourceCounts,selectedSources])
  const gameRows=useMemo(()=>facetRows(gameCounts,selectedGames),[gameCounts,selectedGames])
  const formatRows=useMemo(()=>facetRows(formatCounts,selectedFormats),[formatCounts,selectedFormats])

  const quickDuplicateCounts=useMemo(()=>buildQuickDuplicateCounts(uiResults),[uiResults])
  const duplicateGroups=useMemo(()=>groupDuplicates?buildDuplicateGroups(uiResults):null,[uiResults,groupDuplicates])
  const filteredResults=useMemo(()=>{let items=applyFilters(uiResults);if(groupDuplicates&&duplicateGroups){const best=new Map<string,GlobalSearchResult>();for(const item of items){const key=duplicateGroups.keyById.get(item.id)||item.id,current=best.get(key);if(!current||duplicateRepresentativeScore(item)>duplicateRepresentativeScore(current))best.set(key,item)}items=[...best.values()]}if(sortMode==='Mix de fontes')return mixBySource(items);return [...items].sort((a,b)=>sortMode==='Mais recentes'?(b.year||0)-(a.year||0)||b.score-a.score:sortMode==='Menor preço'?(a.price??Number.MAX_SAFE_INTEGER)-(b.price??Number.MAX_SAFE_INTEGER):sortMode==='Maior preço'?(b.price??-1)-(a.price??-1):sortMode==='Nome A-Z'?a.title.localeCompare(b.title):sortMode==='Fonte'?a.source.localeCompare(b.source)||a.title.localeCompare(b.title):b.score-a.score)},[uiResults,priceMode,kind,vehicleClass,selectedFormats,selectedSources,selectedGames,downloadMode,imageMode,yearFrom,yearTo,sortMode,groupDuplicates,duplicateGroups])

  const pageCount=Math.max(1,Math.ceil(filteredResults.length/PAGE_SIZE))
  const safePage=Math.min(currentPage,pageCount)
  const pagedResults=useMemo(()=>filteredResults.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE),[filteredResults,safePage])
  const pageLinks=useMemo(()=>paginationItems(safePage,pageCount),[safePage,pageCount])
  useEffect(()=>{setCurrentPage(1)},[submittedQuery,priceMode,kind,vehicleClass,selectedFormats,selectedSources,selectedGames,downloadMode,imageMode,yearFrom,yearTo,sortMode,groupDuplicates])
  useEffect(()=>{if(currentPage>pageCount)setCurrentPage(pageCount)},[currentPage,pageCount])

  const activeFilters=[priceMode!=='Todos',kind!=='Todos',vehicleClass!=='Todos',selectedFormats.length>0,selectedSources.length>0,selectedGames.length>0,downloadMode!=='Todos',imageMode!=='Todos',Boolean(yearFrom),Boolean(yearTo),sortMode!=='Mix de fontes',groupDuplicates].filter(Boolean).length
  const clearFilters=()=>{setPriceMode('Todos');setKind('Todos');setVehicleClass('Todos');setSelectedFormats([]);setSelectedSources([]);setSelectedGames([]);setDownloadMode('Todos');setImageMode('Todos');setYearFrom('');setYearTo('');setSortMode('Mix de fontes');setGroupDuplicates(false)}
  const runSearch=(term=query,brand:string|null=null,game:string|null=null)=>{const clean=term.trim();if(clean.length<2)return;setQuery(clean);setSubmittedQuery(clean);setSelectedBrand(brand);setSelectedGames(game?[game]:[]);setSearchFocused(false);const next=[clean,...history.filter(x=>x.toLowerCase()!==clean.toLowerCase())].slice(0,12);setHistory(next);save('vj:history',next);if(brand){const bh=[brand,...brandHistory.filter(x=>x!==brand)].slice(0,8);setBrandHistory(bh);save('vj:brands',bh)}const params=new URLSearchParams();if(brand)params.set('brand',brand);else params.set('q',clean);if(game)params.set('game',game);window.history.pushState({},'',`${window.location.pathname}?${params}`);window.setTimeout(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth'}),30)}
  const openResult=(result:GlobalSearchResult)=>{setSelectedResult(result);const params=new URLSearchParams(window.location.search);if(!params.get('q')&&!params.get('brand'))params.set('q',submittedQuery||result.brand||result.title);params.set('asset',result.sourceUrl);window.history.replaceState({},'',`${window.location.pathname}?${params}`)}
  const closeResult=()=>{setSelectedResult(null);const params=new URLSearchParams(window.location.search);params.delete('asset');window.history.replaceState({},'',`${window.location.pathname}${params.toString()?`?${params}`:''}`)}
  const handleEnrichedResult=(enriched:GlobalSearchResult)=>{setSelectedResult(enriched);setRemoteResults(cur=>cur.map(r=>r.id===enriched.id?{...r,...enriched}:r));setFavorites(cur=>{const next=cur.map(r=>r.id===enriched.id?{...r,...enriched}:r);save('vj:favorites',next);return next})}
  const toggleFavorite=(result:GlobalSearchResult)=>setFavorites(cur=>{const exists=cur.some(r=>r.id===result.id),next=exists?cur.filter(r=>r.id!==result.id):[result,...cur].slice(0,50);save('vj:favorites',next);return next})
  const goToPage=(page:number)=>{setCurrentPage(Math.max(1,Math.min(page,pageCount)));window.setTimeout(()=>document.querySelector('.catalogTopline')?.scrollIntoView({behavior:'smooth',block:'start'}),20)}

  return <main>
    <div className="pageNoise" aria-hidden="true"/>
    <header className="topbar"><a className="brand" href="#"><span className="brandMark">VJ</span><span>3D SEARCH<small>AUTOMOTIVE META INDEX</small></span></a><nav><a href="#search">BUSCAR</a><a href="#brands">MARCAS</a><a href="#games">JOGOS</a><a href="#results">CATÁLOGO</a><a href="#sources">FONTES</a><a className="githubLink" href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GITHUB <ArrowUpRight size={13}/></a></nav><span className="topStatus"><i/> ONLINE · {providers.length} FONTES</span></header>

    <section className="hero" id="search"><div className="heroCode">VJ // AUTOMOTIVE SEARCH SYSTEM <span>01</span></div><div className="eyebrow"><ShieldCheck size={14}/> SOMENTE VEÍCULOS · FREE + PREMIUM</div><h1>ENCONTRE O <em>3D</em><br/><span>QUE ESTÁ FALTANDO.</span></h1><p>Pesquise por modelo, geração, ano, marca ou jogo. Depois combine preço, fonte, formato, jogo, download e outros filtros sem perder suas seleções.</p><div className="searchArea"><div className="searchBox"><span className="searchIndex">01</span><Search size={22}/><input id="vj-search-input" value={query} onFocus={()=>setSearchFocused(true)} onBlur={()=>window.setTimeout(()=>setSearchFocused(false),160)} onChange={e=>{setQuery(e.target.value);setSelectedBrand(null)}} onKeyDown={e=>e.key==='Enter'&&runSearch()} placeholder="Marca, modelo, geração, ano ou jogo..."/><button onClick={()=>runSearch()}>{loading?<LoaderCircle className="spin" size={18}/>:<><span>BUSCAR</span><ArrowUpRight size={16}/></>}</button></div>{searchFocused&&query.trim()&&<div className="searchSuggestions"><span className="suggestionLabel">SUGESTÕES</span>{suggestions.map(term=><button className="suggestionItem" key={term} onMouseDown={()=>runSearch(term)}><span className="suggestionThumb"><CarFront size={17}/></span><span className="suggestionText"><strong>{term}</strong><small>buscar em todas as fontes</small></span><ArrowUpRight size={14}/></button>)}</div>}</div><div className="quickSearches"><span>ACESSO RÁPIDO</span>{['BMW','Porsche','Nissan','Subaru','Supra MK4','E36'].map(term=><button key={term} onClick={()=>runSearch(term,['BMW','Porsche','Nissan','Subaru'].includes(term)?term:null)}>{term}</button>)}</div>{history.length>0&&<div className="historyStrip"><History size={12}/><span>HISTÓRICO</span>{history.slice(0,6).map(item=><button key={item} onClick={()=>runSearch(item)}>{item}</button>)}</div>}<div className="heroMetrics"><span><b>{providers.length}</b> bases</span><span><b>FREE</b> + PREMIUM</span><span><b>{favorites.length}</b> favoritos</span></div></section>

    {!submittedQuery&&<><DiscoveryCarousel onSelect={openResult} onSearch={term=>runSearch(term)}/><BrandsExplorer onSearch={brand=>runSearch(brand,brand)} recent={brandHistory}/><GamesExplorer onSearch={game=>runSearch(game,null,game)}/>{favorites.length>0&&<section className="savedSection"><div className="savedHead"><span><Heart size={13}/> FAVORITOS / LOCAL</span><b>{favorites.length}</b></div><div className="savedRail">{favorites.slice(0,10).map(item=><button key={item.id} onClick={()=>openResult(item)}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<span className="savedFallback"><CarFront size={18}/></span>}<strong>{item.title}</strong><small>{formatPrice(item)} · {item.source}</small></button>)}</div></section>}</>}

    <section className={`resultsShell ${!submittedQuery?'searchIdle':''}`} id="results"><div className="catalogTopline"><div><span>{selectedBrand?`MARCA / ${selectedBrand.toUpperCase()}`:`RESULTADOS / ${submittedQuery.toUpperCase()}`}</span><h2>{selectedBrand?`${selectedBrand.toUpperCase()} / TODOS OS VEÍCULOS`:'CATÁLOGO'}</h2></div><div className="catalogCounters"><strong>{filteredResults.length}</strong><span>{loading?'BUSCANDO · ':''}50 / PÁG. · {rawResults.length} INDEXADOS</span></div><button className="mobileFilterButton" onClick={()=>setFiltersOpen(!filtersOpen)}><Filter size={15}/> FILTROS {activeFilters?`(${activeFilters})`:''}</button></div>
      <section className="vehicleTabs">{vehicleGroups.map((group,index)=>{const count=group.value==='Todos'?applyFilters(rawResults,'vehicle').length:(vehicleCounts.get(group.value)||0);return <button key={group.value} className={vehicleClass===group.value?'active':''} onClick={()=>setVehicleClass(group.value)}><span>{String(index).padStart(2,'0')}</span>{group.label}<b className="facetMiniCount">{count}</b></button>})}</section>
      <div className="content"><aside className={`filtersPanel ${filtersOpen?'open':''}`}><div className="filterTitle"><SlidersHorizontal size={17}/><div><strong>REFINAR BUSCA</strong><small>{activeFilters?`${activeFilters} filtro(s) ativo(s)`:'facetas combináveis'}</small></div><button onClick={()=>setFiltersOpen(false)} className="filterClose"><X size={16}/></button></div>
        <div className="filterSection"><span className="filterSectionTitle">PREÇO</span><div className="segmentedFilter marketSegment">{(['Todos','Grátis','Pago'] as PriceMode[]).map(option=>{const key=option==='Grátis'?'free':option==='Pago'?'paid':'all';const count=option==='Todos'?applyFilters(rawResults,'price').length:(priceCounts.get(key)||0);return <button key={option} className={priceMode===option?'active':''} onClick={()=>setPriceMode(option)}><span>{option}</span><b>{count}</b></button>})}</div></div>
        <div className="filterSection"><span className="filterSectionTitle"><Download size={13}/> DOWNLOAD</span><div className="segmentedFilter">{(['Todos','Direto','Via fonte'] as DownloadMode[]).map(option=><button key={option} className={downloadMode===option?'active':''} onClick={()=>setDownloadMode(option)}>{option}</button>)}</div></div>
        <div className="filterSection"><span className="filterSectionTitle"><Layers3 size={13}/> TIPO</span><div className="segmentedFilter two">{(['Todos','3D Model','Game Mod'] as KindFilter[]).map(option=><button key={option} className={kind===option?'active':''} onClick={()=>setKind(option)}>{option==='3D Model'?'Modelo 3D':option==='Game Mod'?'Game mod':option}</button>)}</div></div>
        <div className="filterSection"><span className="filterSectionTitle">PREVIEW</span><div className="segmentedFilter">{(['Todos','Com imagem','Sem imagem'] as ImageMode[]).map(option=><button key={option} className={imageMode===option?'active':''} onClick={()=>setImageMode(option)}>{option}</button>)}</div></div>
        <div className="filterSection"><span className="filterSectionTitle"><CalendarRange size={13}/> ANO</span><div className="yearFilter"><input type="number" min={yearBounds.min} max={yearBounds.max} value={yearFrom} onChange={e=>setYearFrom(e.target.value)} placeholder={`De ${yearBounds.min}`}/><span>—</span><input type="number" min={yearBounds.min} max={yearBounds.max} value={yearTo} onChange={e=>setYearTo(e.target.value)} placeholder={`Até ${yearBounds.max}`}/></div></div>
        {gameRows.length>0&&<div className="filterSection sourcesFacetSection"><span className="filterSectionTitle"><Gamepad2 size={13}/> JOGOS <small>{selectedGames.length||''}</small></span><div className="sourceFacets gameFacets">{gameRows.map(([name,count])=><button key={name} className={selectedGames.includes(name)?'active':''} onClick={()=>setSelectedGames(cur=>toggleValue(cur,name))}><span className="facetCheck">{selectedGames.includes(name)&&<Check size={11}/>}</span><span className="facetName">{name}</span><b>{count}</b></button>)}</div></div>}
        {formatRows.length>0&&<div className="filterSection"><span className="filterSectionTitle"><FileText size={13}/> FORMATOS <small>{selectedFormats.length||''}</small></span><div className="facetChips">{formatRows.slice(0,20).map(([name,count])=><button key={name} className={selectedFormats.includes(name)?'active':''} onClick={()=>setSelectedFormats(cur=>toggleValue(cur,name))}><span>{name}</span><b>{count}</b></button>)}</div></div>}
        {sourceRows.length>0&&<div className="filterSection sourcesFacetSection"><span className="filterSectionTitle"><Database size={13}/> FONTES <small>{selectedSources.length||''}</small></span><div className="sourceFacets">{sourceRows.map(([name,count])=><button key={name} className={selectedSources.includes(name)?'active':''} onClick={()=>setSelectedSources(cur=>toggleValue(cur,name))}><span className="facetCheck">{selectedSources.includes(name)&&<Check size={11}/>}</span><span className="facetName">{name}</span><b>{count}</b></button>)}</div></div>}
        <div className="filterSection"><span className="filterSectionTitle">DUPLICADOS</span><label className="switchLine"><span><b>Agrupar possíveis duplicados</b><small>Um representante por asset parecido</small></span><input type="checkbox" checked={groupDuplicates} onChange={e=>setGroupDuplicates(e.target.checked)}/></label></div>
        <SelectFilter label="Ordenar resultados" value={sortMode} onChange={value=>setSortMode(value as SortMode)} options={['Mix de fontes','Relevância','Mais recentes','Menor preço','Maior preço','Nome A-Z','Fonte']}/><button className="clearFilters" onClick={clearFilters}><RotateCcw size={13}/> LIMPAR FILTROS</button><div className="automotiveGuard"><ShieldCheck size={16}/><span><strong>AUTOMOTIVE GUARD</strong><small>Filtros usam lógica AND entre categorias e OR dentro da mesma faceta.</small></span></div></aside>

        <div className="results"><div className="resultsToolbar"><div className="activeFilterStrip"><span className="freeChip"><Zap size={12}/> {priceMode==='Todos'?'FREE + PREMIUM':priceMode.toUpperCase()}</span>{downloadMode!=='Todos'&&<span>{downloadMode}</span>}{selectedGames.length>0&&<span>{selectedGames.join(' / ')}</span>}{selectedSources.length>0&&<span>{selectedSources.length} fonte(s)</span>}{selectedFormats.length>0&&<span>{selectedFormats.join(' / ')}</span>}</div><div className="viewTools"><button className={viewMode==='grid'?'active':''} onClick={()=>setViewMode('grid')}><Grid2X2 size={14}/></button><button className={viewMode==='compact'?'active':''} onClick={()=>setViewMode('compact')}><List size={15}/></button><button className={viewMode==='showcase'?'active':''} onClick={()=>setViewMode('showcase')}><Columns3 size={15}/></button><span className="sortReadout"><Gauge size={13}/> {sortMode}</span></div></div>
          {loading&&<div className="globalLoading progressive"><div className="loadingMark"><LoaderCircle className="spin" size={26}/></div><div><strong>BUSCA PROGRESSIVA <b>{searchedSourceCount}/{providers.length}</b></strong><span>{rawResults.length?`${rawResults.length} resultados já encontrados. Novos carros aparecem assim que cada fonte responde.`:'consultando as primeiras fontes…'}</span></div></div>}{apiError&&<div className="apiWarning"><CircleX size={17}/><span>{apiError}</span></div>}
          {filteredResults.length>0&&<div className={`grid view-${viewMode} progressiveResults`}>{pagedResults.map((result,index)=>{const signals=qualitySignals(result),dupKey=duplicateGroups?.keyById.get(result.id),dups=dupKey?(duplicateGroups?.sourceCounts.get(dupKey)||1):(quickDuplicateCounts.get(quickDuplicateKey(result))||1),favored=favorites.some(r=>r.id===result.id),market=marketKind(result);return <article className="card" key={result.id} style={{'--delay':`${Math.min(index,12)*32}ms`} as React.CSSProperties} onClick={()=>openResult(result)} tabIndex={0}><div className="thumb">{result.imageUrl?<img src={result.imageUrl} alt={result.title} loading="lazy"/>:<span className="imageFallback show"><ImageOff size={29}/><small>SEM PREVIEW</small></span>}<span className="thumbShade"/><span className="cardIndex">{String((safePage-1)*PAGE_SIZE+index+1).padStart(2,'0')}</span><span className="vehicleBadge"><CarFront size={11}/>{result.vehicleClass}</span><span className={`priceBadge ${market}`}>{formatPrice(result)}</span>{result.downloadUrl&&<span className="downloadBadge"><Download size={11}/> DIRETO</span>}{dups>1&&<span className="duplicateBadge">{dups} FONTES</span>}<button className={`favoriteButton ${favored?'active':''}`} onClick={e=>{e.stopPropagation();toggleFavorite(result)}}><Heart size={14} fill={favored?'currentColor':'none'}/></button></div><div className="cardBody"><div className="sourceRow"><span>{result.source}</span><span>{result.game||(result.sourceType==='game-mods'?'GAME MOD':'3D ASSET')}</span></div><h3>{result.title}</h3><div className="vehicleIdentity"><span>{result.brand||'Marca não identificada'}</span>{result.year&&<span>{result.year}</span>}</div>{signals.length>0&&<div className="qualitySignals">{signals.map(s=><span key={s}>{s}</span>)}</div>}<div className="chips">{result.formats.length?result.formats.slice(0,5).map(f=><span key={f}>{f}</span>):<span>FORMATO NA FONTE</span>}</div><div className="cardFooter"><span>{result.downloadUrl?'DOWNLOAD DIRETO':'DETALHES / FONTE'}</span><button onClick={e=>{e.stopPropagation();openResult(result)}}>ABRIR <ArrowUpRight size={13}/></button></div></div></article>})}</div>}
          {filteredResults.length>PAGE_SIZE&&<nav className="catalogPagination" aria-label="Paginação do catálogo"><button onClick={()=>goToPage(safePage-1)} disabled={safePage<=1}>‹</button>{pageLinks.map((page,index)=>page==='…'?<span className="ellipsis" key={`ellipsis-${index}`}>…</span>:<button key={page} className={page===safePage?'active':''} onClick={()=>goToPage(page)}>{page}</button>)}<button onClick={()=>goToPage(safePage+1)} disabled={safePage>=pageCount}>›</button><div className="catalogPaginationInfo">PÁGINA {safePage} DE {pageCount} · {Math.min(PAGE_SIZE,Math.max(0,filteredResults.length-(safePage-1)*PAGE_SIZE))} ITENS NESTA PÁGINA · {filteredResults.length} RESULTADOS</div></nav>}
          {!loading&&submittedQuery&&filteredResults.length===0&&<div className="emptyState"><span>FILTER / 00</span><CarFront size={31}/><h3>NENHUM ASSET NESTA COMBINAÇÃO</h3><p>Os filtros são cumulativos. Remova uma faceta ou use “Todos”.</p><button onClick={clearFilters}><RotateCcw size={13}/> limpar filtros</button></div>}
          {sourceStatuses.length>0&&<details className="sourceStatusSection"><summary><Database size={16}/> STATUS DAS FONTES <span>{sourceStatuses.filter(s=>s.status==='ok').length}/{sourceStatuses.length} responderam</span></summary><div className="sourceStatusGrid">{sourceStatuses.map(item=><a key={item.provider} href={item.searchUrl} target="_blank" rel="noreferrer" className={item.status==='ok'?'sourceOk':'sourceError'}>{item.status==='ok'?<CircleCheck size={14}/>:<CircleX size={14}/>}<span><strong>{item.name}</strong><small>{item.status==='ok'?`${item.count} asset(s) · ${item.pagesFetched||1} pág.`:'abrir fonte'}</small></span><ArrowUpRight size={12}/></a>)}</div></details>}
          {(apiError||(!loading&&submittedQuery&&rawResults.length===0))&&<section className="providerSearchSection"><div className="providerSearchHeading"><div><Globe2 size={17}/><strong>BUSCA DIRETA NAS FONTES</strong></div></div><div className="providerSearchGrid">{providers.map(provider=><a key={provider.id} href={providerSearchUrl(provider,submittedQuery)} target="_blank" rel="noreferrer"><span className="providerSearchIcon"><CarFront size={16}/></span><span><strong>{provider.name}</strong><small>{provider.categories.slice(0,2).join(' · ')}</small></span><ArrowUpRight size={14}/></a>)}</div></section>}</div>
      </div>
    </section>

    <section className="sources" id="sources"><div className="sectionHeading"><div><span className="sectionEyebrow">SOURCE MATRIX / 04</span><h2>{providers.length} BASES INDEXADAS.</h2><p>Bibliotecas 3D, marketplaces e comunidades de mods automotivos.</p></div><div className="sourceLegend"><span><i/> FREE + PREMIUM</span><b>{providers.length}</b></div></div><div className="providerGrid">{providers.map((provider,index)=><a key={provider.id} href={provider.searchUrl||provider.url} target="_blank" rel="noreferrer"><span className="providerNumber">{String(index+1).padStart(2,'0')}</span><div className="providerText"><strong>{provider.name}</strong><span>{provider.categories.slice(0,3).join(' · ')}</span></div><ArrowUpRight size={14}/></a>)}</div></section>
    <footer><span>VJ 3D SEARCH</span><small>AUTOMOTIVE META SEARCH · FREE + PREMIUM · / BUSCA · F FILTROS</small></footer>
    {selectedResult&&<ResultDetailView result={selectedResult} onClose={closeResult} onEnriched={handleEnrichedResult}/>} 
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
