import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Search, SlidersHorizontal, ExternalLink, CarFront, Database, Globe2, ChevronDown, ImageOff, Sparkles, Gamepad2, Shapes, ArrowUpRight, LoaderCircle, CircleCheck, CircleX } from 'lucide-react'
import { models } from './data/models'
import { providers, type Provider } from './data/providers'
import { globalSearch, type GlobalSearchResult, type SourceSearchStatus } from './api/search'
import './styles.css'

type KindFilter = 'Todos' | '3D Model' | 'Game Mod'

function providerSearchUrl(provider: Provider, term: string) {
  const clean = term.trim()
  if (!clean) return provider.searchUrl || provider.url
  if (provider.searchUrl?.includes('{query}')) return provider.searchUrl.replace('{query}', encodeURIComponent(clean))
  try {
    const host = new URL(provider.url).hostname.replace(/^www\./, '')
    return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} ${clean}`)}`
  } catch {
    return provider.searchUrl || provider.url
  }
}

function App() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [format, setFormat] = useState('Todos')
  const [kind, setKind] = useState<KindFilter>('Todos')
  const [searchFocused, setSearchFocused] = useState(false)
  const [remoteResults, setRemoteResults] = useState<GlobalSearchResult[]>([])
  const [sourceStatuses, setSourceStatuses] = useState<SourceSearchStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  const featured: GlobalSearchResult[] = useMemo(() => models.map(model => ({
    id: model.id,
    title: model.title,
    source: model.source,
    sourceId: model.source.toLowerCase().replace(/\s+/g, '-'),
    sourceType: model.sourceType === 'Game Mod' ? 'game-mods' : '3d-models',
    sourceUrl: model.sourceUrl,
    imageUrl: model.imageUrl,
    formats: model.formats,
    price: model.price,
    isFree: model.isFree,
    downloadable: null,
    author: null,
    score: 0,
  })), [])

  useEffect(() => {
    const clean = query.trim()
    if (clean.length < 2) {
      setSubmittedQuery('')
      setRemoteResults([])
      setSourceStatuses([])
      setApiError(null)
      return
    }
    const timer = window.setTimeout(() => setSubmittedQuery(clean), 650)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!submittedQuery) return
    const controller = new AbortController()
    setLoading(true)
    setApiError(null)
    globalSearch(submittedQuery, controller.signal)
      .then(data => {
        setRemoteResults(data.results)
        setSourceStatuses(data.sources)
      })
      .catch(error => {
        if (error?.name === 'AbortError') return
        setRemoteResults([])
        setSourceStatuses([])
        setApiError('O agregador ainda não está online. As 16 fontes continuam disponíveis abaixo para busca direta.')
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [submittedQuery])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return models.filter(model => `${model.title} ${model.brand} ${model.vehicle}`.toLowerCase().includes(q)).slice(0, 5)
  }, [query])

  const rawResults = submittedQuery ? remoteResults : featured
  const formats = ['Todos', ...Array.from(new Set(rawResults.flatMap(result => result.formats))).sort()]
  const filteredResults = useMemo(() => rawResults.filter(result => {
    const matchesFree = !freeOnly || result.isFree === true
    const matchesFormat = format === 'Todos' || result.formats.includes(format)
    const matchesKind = kind === 'Todos' || (kind === '3D Model' ? result.sourceType === '3d-models' : result.sourceType === 'game-mods')
    return matchesFree && matchesFormat && matchesKind
  }), [rawResults, freeOnly, format, kind])

  const runSearch = (term = query) => {
    const clean = term.trim()
    if (clean.length >= 2) setSubmittedQuery(clean)
    setSearchFocused(false)
    window.setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }), 20)
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span className="brandMark"><CarFront size={22}/></span><span>Car3D<span>Search</span></span></a>
        <nav><a href="#search">Buscar</a><a href="#results">Resultados</a><a href="#sources">Fontes</a><a className="githubLink" href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13}/></a></nav>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><Sparkles size={14}/> Busca simultânea em {providers.length} fontes</div>
        <h1>Pesquise uma vez.<br/><span>Veja resultados de todas as bases.</span></h1>
        <p>O Car3D Search consulta bibliotecas 3D, marketplaces e sites de mods, normaliza os resultados e reúne tudo em uma única lista.</p>
        <div className="searchArea">
          <div className="searchBox">
            <Search size={23}/>
            <input value={query} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 150)} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder="Ex: Toyota Supra MK4, BMW E36, Subaru SG9..."/>
            <button onClick={() => runSearch()}>{loading ? <LoaderCircle className="spin" size={18}/> : 'Buscar'}</button>
          </div>
          {searchFocused && query.trim() && (
            <div className="searchSuggestions">
              {suggestions.map(model => <button className="suggestionItem" key={model.id} onMouseDown={() => { setQuery(model.title); runSearch(model.title) }}><span className="suggestionThumb"><img src={model.imageUrl} alt=""/></span><span className="suggestionText"><strong>{model.title}</strong><small>{model.source}</small></span><ArrowUpRight size={15}/></button>)}
              <button className="searchAllSuggestion" onMouseDown={() => runSearch()}><Globe2 size={16}/> Pesquisar “{query}” em todas as {providers.length} fontes</button>
            </div>
          )}
        </div>
        <div className="quickSearches"><span>Teste agora</span>{['Toyota Supra MK4','BMW E36','Forester SG9','Skyline R34'].map(term => <button key={term} onClick={() => { setQuery(term); runSearch(term) }}>{term}</button>)}</div>
      </section>

      <section className="stats">
        <div><strong>{providers.length}</strong><span>fontes pesquisadas</span></div>
        <div><strong>{providers.filter(p => p.sourceType === '3d-models').length}</strong><span>bibliotecas 3D</span></div>
        <div><strong>{providers.filter(p => p.sourceType === 'game-mods').length}</strong><span>fontes de mods</span></div>
        <div><strong>{submittedQuery ? remoteResults.length : featured.length}</strong><span>{submittedQuery ? 'resultados coletados' : 'destaques'}</span></div>
      </section>

      <section className="catalogToolbar">
        <div className="kindTabs">{(['Todos','3D Model','Game Mod'] as KindFilter[]).map(item => <button key={item} className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>{item === '3D Model' && <Shapes size={15}/>} {item === 'Game Mod' && <Gamepad2 size={15}/>} {item}</button>)}</div>
        <span className="demoNotice">{loading ? `Consultando ${providers.length} fontes em paralelo...` : submittedQuery ? `${remoteResults.length} resultados agregados` : 'Digite um veículo para iniciar a busca global'}</span>
      </section>

      <section className="content" id="results">
        <aside>
          <div className="filterTitle"><SlidersHorizontal size={18}/> Filtros</div>
          <label className="toggleRow"><span>Somente gratuitos</span><input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)}/></label>
          <label>Formato</label>
          <div className="selectWrap"><select value={format} onChange={e => setFormat(e.target.value)}>{formats.map(f => <option key={f}>{f}</option>)}</select><ChevronDown size={15}/></div>
          <button className="clearFilters" onClick={() => { setFreeOnly(false); setFormat('Todos'); setKind('Todos') }}>Limpar filtros</button>
        </aside>

        <div className="results">
          <div className="resultsHeader"><div><h2>{submittedQuery ? `Resultados para “${submittedQuery}”` : 'Veículos em destaque'}</h2><p>{loading ? `Buscando nas ${providers.length} bases...` : `${filteredResults.length} opção(ões) exibida(s)`}</p></div></div>

          {loading && <div className="globalLoading"><LoaderCircle className="spin" size={26}/><strong>Consultando todas as bases</strong><span>Algumas fontes podem responder mais devagar que outras.</span></div>}
          {apiError && <div className="apiWarning"><CircleX size={18}/><span>{apiError}</span></div>}

          {!loading && filteredResults.length > 0 && <div className="grid">{filteredResults.map(result => (
            <article className="card" key={result.id}>
              <a className="thumb" href={result.sourceUrl} target="_blank" rel="noreferrer">
                {result.imageUrl ? <img src={result.imageUrl} alt={result.title} loading="lazy" onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.classList.add('show') }}/>: null}
                <span className={`imageFallback ${result.imageUrl ? '' : 'show'}`}><ImageOff size={30}/><small>Sem thumbnail</small></span><span className="thumbShade"/>
                <span className="typeBadge">{result.sourceType === 'game-mods' ? <Gamepad2 size={12}/> : <Shapes size={12}/>} {result.sourceType === 'game-mods' ? 'GAME MOD' : '3D MODEL'}</span>
                <span className={result.isFree === true ? 'priceBadge free' : 'priceBadge'}>{result.isFree === true ? 'GRÁTIS' : result.price != null ? `$${result.price}` : 'VER FONTE'}</span>
              </a>
              <div className="cardBody"><div className="sourceRow"><span>{result.source}</span>{result.downloadable && <span>DOWNLOAD</span>}</div><h3>{result.title}</h3>{result.author && <p className="vehicleMeta">por {result.author}</p>}<div className="chips">{result.formats.length ? result.formats.map(f => <span key={f}>{f}</span>) : <span>FORMATO NA FONTE</span>}</div><div className="cardFooter"><span className="credit">{result.source}</span><a className="sourceButton" href={result.sourceUrl} target="_blank" rel="noreferrer">Abrir resultado <ExternalLink size={14}/></a></div></div>
            </article>
          ))}</div>}

          {submittedQuery && sourceStatuses.length > 0 && <section className="sourceStatusSection"><div className="providerSearchHeading"><div><Database size={18}/><strong>Status das {sourceStatuses.length} fontes</strong></div><span>Uma fonte pode retornar 0 ou bloquear consultas automatizadas sem afetar as demais.</span></div><div className="sourceStatusGrid">{sourceStatuses.map(source => <a key={source.provider} href={source.searchUrl} target="_blank" rel="noreferrer" className={source.status === 'ok' ? 'sourceOk' : 'sourceError'}>{source.status === 'ok' ? <CircleCheck size={16}/> : <CircleX size={16}/>}<span><strong>{source.name}</strong><small>{source.status === 'ok' ? `${source.count} resultado(s) · ${source.durationMs}ms` : 'Busca direta disponível'}</small></span><ArrowUpRight size={14}/></a>)}</div></section>}

          {submittedQuery && (apiError || (!loading && !remoteResults.length)) && <section className="providerSearchSection"><div className="providerSearchHeading"><div><Globe2 size={18}/><strong>Busca direta nas {providers.length} fontes</strong></div><span>Nenhuma fonte fica escondida.</span></div><div className="providerSearchGrid">{providers.map(provider => <a key={provider.id} href={providerSearchUrl(provider, submittedQuery)} target="_blank" rel="noreferrer"><span className="providerSearchIcon">{provider.sourceType === 'game-mods' ? <Gamepad2 size={17}/> : <Shapes size={17}/>}</span><span><strong>{provider.name}</strong><small>{provider.sourceType === 'game-mods' ? 'Mods de veículos' : 'Modelos 3D'}</small></span><ArrowUpRight size={16}/></a>)}</div></section>}
        </div>
      </section>

      <section className="sources" id="sources"><div className="sectionHeading"><div className="headingIcon"><Database size={20}/></div><div><h2>{providers.length} fontes cadastradas</h2><p>Todas entram no fan-out da busca global.</p></div></div><div className="providerGrid">{providers.map(provider => <a key={provider.id} href={provider.searchUrl || provider.url} target="_blank" rel="noreferrer"><div className="providerIcon">{provider.sourceType === 'game-mods' ? <Gamepad2 size={17}/> : <Shapes size={17}/>}</div><div className="providerText"><strong>{provider.name}</strong><span>{provider.categories.slice(0,3).join(' · ')}</span></div><div className="providerMeta"><b>P{provider.priority}</b><small>{provider.freeModels ? 'FREE' : ''}{provider.paidModels ? ' + PRO' : ''}</small></div></a>)}</div></section>
      <footer><span>Car3D Search</span> · uma busca, todas as bases</footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
