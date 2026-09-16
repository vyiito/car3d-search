import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, CalendarRange, CarFront, Check, ChevronDown, CircleCheck, CircleX,
  Columns3, Database, Download, FileText, Filter, Gauge, Globe2, Grid2X2, Heart,
  History, ImageOff, Layers3, List, LoaderCircle, RotateCcw, Search, ShieldCheck,
  SlidersHorizontal, Sparkles, X, Zap,
} from 'lucide-react'
import { providers, type Provider } from './data/providers'
import { globalSearch, type GlobalSearchResult, type SourceSearchStatus } from './api/search'
import DiscoveryCarousel from './components/DiscoveryCarousel'
import ResultDetailView from './components/ResultDetailView'
import BrandsExplorer from './components/BrandsExplorer'
import './styles.css'
import './v2.css'

type KindFilter = 'Todos' | '3D Model' | 'Game Mod'
type SortMode = 'Relevância' | 'Mais recentes' | 'Nome A-Z' | 'Fonte'
type DownloadMode = 'Todos' | 'Direto' | 'Via fonte'
type ImageMode = 'Todos' | 'Com imagem' | 'Sem imagem'
type VehicleGroup = 'Todos' | 'Car' | 'SUV' | 'Race Car' | 'Motorcycle' | 'Truck / Pickup' | 'Van' | 'Bus' | 'Utility / Tractor'
type ViewMode = 'grid' | 'compact' | 'showcase'

const vehicleGroups: { value: VehicleGroup; label: string }[] = [
  { value: 'Todos', label: 'Todos' }, { value: 'Car', label: 'Carros' }, { value: 'SUV', label: 'SUVs' },
  { value: 'Race Car', label: 'Corrida' }, { value: 'Motorcycle', label: 'Motos' },
  { value: 'Truck / Pickup', label: 'Caminhões / Pickups' }, { value: 'Van', label: 'Vans' },
  { value: 'Bus', label: 'Ônibus' }, { value: 'Utility / Tractor', label: 'Utilitários / Tratores' },
]

const searchIdeas = ['Honda City','Toyota Supra MK4','BMW E36','Porsche 911 GT3','Nissan Skyline R34','Subaru Forester STI','Mitsubishi Lancer Evolution','Scania R','Volkswagen Golf GTI','Mercedes AMG GT','Ferrari F40','Mazda RX-7','Honda NSX','Toyota AE86']

function providerSearchUrl(provider: Provider, term: string) {
  const clean = term.trim()
  if (!clean) return provider.searchUrl || provider.url
  if (provider.searchUrl?.includes('{query}')) return provider.searchUrl.replace('{query}', encodeURIComponent(clean))
  try { return `https://www.google.com/search?q=${encodeURIComponent(`site:${new URL(provider.url).hostname.replace(/^www\./,'')} ${clean} car vehicle free download`)}` }
  catch { return provider.searchUrl || provider.url }
}

function toggleValue(list: string[], value: string) { return list.includes(value) ? list.filter(item => item !== value) : [...list, value] }
function safeParse<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || '') as T } catch { return fallback } }
function save(key: string, value: unknown) { try { localStorage.setItem(key, JSON.stringify(value)) } catch {} }
function duplicateKey(result: GlobalSearchResult) { return `${result.brand || ''}|${result.title.toLowerCase().replace(/\b(19|20)\d{2}\b/g,'').replace(/[^a-z0-9]+/g,' ').replace(/\b(3d|model|car|vehicle|free|download)\b/g,'').trim()}` }
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

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="filterBlock"><label>{label}</label><div className="selectWrap"><select value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={14}/></div></div>
}

