import fs from 'node:fs'

function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`)
  return text.replace(before, after)
}

// 1) Backend: let searchAll skip native sources and stream each generic source as it resolves.
{
  const path = 'server/src/search.js'
  let text = fs.readFileSync(path, 'utf8')
  const oldBlock = `export async function searchAll(query, options = {}) {
  const perSource = Math.max(1, Math.min(Number(options.perSource || 40), 80))
  const sources = await Promise.all(providers.map(provider => limiter(() => searchProvider(provider, query, perSource))))
  const results = dedupe(sources.flatMap(source => source.results))
  return {
    query,
    total: results.length,
    providerCount: providers.length,
    searchedProviders: sources.length,
    successfulProviders: sources.filter(x => x.status === 'ok').length,
    automotiveOnly: true,
    results,
    sources: sources.map(({ results: _results, ...source }) => source),
  }
}`
  const newBlock = `export async function searchAll(query, options = {}) {
  const perSource = Math.max(1, Math.min(Number(options.perSource || 40), 80))
  const excluded = new Set(Array.isArray(options.excludeIds) ? options.excludeIds : [])
  const selectedProviders = providers.filter(provider => !excluded.has(provider.id))
  const onSource = typeof options.onSource === 'function' ? options.onSource : null
  const tasks = selectedProviders.map(provider => limiter(async () => {
    const source = await searchProvider(provider, query, perSource)
    if (onSource) {
      try { await onSource(source) } catch {}
    }
    return source
  }))
  const sources = await Promise.all(tasks)
  const results = dedupe(sources.flatMap(source => source.results))
  return {
    query,
    total: results.length,
    providerCount: providers.length,
    searchedProviders: sources.length,
    successfulProviders: sources.filter(x => x.status === 'ok').length,
    automotiveOnly: true,
    results,
    sources: sources.map(({ results: _results, ...source }) => source),
  }
}`
  text = replaceOnce(text, oldBlock, newBlock, 'searchAll progressive hook')
  fs.writeFileSync(path, text)
}

// 2) Backend: register the SSE route.
{
  const path = 'server/src/index.js'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(
    text,
    `import { searchReferencePack, buildReferenceZip } from './reference-adapter.js'`,
    `import { searchReferencePack, buildReferenceZip } from './reference-adapter.js'\nimport { registerProgressiveSearchRoute } from './progressive-route.js'`,
    'index progressive import',
  )
  text = replaceOnce(
    text,
    `app.use(express.json({ limit: '32kb' }))`,
    `app.use(express.json({ limit: '32kb' }))\nregisterProgressiveSearchRoute(app)`,
    'index progressive registration',
  )
  text = text.replace(`referencePacks: true, nativeAdapters`, `referencePacks: true, progressiveSearch: true, nativeAdapters`)
  fs.writeFileSync(path, text)
}

// 3) Frontend: progressive streaming + 50-result pagination.
{
  const path = 'src/main-v3.tsx'
  let text = fs.readFileSync(path, 'utf8')
  text = replaceOnce(
    text,
    `import { globalSearch, type GlobalSearchResult, type SourceSearchStatus } from './api/search'`,
    `import { type GlobalSearchResult, type SourceSearchStatus } from './api/search'\nimport { progressiveSearch } from './api/progressive'`,
    'main progressive import',
  )
  text = replaceOnce(text, `import './market.css'`, `import './market.css'\nimport './progressive.css'`, 'main progressive css')
  text = replaceOnce(
    text,
    `const searchIdeas = ['Honda City','Toyota Supra MK4','BMW E36','Porsche 911 GT3','Nissan Skyline R34','Subaru Forester STI','Mitsubishi Lancer Evolution','2018 Funco Motorsports F9','Scania R','Ferrari F40','Mazda RX-7','Honda NSX']`,
    `const searchIdeas = ['Honda City','Toyota Supra MK4','BMW E36','Porsche 911 GT3','Nissan Skyline R34','Subaru Forester STI','Mitsubishi Lancer Evolution','2018 Funco Motorsports F9','Scania R','Ferrari F40','Mazda RX-7','Honda NSX']\nconst PAGE_SIZE = 50`,
    'page size',
  )
  text = replaceOnce(
    text,
    `function toggleValue(list: string[], value: string) { return list.includes(value) ? list.filter(item => item !== value) : [...list, value] }`,
    `function toggleValue(list: string[], value: string) { return list.includes(value) ? list.filter(item => item !== value) : [...list, value] }\nfunction mergeSearchResults(current: GlobalSearchResult[], incoming: GlobalSearchResult[]) {\n  const map = new Map(current.map(item => [\`\${item.sourceId}|\${item.sourceUrl}\`, item]))\n  for (const item of incoming) {\n    const key = \`\${item.sourceId}|\${item.sourceUrl}\`\n    const previous = map.get(key)\n    if (!previous || item.score >= previous.score) map.set(key, previous ? { ...previous, ...item } : item)\n  }\n  return [...map.values()]\n}\nfunction upsertSourceStatus(current: SourceSearchStatus[], incoming: SourceSearchStatus) {\n  const next = current.filter(item => item.provider !== incoming.provider)\n  return [...next, incoming].sort((a,b) => a.name.localeCompare(b.name))\n}\nfunction paginationItems(current: number, total: number): Array<number | '…'> {\n  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)\n  const values = new Set([1, total, current - 2, current - 1, current, current + 1, current + 2].filter(page => page >= 1 && page <= total))\n  const pages = [...values].sort((a,b) => a - b)\n  const out: Array<number | '…'> = []\n  pages.forEach((page,index) => { if (index && page - pages[index - 1] > 1) out.push('…'); out.push(page) })\n  return out\n}`,
    'main helpers',
  )
  text = replaceOnce(
    text,
    `  const [sourceStatuses,setSourceStatuses]=useState<SourceSearchStatus[]>([])\n  const [loading,setLoading]=useState(false)`,
    `  const [sourceStatuses,setSourceStatuses]=useState<SourceSearchStatus[]>([])\n  const [currentPage,setCurrentPage]=useState(1)\n  const [searchedSourceCount,setSearchedSourceCount]=useState(0)\n  const [loading,setLoading]=useState(false)`,
    'main progressive state',
  )
  const oldEffect = `  useEffect(()=>{if(!submittedQuery)return;const controller=new AbortController();setLoading(true);setApiError(null);globalSearch(submittedQuery,controller.signal).then(data=>{setRemoteResults(data.results);setSourceStatuses(data.sources)}).catch(error=>{if(error?.name==='AbortError')return;setRemoteResults([]);setSourceStatuses([]);setApiError(\`O agregador não respondeu. As \${providers.length} fontes continuam acessíveis pela busca direta.\`)}).finally(()=>setLoading(false));return()=>controller.abort()},[submittedQuery])`
  const newEffect = `  useEffect(()=>{\n    if(!submittedQuery)return\n    const controller=new AbortController()\n    setLoading(true);setApiError(null);setRemoteResults([]);setSourceStatuses([]);setCurrentPage(1);setSearchedSourceCount(0)\n    progressiveSearch(submittedQuery,{\n      onSource:event=>{\n        setRemoteResults(current=>mergeSearchResults(current,event.results))\n        setSourceStatuses(current=>upsertSourceStatus(current,event.source))\n        setSearchedSourceCount(event.completed)\n      },\n      onDone:event=>{setSearchedSourceCount(event.completed);setLoading(false)},\n      onError:message=>setApiError(message),\n    },controller.signal).catch(error=>{\n      if(error?.name==='AbortError')return\n      setApiError(\`O agregador progressivo não respondeu. As \${providers.length} fontes continuam acessíveis pela busca direta.\`)\n    }).finally(()=>{if(!controller.signal.aborted)setLoading(false)})\n    return()=>controller.abort()\n  },[submittedQuery])`
  text = replaceOnce(text, oldEffect, newEffect, 'main progressive effect')

  const activeMarker = `\n\n  const activeFilters=`
  const pagingBlock = `\n\n  const pageCount=Math.max(1,Math.ceil(filteredResults.length/PAGE_SIZE))\n  const safePage=Math.min(currentPage,pageCount)\n  const pagedResults=useMemo(()=>filteredResults.slice((safePage-1)*PAGE_SIZE,safePage*PAGE_SIZE),[filteredResults,safePage])\n  const pageLinks=useMemo(()=>paginationItems(safePage,pageCount),[safePage,pageCount])\n  useEffect(()=>{setCurrentPage(1)},[submittedQuery,priceMode,kind,vehicleClass,selectedFormats,selectedSources,selectedGames,downloadMode,imageMode,yearFrom,yearTo,sortMode,groupDuplicates])\n  useEffect(()=>{if(currentPage>pageCount)setCurrentPage(pageCount)},[currentPage,pageCount])`
  text = replaceOnce(text, activeMarker, `${pagingBlock}${activeMarker}`, 'main paging derivation')

  text = replaceOnce(
    text,
    `  const toggleFavorite=(result:GlobalSearchResult)=>setFavorites(cur=>{const exists=cur.some(r=>r.id===result.id),next=exists?cur.filter(r=>r.id!==result.id):[result,...cur].slice(0,50);save('vj:favorites',next);return next})\n\n  return <main>`,
    `  const toggleFavorite=(result:GlobalSearchResult)=>setFavorites(cur=>{const exists=cur.some(r=>r.id===result.id),next=exists?cur.filter(r=>r.id!==result.id):[result,...cur].slice(0,50);save('vj:favorites',next);return next})\n  const goToPage=(page:number)=>{setCurrentPage(Math.max(1,Math.min(page,pageCount)));window.setTimeout(()=>document.querySelector('.catalogTopline')?.scrollIntoView({behavior:'smooth',block:'start'}),20)}\n\n  return <main>`,
    'main goToPage',
  )

  text = replaceOnce(
    text,
    `<div className="catalogCounters"><strong>{filteredResults.length}</strong><span>DE {rawResults.length} EXIBIDOS</span></div>`,
    `<div className="catalogCounters"><strong>{filteredResults.length}</strong><span>{loading?'BUSCANDO · ':''}50 / PÁG. · {rawResults.length} INDEXADOS</span></div>`,
    'catalog counters',
  )

  text = replaceOnce(
    text,
    `{loading&&<div className="globalLoading"><div className="loadingMark"><LoaderCircle className="spin" size={26}/></div><div><strong>VARRENDO AS BASES</strong><span>percorrendo páginas e consolidando resultados gratuitos e premium...</span></div></div>}`,
    `{loading&&<div className="globalLoading progressive"><div className="loadingMark"><LoaderCircle className="spin" size={26}/></div><div><strong>BUSCA PROGRESSIVA <b>{searchedSourceCount}/{providers.length}</b></strong><span>{rawResults.length?\`\${rawResults.length} resultados já encontrados. Novos carros aparecem assim que cada fonte responde.\`:'consultando as primeiras fontes…'}</span></div></div>}`,
    'progressive loading',
  )

  text = replaceOnce(text, `{!loading&&filteredResults.length>0&&<div className={\`grid view-\${viewMode}\`}>{filteredResults.map((result,index)=>`, `{filteredResults.length>0&&<div className={\`grid view-\${viewMode} progressiveResults\`}>{pagedResults.map((result,index)=>`, 'progressive card grid')
  text = text.replace(`String(index+1).padStart(2,'0')`, `String((safePage-1)*PAGE_SIZE+index+1).padStart(2,'0')`)

  const gridEnd = `})}</div>}\n          {!loading&&submittedQuery&&filteredResults.length===0&&`
  const pagination = `})}</div>}\n          {filteredResults.length>PAGE_SIZE&&<nav className="catalogPagination" aria-label="Paginação do catálogo"><button onClick={()=>goToPage(safePage-1)} disabled={safePage<=1}>‹</button>{pageLinks.map((page,index)=>page==='…'?<span className="ellipsis" key={\`ellipsis-\${index}\`}>…</span>:<button key={page} className={page===safePage?'active':''} onClick={()=>goToPage(page)}>{page}</button>)}<button onClick={()=>goToPage(safePage+1)} disabled={safePage>=pageCount}>›</button><div className="catalogPaginationInfo">PÁGINA {safePage} DE {pageCount} · {Math.min(PAGE_SIZE,Math.max(0,filteredResults.length-(safePage-1)*PAGE_SIZE))} ITENS NESTA PÁGINA · {filteredResults.length} RESULTADOS</div></nav>}\n          {!loading&&submittedQuery&&filteredResults.length===0&&`
  text = replaceOnce(text, gridEnd, pagination, 'pagination UI')

  fs.writeFileSync(path, text)
}

console.log('Progressive search upgrade applied successfully.')