function CompareView({ items, onClose, onRemove }: { items: GlobalSearchResult[]; onClose: () => void; onRemove: (id:string) => void }) {
  return <div className="compareOverlay"><div className="comparePanel"><header><div><span>COMPARE / VJ</span><h2>COMPARAR ASSETS</h2></div><button onClick={onClose}><X size={17}/></button></header><div className="compareTable"><div className="compareLabels"><b>ASSET</b><span>Fonte</span><span>Categoria</span><span>Ano</span><span>Formatos</span><span>Download</span><span>Sinais</span></div>{items.map(item => <div className="compareColumn" key={item.id}><button className="compareRemove" onClick={() => onRemove(item.id)}><X size={12}/></button><div className="compareAsset">{item.imageUrl ? <img src={item.imageUrl} alt=""/> : <ImageOff size={24}/>}<strong>{item.title}</strong></div><span>{item.source}</span><span>{item.vehicleClass}</span><span>{item.year || '—'}</span><span>{item.formats.slice(0,4).join(', ') || 'Na fonte'}</span><span>{item.downloadUrl ? 'Direto' : 'Via fonte'}</span><span>{qualitySignals(item).join(' · ') || '—'}</span></div>)}</div></div></div>
}

function App() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [kind, setKind] = useState<KindFilter>('Todos')
  const [vehicleClass, setVehicleClass] = useState<VehicleGroup>('Todos')
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('Todos')
  const [imageMode, setImageMode] = useState<ImageMode>('Todos')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('Relevância')
  const [viewMode, setViewMode] = useState<ViewMode>(() => safeParse<ViewMode>('vj:view','grid'))
  const [groupDuplicates, setGroupDuplicates] = useState(false)
  const [searchFocused, setSearchFocused] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [remoteResults, setRemoteResults] = useState<GlobalSearchResult[]>([])
  const [sourceStatuses, setSourceStatuses] = useState<SourceSearchStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<GlobalSearchResult | null>(null)
  const [pendingAssetUrl, setPendingAssetUrl] = useState<string | null>(null)
  const [favorites, setFavorites] = useState<GlobalSearchResult[]>(() => safeParse<GlobalSearchResult[]>('vj:favorites',[]))
  const [history, setHistory] = useState<string[]>(() => safeParse<string[]>('vj:history',[]))
  const [brandHistory, setBrandHistory] = useState<string[]>(() => safeParse<string[]>('vj:brands',[]))
  const [compareIds, setCompareIds] = useState<string[]>([])
  const [compareOpen, setCompareOpen] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const initial = params.get('brand') || params.get('q')
    const brand = params.get('brand')
    const asset = params.get('asset')
    if (initial && initial.length >= 2) { setQuery(initial); setSubmittedQuery(initial); if (brand) setSelectedBrand(brand) }
    if (asset) setPendingAssetUrl(asset)
  }, [])

  useEffect(() => {
    const clean = query.trim()
    if (clean.length < 2) { setSubmittedQuery(''); setRemoteResults([]); setSourceStatuses([]); setApiError(null); return }
    const timer = window.setTimeout(() => setSubmittedQuery(clean), 700)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!submittedQuery) return
    const controller = new AbortController(); setLoading(true); setApiError(null)
    globalSearch(submittedQuery, controller.signal).then(data => { setRemoteResults(data.results.filter(r => r.isFree === true)); setSourceStatuses(data.sources) }).catch(error => { if (error?.name === 'AbortError') return; setRemoteResults([]); setSourceStatuses([]); setApiError(`O agregador não respondeu. As ${providers.length} fontes continuam acessíveis pela busca direta.`) }).finally(() => setLoading(false))
    return () => controller.abort()
  }, [submittedQuery])

  useEffect(() => {
    if (!pendingAssetUrl || !remoteResults.length) return
    const found = remoteResults.find(result => result.sourceUrl === pendingAssetUrl)
    if (found) { setSelectedResult(found); setPendingAssetUrl(null) }
  }, [pendingAssetUrl, remoteResults])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const typing = target && ['INPUT','TEXTAREA','SELECT'].includes(target.tagName)
      if (!typing && event.key === '/') { event.preventDefault(); document.getElementById('vj-search-input')?.focus() }
      if (!typing && event.key.toLowerCase() === 'f' && submittedQuery && !selectedResult) setFiltersOpen(v => !v)
      if (!typing && event.key.toLowerCase() === 'g' && submittedQuery && !selectedResult) setViewMode('grid')
      if (!typing && event.key.toLowerCase() === 'c' && submittedQuery && !selectedResult) setViewMode('compact')
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  }, [submittedQuery, selectedResult])

  useEffect(() => { save('vj:view',viewMode) }, [viewMode])

  const suggestions = useMemo(() => { const q=query.trim().toLowerCase(); return q ? searchIdeas.filter(term => term.toLowerCase().includes(q)).slice(0,5) : [] }, [query])
  const rawResults = useMemo(() => remoteResults.filter(r => r.isFree === true), [remoteResults])
  const sourceCounts = useMemo(() => { const map=new Map<string,number>(); rawResults.forEach(r=>map.set(r.source,(map.get(r.source)||0)+1)); return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])) }, [rawResults])
  const formatCounts = useMemo(() => { const map=new Map<string,number>(); rawResults.forEach(r=>r.formats.forEach(f=>map.set(f,(map.get(f)||0)+1))); return [...map.entries()].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0])) }, [rawResults])
  const duplicateCounts = useMemo(() => { const map=new Map<string,number>(); rawResults.forEach(r=>map.set(duplicateKey(r),(map.get(duplicateKey(r))||0)+1)); return map }, [rawResults])
  const yearBounds = useMemo(() => { const years=rawResults.map(r=>r.year).filter((y):y is number=>Boolean(y)); return years.length ? {min:Math.min(...years),max:Math.max(...years)} : {min:1950,max:new Date().getFullYear()+1} }, [rawResults])

  useEffect(() => { setSelectedSources(cur=>cur.filter(s=>sourceCounts.some(([name])=>name===s))); setSelectedFormats(cur=>cur.filter(f=>formatCounts.some(([name])=>name===f))) }, [sourceCounts,formatCounts])

  const filteredResults = useMemo(() => {
    const from=yearFrom?Number(yearFrom):null, to=yearTo?Number(yearTo):null
    let items=rawResults.filter(result => {
      const matchesKind=kind==='Todos'||(kind==='3D Model'?result.sourceType==='3d-models':result.sourceType==='game-mods')
      const matchesVehicle=vehicleClass==='Todos'||result.vehicleClass===vehicleClass
      const matchesFormats=!selectedFormats.length||selectedFormats.some(f=>result.formats.includes(f))
      const matchesSources=!selectedSources.length||selectedSources.includes(result.source)
      const matchesDownload=downloadMode==='Todos'||(downloadMode==='Direto'?Boolean(result.downloadUrl):!result.downloadUrl)
      const matchesImage=imageMode==='Todos'||(imageMode==='Com imagem'?Boolean(result.imageUrl):!result.imageUrl)
      const matchesYear=(!from&&!to)||(Boolean(result.year)&&(!from||(result.year||0)>=from)&&(!to||(result.year||9999)<=to))
      return matchesKind&&matchesVehicle&&matchesFormats&&matchesSources&&matchesDownload&&matchesImage&&matchesYear
    })
    if (groupDuplicates) { const seen=new Set<string>(); items=items.filter(item=>{const key=duplicateKey(item); if(seen.has(key)) return false; seen.add(key); return true}) }
    return [...items].sort((a,b)=>sortMode==='Mais recentes'?(b.year||0)-(a.year||0)||b.score-a.score:sortMode==='Nome A-Z'?a.title.localeCompare(b.title):sortMode==='Fonte'?a.source.localeCompare(b.source)||a.title.localeCompare(b.title):b.score-a.score)
  }, [rawResults,kind,vehicleClass,selectedFormats,selectedSources,downloadMode,imageMode,yearFrom,yearTo,sortMode,groupDuplicates])

  const compareItems = compareIds.map(id => rawResults.find(r=>r.id===id) || favorites.find(r=>r.id===id)).filter(Boolean) as GlobalSearchResult[]
  const activeFilters=[kind!=='Todos',vehicleClass!=='Todos',selectedFormats.length>0,selectedSources.length>0,downloadMode!=='Todos',imageMode!=='Todos',Boolean(yearFrom),Boolean(yearTo),sortMode!=='Relevância',groupDuplicates].filter(Boolean).length

  const clearFilters=()=>{setKind('Todos');setVehicleClass('Todos');setSelectedFormats([]);setSelectedSources([]);setDownloadMode('Todos');setImageMode('Todos');setYearFrom('');setYearTo('');setSortMode('Relevância');setGroupDuplicates(false)}

  const runSearch=(term=query, brand:string|null=null)=>{
    const clean=term.trim(); if(clean.length<2) return
    setQuery(clean); setSubmittedQuery(clean); setSelectedBrand(brand); setSearchFocused(false)
    const next=[clean,...history.filter(x=>x.toLowerCase()!==clean.toLowerCase())].slice(0,12); setHistory(next); save('vj:history',next)
    if(brand){const bh=[brand,...brandHistory.filter(x=>x!==brand)].slice(0,8);setBrandHistory(bh);save('vj:brands',bh)}
    const params=new URLSearchParams(); if(brand) params.set('brand',brand); else params.set('q',clean); window.history.pushState({},'',`${window.location.pathname}?${params}`)
    window.setTimeout(()=>document.getElementById('results')?.scrollIntoView({behavior:'smooth'}),30)
  }

  const openResult=(result:GlobalSearchResult)=>{ setSelectedResult(result); const params=new URLSearchParams(window.location.search); if(!params.get('q')&&!params.get('brand')) params.set('q',submittedQuery||result.brand||result.title); params.set('asset',result.sourceUrl); window.history.replaceState({},'',`${window.location.pathname}?${params}`) }
  const closeResult=()=>{setSelectedResult(null);const params=new URLSearchParams(window.location.search);params.delete('asset');window.history.replaceState({},'',`${window.location.pathname}${params.toString()?`?${params}`:''}`)}
  const handleEnrichedResult=(enriched:GlobalSearchResult)=>{setSelectedResult(enriched);setRemoteResults(cur=>cur.map(r=>r.id===enriched.id?{...r,...enriched}:r));setFavorites(cur=>{const next=cur.map(r=>r.id===enriched.id?{...r,...enriched}:r);save('vj:favorites',next);return next})}
  const toggleFavorite=(result:GlobalSearchResult)=>{setFavorites(cur=>{const exists=cur.some(r=>r.id===result.id);const next=exists?cur.filter(r=>r.id!==result.id):[result,...cur].slice(0,50);save('vj:favorites',next);return next})}
  const toggleCompare=(id:string)=>setCompareIds(cur=>cur.includes(id)?cur.filter(x=>x!==id):cur.length>=4?cur:[...cur,id])

  return <main>
    <div className="pageNoise" aria-hidden="true"/>
    <header className="topbar"><a className="brand" href="#"><span className="brandMark">VJ</span><span>3D SEARCH<small>FREE AUTOMOTIVE META INDEX</small></span></a><nav><a href="#search">BUSCAR</a><a href="#brands">MARCAS</a><a href="#results">CATÁLOGO</a><a href="#sources">FONTES</a><a className="githubLink" href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GITHUB <ArrowUpRight size={13}/></a></nav><span className="topStatus"><i/> ONLINE · {providers.length} FONTES</span></header>

    <section className="hero" id="search"><div className="heroCode">VJ // AUTOMOTIVE SEARCH SYSTEM <span>01</span></div><div className="eyebrow"><ShieldCheck size={14}/> APENAS VEÍCULOS · APENAS GRÁTIS</div><h1>ENCONTRE O <em>3D</em><br/><span>QUE ESTÁ FALTANDO.</span></h1><p>Pesquise por modelo, geração, ano ou simplesmente por uma marca inteira. O VJ consolida assets gratuitos automotivos em uma única experiência.</p>
      <div className="searchArea"><div className="searchBox"><span className="searchIndex">01</span><Search size={22}/><input id="vj-search-input" value={query} onFocus={()=>setSearchFocused(true)} onBlur={()=>window.setTimeout(()=>setSearchFocused(false),160)} onChange={e=>{setQuery(e.target.value);setSelectedBrand(null)}} onKeyDown={e=>e.key==='Enter'&&runSearch()} placeholder="Marca, modelo, geração ou ano..."/><button onClick={()=>runSearch()}>{loading?<LoaderCircle className="spin" size={18}/>:<><span>BUSCAR</span><ArrowUpRight size={16}/></>}</button></div>{searchFocused&&query.trim()&&<div className="searchSuggestions"><span className="suggestionLabel">SUGESTÕES</span>{suggestions.map(term=><button className="suggestionItem" key={term} onMouseDown={()=>runSearch(term)}><span className="suggestionThumb"><CarFront size={17}/></span><span className="suggestionText"><strong>{term}</strong><small>buscar em todas as fontes</small></span><ArrowUpRight size={14}/></button>)}<button className="searchAllSuggestion" onMouseDown={()=>runSearch()}><Globe2 size={15}/> BUSCAR “{query}” EM {providers.length} FONTES</button></div>}</div>
      <div className="quickSearches"><span>ACESSO RÁPIDO</span>{['BMW','Porsche','Nissan','Subaru','Supra MK4','E36'].map(term=><button key={term} onClick={()=>runSearch(term,['BMW','Porsche','Nissan','Subaru'].includes(term)?term:null)}>{term}</button>)}</div>
      {history.length>0&&<div className="historyStrip"><History size={12}/><span>HISTÓRICO</span>{history.slice(0,6).map(item=><button key={item} onClick={()=>runSearch(item)}>{item}</button>)}</div>}
      <div className="heroMetrics"><span><b>00</b> resultados pagos</span><span><b>{providers.length}</b> bases pesquisadas</span><span><b>{favorites.length}</b> favoritos</span></div></section>

    {!submittedQuery&&<><DiscoveryCarousel onSelect={openResult} onSearch={term=>runSearch(term)}/><BrandsExplorer onSearch={brand=>runSearch(brand,brand)} recent={brandHistory}/>{favorites.length>0&&<section className="savedSection"><div className="savedHead"><span><Heart size={13}/> FAVORITOS / LOCAL</span><b>{favorites.length}</b></div><div className="savedRail">{favorites.slice(0,10).map(item=><button key={item.id} onClick={()=>openResult(item)}>{item.imageUrl?<img src={item.imageUrl} alt=""/>:<span className="savedFallback"><CarFront size={18}/></span>}<strong>{item.title}</strong><small>{item.source}</small></button>)}</div></section>}</>}

    <section className={`resultsShell ${!submittedQuery?'searchIdle':''}`} id="results">
      <div className="catalogTopline"><div><span>{selectedBrand?`MARCA / ${selectedBrand.toUpperCase()}`:`RESULTADOS / ${submittedQuery.toUpperCase()}`}</span><h2>{selectedBrand?`${selectedBrand.toUpperCase()} / TODOS OS VEÍCULOS`:'CATÁLOGO LIVRE'}</h2></div><div className="catalogCounters"><strong>{filteredResults.length}</strong><span>DE {rawResults.length} EXIBIDOS</span></div><button className="mobileFilterButton" onClick={()=>setFiltersOpen(!filtersOpen)}><Filter size={15}/> FILTROS {activeFilters?`(${activeFilters})`:''}</button></div>
      {selectedBrand&&<div className="brandResultBanner"><span className="brandResultGlyph">{selectedBrand.slice(0,2).toUpperCase()}</span><div><small>BRAND INDEX</small><strong>{selectedBrand}</strong><p>{rawResults.length} assets gratuitos encontrados nas fontes que responderam.</p></div><button onClick={()=>{setSelectedBrand(null);runSearch(query)}}>SAIR DA MARCA <X size={13}/></button></div>}
      <section className="vehicleTabs">{vehicleGroups.map((group,index)=><button key={group.value} className={vehicleClass===group.value?'active':''} onClick={()=>setVehicleClass(group.value)}><span>{String(index).padStart(2,'0')}</span>{group.label}</button>)}</section>
      <div className="content"><aside className={`filtersPanel ${filtersOpen?'open':''}`}><div className="filterTitle"><SlidersHorizontal size={17}/><div><strong>REFINAR BUSCA</strong><small>{activeFilters?`${activeFilters} filtro(s) ativo(s)`:'facetas desta pesquisa'}</small></div><button onClick={()=>setFiltersOpen(false)} className="filterClose"><X size={16}/></button></div>
        <div className="filterSection"><span className="filterSectionTitle"><Download size={13}/> DOWNLOAD</span><div className="segmentedFilter">{(['Todos','Direto','Via fonte'] as DownloadMode[]).map(option=><button key={option} className={downloadMode===option?'active':''} onClick={()=>setDownloadMode(option)}>{option}</button>)}</div></div>
        <div className="filterSection"><span className="filterSectionTitle"><Layers3 size={13}/> TIPO</span><div className="segmentedFilter two">{(['Todos','3D Model','Game Mod'] as KindFilter[]).map(option=><button key={option} className={kind===option?'active':''} onClick={()=>setKind(option)}>{option==='3D Model'?'Modelo 3D':option==='Game Mod'?'Game mod':option}</button>)}</div></div>
        <div className="filterSection"><span className="filterSectionTitle">PREVIEW</span><div className="segmentedFilter">{(['Todos','Com imagem','Sem imagem'] as ImageMode[]).map(option=><button key={option} className={imageMode===option?'active':''} onClick={()=>setImageMode(option)}>{option}</button>)}</div></div>
        <div className="filterSection"><span className="filterSectionTitle"><CalendarRange size={13}/> ANO</span><div className="yearFilter"><input type="number" min={yearBounds.min} max={yearBounds.max} value={yearFrom} onChange={e=>setYearFrom(e.target.value)} placeholder={`De ${yearBounds.min}`}/><span>—</span><input type="number" min={yearBounds.min} max={yearBounds.max} value={yearTo} onChange={e=>setYearTo(e.target.value)} placeholder={`Até ${yearBounds.max}`}/></div></div>
        {formatCounts.length>0&&<div className="filterSection"><span className="filterSectionTitle"><FileText size={13}/> FORMATOS <small>{selectedFormats.length||''}</small></span><div className="facetChips">{formatCounts.slice(0,14).map(([name,count])=><button key={name} className={selectedFormats.includes(name)?'active':''} onClick={()=>setSelectedFormats(cur=>toggleValue(cur,name))}><span>{name}</span><b>{count}</b></button>)}</div></div>}
        {sourceCounts.length>0&&<div className="filterSection sourcesFacetSection"><span className="filterSectionTitle"><Database size={13}/> FONTES NESTA BUSCA <small>{selectedSources.length||''}</small></span><div className="sourceFacets">{sourceCounts.map(([name,count])=><button key={name} className={selectedSources.includes(name)?'active':''} onClick={()=>setSelectedSources(cur=>toggleValue(cur,name))}><span className="facetCheck">{selectedSources.includes(name)&&<Check size={11}/>}</span><span className="facetName">{name}</span><b>{count}</b></button>)}</div></div>}
        <div className="filterSection"><span className="filterSectionTitle">DUPLICADOS</span><label className="switchLine"><span><b>Agrupar possíveis duplicados</b><small>Mostra um representante por asset parecido</small></span><input type="checkbox" checked={groupDuplicates} onChange={e=>setGroupDuplicates(e.target.checked)}/></label></div>
        <SelectFilter label="Ordenar resultados" value={sortMode} onChange={value=>setSortMode(value as SortMode)} options={['Relevância','Mais recentes','Nome A-Z','Fonte']}/><button className="clearFilters" onClick={clearFilters}><RotateCcw size={13}/> LIMPAR FILTROS</button><div className="automotiveGuard"><ShieldCheck size={16}/><span><strong>FREE + AUTOMOTIVE GUARD</strong><small>Pagos, arquitetura e objetos genéricos são removidos antes da exibição.</small></span></div></aside>

        <div className="results"><div className="resultsToolbar"><div className="activeFilterStrip"><span className="freeChip"><Zap size={12}/> FREE ONLY</span>{selectedBrand&&<span>Marca: {selectedBrand}</span>}{downloadMode!=='Todos'&&<span>{downloadMode==='Direto'?'Download direto':'Via fonte'}</span>}{selectedSources.length>0&&<span>{selectedSources.length} fonte(s)</span>}{selectedFormats.length>0&&<span>{selectedFormats.join(' / ')}</span>}</div><div className="viewTools"><button className={viewMode==='grid'?'active':''} onClick={()=>setViewMode('grid')} title="Grid (G)"><Grid2X2 size={14}/></button><button className={viewMode==='compact'?'active':''} onClick={()=>setViewMode('compact')} title="Compacto (C)"><List size={15}/></button><button className={viewMode==='showcase'?'active':''} onClick={()=>setViewMode('showcase')} title="Showcase"><Columns3 size={15}/></button><span className="sortReadout"><Gauge size={13}/> {sortMode}</span></div></div>
          {loading&&<div className="globalLoading"><div className="loadingMark"><LoaderCircle className="spin" size={26}/></div><div><strong>VARRENDO AS BASES</strong><span>classificando veículos, removendo pagos e consolidando resultados...</span></div></div>}{apiError&&<div className="apiWarning"><CircleX size={17}/><span>{apiError}</span></div>}
          {!loading&&filteredResults.length>0&&<div className={`grid view-${viewMode}`}>{filteredResults.map((result,index)=>{const signals=qualitySignals(result);const dups=duplicateCounts.get(duplicateKey(result))||1;const favored=favorites.some(r=>r.id===result.id);const compared=compareIds.includes(result.id);return <article className="card" key={result.id} style={{'--delay':`${Math.min(index,12)*32}ms`} as React.CSSProperties} onClick={()=>openResult(result)} tabIndex={0} onKeyDown={e=>e.key==='Enter'&&openResult(result)}><div className="thumb">{result.imageUrl?<img src={result.imageUrl} alt={result.title} loading="lazy" onError={e=>{e.currentTarget.style.display='none';e.currentTarget.nextElementSibling?.classList.add('show')}}/>:null}<span className={`imageFallback ${result.imageUrl?'':'show'}`}><ImageOff size={29}/><small>SEM PREVIEW</small></span><span className="thumbShade"/><span className="cardIndex">{String(index+1).padStart(2,'0')}</span><span className="vehicleBadge"><CarFront size={11}/>{result.vehicleClass}</span><span className="priceBadge free">FREE</span>{result.downloadUrl&&<span className="downloadBadge"><Download size={11}/> DIRETO</span>}{dups>1&&<span className="duplicateBadge">{dups} FONTES</span>}<button className={`favoriteButton ${favored?'active':''}`} onClick={e=>{e.stopPropagation();toggleFavorite(result)}} aria-label="Favoritar"><Heart size={14} fill={favored?'currentColor':'none'}/></button></div><div className="cardBody"><div className="sourceRow"><span>{result.source}</span><span>{result.sourceType==='game-mods'?'GAME MOD':'3D ASSET'}</span></div><h3>{result.title}</h3><div className="vehicleIdentity"><span>{result.brand||'Marca não identificada'}</span>{result.year&&<span>{result.year}</span>}</div>{signals.length>0&&<div className="qualitySignals">{signals.map(s=><span key={s}>{s}</span>)}</div>}<div className="chips">{result.formats.length?result.formats.slice(0,5).map(f=><span key={f}>{f}</span>):<span>FORMATO NA FONTE</span>}{result.fileSize&&<span>{result.fileSize}</span>}</div><div className="cardFooter"><span>{result.downloadUrl?'DOWNLOAD DIRETO':'ABRIR PARA RESOLVER'}</span><div><button className={`compareToggle ${compared?'active':''}`} onClick={e=>{e.stopPropagation();toggleCompare(result.id)}}>{compared?'COMPARANDO':'COMPARAR'}</button><button onClick={e=>{e.stopPropagation();openResult(result)}}>DETALHES <ArrowUpRight size={13}/></button></div></div></div></article>})}</div>}
          {!loading&&filteredResults.length===0&&<div className="emptyState"><span>404 / FILTER</span><CarFront size={31}/><h3>NENHUM ASSET NESTA COMBINAÇÃO</h3><p>Remova uma fonte, formato ou intervalo de ano.</p><button onClick={clearFilters}><RotateCcw size={13}/> limpar filtros</button></div>}
          {sourceStatuses.length>0&&<details className="sourceStatusSection"><summary><Database size={16}/> STATUS DAS FONTES <span>{sourceStatuses.filter(s=>s.status==='ok').length}/{sourceStatuses.length} responderam</span></summary><div className="sourceStatusGrid">{sourceStatuses.map(item=><a key={item.provider} href={item.searchUrl} target="_blank" rel="noreferrer" className={item.status==='ok'?'sourceOk':'sourceError'}>{item.status==='ok'?<CircleCheck size={14}/>:<CircleX size={14}/>}<span><strong>{item.name}</strong><small>{item.status==='ok'?`${item.count} asset(s) · ${item.durationMs}ms`:'abrir fonte'}</small></span><ArrowUpRight size={12}/></a>)}</div></details>}
          {(apiError||(!loading&&rawResults.length===0))&&<section className="providerSearchSection"><div className="providerSearchHeading"><div><Globe2 size={17}/><strong>BUSCA DIRETA NAS FONTES</strong></div><span>Pesquisa contextualizada como veículo gratuito.</span></div><div className="providerSearchGrid">{providers.map(provider=><a key={provider.id} href={providerSearchUrl(provider,submittedQuery)} target="_blank" rel="noreferrer"><span className="providerSearchIcon"><CarFront size={16}/></span><span><strong>{provider.name}</strong><small>{provider.categories.slice(0,2).join(' · ')}</small></span><ArrowUpRight size={14}/></a>)}</div></section>}</div></div></section>

    <section className="sources" id="sources"><div className="sectionHeading"><div><span className="sectionEyebrow">SOURCE MATRIX / 03</span><h2>{providers.length} BASES INDEXADAS.</h2><p>Bibliotecas 3D, coleções de game assets e comunidades de mods automotivos.</p></div><div className="sourceLegend"><span><i/> FREE FILTER ACTIVE</span><b>{providers.length}</b></div></div><div className="providerGrid">{providers.map((provider,index)=><a key={provider.id} href={provider.searchUrl||provider.url} target="_blank" rel="noreferrer"><span className="providerNumber">{String(index+1).padStart(2,'0')}</span><div className="providerText"><strong>{provider.name}</strong><span>{provider.categories.slice(0,3).join(' · ')}</span></div><ArrowUpRight size={14}/></a>)}</div></section>
    <footer><span>VJ 3D SEARCH</span><small>FREE AUTOMOTIVE META SEARCH · / BUSCA · F FILTROS · G GRID · C COMPACT</small></footer>

    {compareIds.length>0&&<div className="compareTray"><span><b>{compareIds.length}</b> selecionado(s)</span><button onClick={()=>setCompareOpen(true)} disabled={compareIds.length<2}>COMPARAR</button><button onClick={()=>setCompareIds([])}><X size={13}/></button></div>}
    {compareOpen&&<CompareView items={compareItems} onClose={()=>setCompareOpen(false)} onRemove={id=>setCompareIds(cur=>cur.filter(x=>x!==id))}/>} 
    {selectedResult&&<ResultDetailView result={selectedResult} onClose={closeResult} onEnriched={handleEnrichedResult}/>} 
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
