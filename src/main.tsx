import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Search, SlidersHorizontal, ExternalLink, CarFront, Database, Globe2, ChevronDown,
  ImageOff, ArrowUpRight, LoaderCircle, CircleCheck, CircleX, X, Download,
  HardDrive, UserRound, FileText, Link2, ShieldCheck,
} from 'lucide-react'
import { providers, type Provider } from './data/providers'
import { globalSearch, type GlobalSearchResult, type SourceSearchStatus } from './api/search'
import DiscoveryCarousel from './components/DiscoveryCarousel'
import './styles.css'

type KindFilter = 'Todos' | '3D Model' | 'Game Mod'
type SortMode = 'Relevância' | 'Nome A-Z' | 'Fonte'
type VehicleGroup = 'Todos' | 'Car' | 'SUV' | 'Race Car' | 'Motorcycle' | 'Truck / Pickup' | 'Van' | 'Bus' | 'Utility / Tractor'

const vehicleGroups: { value: VehicleGroup; label: string }[] = [
  { value: 'Todos', label: 'Todos' },
  { value: 'Car', label: 'Carros' },
  { value: 'SUV', label: 'SUVs' },
  { value: 'Race Car', label: 'Corrida' },
  { value: 'Motorcycle', label: 'Motos' },
  { value: 'Truck / Pickup', label: 'Caminhões / Pickups' },
  { value: 'Van', label: 'Vans' },
  { value: 'Bus', label: 'Ônibus' },
  { value: 'Utility / Tractor', label: 'Utilitários / Tratores' },
]

const searchIdeas = [
  'Honda City', 'Toyota Supra MK4', 'BMW E36', 'Porsche 911 GT3', 'Nissan Skyline R34',
  'Subaru Forester STI', 'Mitsubishi Lancer Evolution', 'Scania R', 'Volkswagen Golf GTI',
  'Mercedes AMG GT', 'Ferrari F40', 'Mazda RX-7', 'Honda NSX', 'Toyota AE86',
]

function providerSearchUrl(provider: Provider, term: string) {
  const clean = term.trim()
  if (!clean) return provider.searchUrl || provider.url
  if (provider.searchUrl?.includes('{query}')) return provider.searchUrl.replace('{query}', encodeURIComponent(clean))
  try {
    const host = new URL(provider.url).hostname.replace(/^www\./, '')
    return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} ${clean} car vehicle free download`)}`
  } catch {
    return provider.searchUrl || provider.url
  }
}

function ResultModal({ result, onClose }: { result: GlobalSearchResult; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])

  return (
    <div className="modalOverlay" onMouseDown={onClose} role="presentation">
      <section className="resultModal" role="dialog" aria-modal="true" aria-label={result.title} onMouseDown={event => event.stopPropagation()}>
        <button className="modalClose" onClick={onClose} aria-label="Fechar"><X size={19}/></button>
        <div className="modalMedia">
          {result.imageUrl ? <img src={result.imageUrl} alt={result.title}/> : <div className="modalImageFallback"><ImageOff size={38}/><span>Imagem não disponível</span></div>}
          <div className="modalMediaShade"/>
          <span className="modalSourceBadge">{result.source}</span>
          <span className="modalPriceBadge free">GRÁTIS</span>
        </div>
        <div className="modalContent">
          <div className="modalKicker"><CarFront size={14}/> {result.vehicleClass} {result.brand ? `· ${result.brand}` : ''}</div>
          <h2>{result.title}</h2>
          {result.description && <p className="modalDescription">{result.description}</p>}
          <div className="modalInfoGrid">
            <div><CarFront size={16}/><span>Veículo</span><strong>{result.vehicleClass}</strong></div>
            <div><UserRound size={16}/><span>Autor</span><strong>{result.author || 'Não informado'}</strong></div>
            <div><HardDrive size={16}/><span>Tamanho</span><strong>{result.fileSize || 'Na fonte'}</strong></div>
            <div><FileText size={16}/><span>Formatos</span><strong>{result.formats.length ? result.formats.join(', ') : 'Na fonte'}</strong></div>
            <div><Link2 size={16}/><span>Fonte</span><strong>{result.source}</strong></div>
            <div><ShieldCheck size={16}/><span>Acesso</span><strong>Gratuito</strong></div>
          </div>
          <div className="modalFormats">
            {result.formats.map(format => <span key={format}>{format}</span>)}
            <span className="downloadableChip">100% GRÁTIS</span>
            {result.downloadable && <span className="downloadableChip">DOWNLOAD DISPONÍVEL</span>}
          </div>
          <div className="modalActions">
            {result.downloadUrl ? <a className="primaryAction" href={result.downloadUrl} target="_blank" rel="noreferrer" download><Download size={17}/> Baixar arquivo</a> : <button className="primaryAction disabled" disabled><Download size={17}/> Download direto indisponível</button>}
            <a className="secondaryAction" href={result.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={17}/> Ver item original</a>
          </div>
          <p className="modalNote">O VJ 3D Search exibe apenas resultados identificados como gratuitos. Os arquivos continuam hospedados pelas fontes originais.</p>
        </div>
      </section>
    </div>
  )
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <div className="filterBlock"><label>{label}</label><div className="selectWrap"><select value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select><ChevronDown size={15}/></div></div>
}

function App() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('Todos')
  const [vehicleClass, setVehicleClass] = useState<VehicleGroup>('Todos')
  const [format, setFormat] = useState('Todos')
  const [source, setSource] = useState('Todas')
  const [downloadOnly, setDownloadOnly] = useState(false)
  const [imageOnly, setImageOnly] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('Relevância')
  const [searchFocused, setSearchFocused] = useState(false)
  const [remoteResults, setRemoteResults] = useState<GlobalSearchResult[]>([])
  const [sourceStatuses, setSourceStatuses] = useState<SourceSearchStatus[]>([])
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [selectedResult, setSelectedResult] = useState<GlobalSearchResult | null>(null)

  useEffect(() => {
    const clean = query.trim()
    if (clean.length < 2) {
      setSubmittedQuery('')
      setRemoteResults([])
      setSourceStatuses([])
      setApiError(null)
      return
    }
    const timer = window.setTimeout(() => setSubmittedQuery(clean), 700)
    return () => window.clearTimeout(timer)
  }, [query])

  useEffect(() => {
    if (!submittedQuery) return
    const controller = new AbortController()
    setLoading(true)
    setApiError(null)
    globalSearch(submittedQuery, controller.signal)
      .then(data => {
        setRemoteResults(data.results.filter(result => result.isFree === true))
        setSourceStatuses(data.sources)
      })
      .catch(error => {
        if (error?.name === 'AbortError') return
        setRemoteResults([])
        setSourceStatuses([])
        setApiError(`O agregador não respondeu. As ${providers.length} fontes continuam acessíveis pela busca direta.`)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [submittedQuery])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return searchIdeas.filter(term => term.toLowerCase().includes(q)).slice(0, 5)
  }, [query])

  const rawResults = remoteResults.filter(result => result.isFree === true)
  const formats = ['Todos', ...Array.from(new Set(rawResults.flatMap(result => result.formats))).sort()]
  const sources = ['Todas', ...Array.from(new Set(rawResults.map(result => result.source))).sort()]

  const filteredResults = useMemo(() => {
    const filtered = rawResults.filter(result => {
      const matchesKind = kind === 'Todos' || (kind === '3D Model' ? result.sourceType === '3d-models' : result.sourceType === 'game-mods')
      const matchesVehicle = vehicleClass === 'Todos' || result.vehicleClass === vehicleClass
      const matchesFormat = format === 'Todos' || result.formats.includes(format)
      const matchesSource = source === 'Todas' || result.source === source
      const matchesImage = !imageOnly || Boolean(result.imageUrl)
      const matchesDownload = !downloadOnly || Boolean(result.downloadUrl)
      return result.isFree === true && matchesKind && matchesVehicle && matchesFormat && matchesSource && matchesImage && matchesDownload
    })
    return [...filtered].sort((a, b) => {
      if (sortMode === 'Nome A-Z') return a.title.localeCompare(b.title)
      if (sortMode === 'Fonte') return a.source.localeCompare(b.source) || a.title.localeCompare(b.title)
      return b.score - a.score
    })
  }, [rawResults, kind, vehicleClass, format, source, imageOnly, downloadOnly, sortMode])

  const activeFilters = [kind !== 'Todos', vehicleClass !== 'Todos', format !== 'Todos', source !== 'Todas', downloadOnly, imageOnly, sortMode !== 'Relevância'].filter(Boolean).length

  const clearFilters = () => {
    setKind('Todos'); setVehicleClass('Todos'); setFormat('Todos'); setSource('Todas'); setDownloadOnly(false); setImageOnly(false); setSortMode('Relevância')
  }

  const runSearch = (term = query) => {
    const clean = term.trim()
    if (clean.length >= 2) {
      setQuery(clean)
      setSubmittedQuery(clean)
    }
    setSearchFocused(false)
    window.setTimeout(() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' }), 30)
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span className="brandMark"><CarFront size={22}/></span><span><b>VJ</b> 3D Search<small>Free automotive index</small></span></a>
        <nav><a href="#search">Buscar</a><a href="#results">Catálogo</a><a href="#sources">Fontes</a><a className="githubLink" href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13}/></a></nav>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><ShieldCheck size={14}/> 100% veículos · 100% grátis · {providers.length} fontes</div>
        <h1>Modelos 3D automotivos. <span>Sem conteúdo pago.</span></h1>
        <p>Pesquise carros, SUVs, motos, caminhões, ônibus, vans, corrida e utilitários. O VJ 3D Search remove resultados pagos e conteúdos não automotivos antes de exibir o catálogo.</p>
        <div className="searchArea">
          <div className="searchBox">
            <Search size={23}/>
            <input value={query} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder="Procure um veículo grátis — ex: Honda City, BMW E36, Supra MK4..."/>
            <button onClick={() => runSearch()}>{loading ? <LoaderCircle className="spin" size={19}/> : 'Buscar grátis'}</button>
          </div>
          {searchFocused && query.trim() && <div className="searchSuggestions">
            {suggestions.map(term => <button className="suggestionItem" key={term} onMouseDown={() => runSearch(term)}><span className="suggestionThumb hintIcon"><CarFront size={18}/></span><span className="suggestionText"><strong>{term}</strong><small>Pesquisar modelos gratuitos</small></span><ArrowUpRight size={15}/></button>)}
            <button className="searchAllSuggestion" onMouseDown={() => runSearch()}><Globe2 size={16}/> Buscar “{query}” grátis em todas as {providers.length} fontes</button>
          </div>}
        </div>
        <div className="quickSearches"><span>Buscas rápidas</span>{['Honda City','Toyota Supra MK4','BMW E36','Porsche 911 GT3','Scania R'].map(term => <button key={term} onClick={() => runSearch(term)}>{term}</button>)}</div>
      </section>

      {!submittedQuery && <DiscoveryCarousel onSelect={setSelectedResult} onSearch={runSearch}/>} 

      <section className="stats">
        <div><strong>{providers.length}</strong><span>fontes pesquisadas</span></div>
        <div><strong>0</strong><span>resultados pagos</span></div>
        <div><strong>FREE</strong><span>catálogo gratuito</span></div>
        <div><strong>{submittedQuery ? remoteResults.length : 'LIVE'}</strong><span>{submittedQuery ? 'modelos grátis encontrados' : 'vitrine gratuita'}</span></div>
      </section>

      <section className={`vehicleTabs ${!submittedQuery ? 'searchIdle' : ''}`}>
        {vehicleGroups.map(group => <button key={group.value} className={vehicleClass === group.value ? 'active' : ''} onClick={() => setVehicleClass(group.value)}>{group.label}</button>)}
      </section>

      <section className={`content ${!submittedQuery ? 'searchIdle' : ''}`} id="results">
        <aside className="filtersPanel">
          <div className="filterTitle"><SlidersHorizontal size={18}/><div><strong>Filtros</strong><small>{activeFilters ? `${activeFilters} ativo(s)` : 'Refine os resultados'}</small></div></div>
          <SelectFilter label="Tipo de conteúdo" value={kind} onChange={value => setKind(value as KindFilter)} options={['Todos','3D Model','Game Mod']} />
          <SelectFilter label="Formato" value={format} onChange={setFormat} options={formats} />
          <SelectFilter label="Fonte" value={source} onChange={setSource} options={sources} />
          <SelectFilter label="Ordenar" value={sortMode} onChange={value => setSortMode(value as SortMode)} options={['Relevância','Nome A-Z','Fonte']} />
          <label className="toggleRow"><span><strong>Download direto</strong><small>Mostra só arquivos com link direto</small></span><input type="checkbox" checked={downloadOnly} onChange={e => setDownloadOnly(e.target.checked)}/></label>
          <label className="toggleRow"><span><strong>Somente com imagem</strong><small>Oculta cards sem preview</small></span><input type="checkbox" checked={imageOnly} onChange={e => setImageOnly(e.target.checked)}/></label>
          <button className="clearFilters" onClick={clearFilters}>Limpar todos os filtros</button>
          <div className="automotiveGuard"><ShieldCheck size={17}/><span><strong>Filtro duplo ativo</strong><small>Somente veículos gratuitos passam pelo servidor.</small></span></div>
        </aside>

        <div className="results">
          <div className="resultsHeader"><div><span className="sectionEyebrow">CATÁLOGO GRATUITO</span><h2>{`Resultados grátis para “${submittedQuery}”`}</h2><p>{loading ? `Consultando ${providers.length} fontes...` : `${filteredResults.length} de ${rawResults.length} resultado(s) gratuitos exibidos`}</p></div><div className="resultsPill"><ShieldCheck size={15}/> 0 conteúdo pago</div></div>

          {loading && <div className="globalLoading"><LoaderCircle className="spin" size={28}/><div><strong>Buscando veículos gratuitos em todas as bases</strong><span>Coletando, classificando e removendo itens pagos e não automotivos.</span></div></div>}
          {apiError && <div className="apiWarning"><CircleX size={18}/><span>{apiError}</span></div>}

          {!loading && filteredResults.length > 0 && <div className="grid">{filteredResults.map(result => <article className="card" key={result.id} onClick={() => setSelectedResult(result)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') setSelectedResult(result) }}>
            <div className="thumb">
              {result.imageUrl ? <img src={result.imageUrl} alt={result.title} loading="lazy" onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.classList.add('show') }}/>: null}
              <span className={`imageFallback ${result.imageUrl ? '' : 'show'}`}><ImageOff size={30}/><small>Sem preview</small></span><span className="thumbShade"/>
              <span className="vehicleBadge"><CarFront size={12}/>{result.vehicleClass}</span>
              <span className="priceBadge free">GRÁTIS</span>
              {result.downloadUrl && <span className="downloadBadge"><Download size={12}/> DIRETO</span>}
            </div>
            <div className="cardBody">
              <div className="sourceRow"><span>{result.source}</span><span>{result.sourceType === 'game-mods' ? 'GAME MOD' : '3D MODEL'}</span></div>
              <h3>{result.title}</h3>
              <div className="vehicleIdentity"><span>{result.brand || 'Marca não identificada'}</span>{result.year && <span>{result.year}</span>}</div>
              <div className="chips">{result.formats.length ? result.formats.slice(0,5).map(f => <span key={f}>{f}</span>) : <span>FORMATO NA FONTE</span>}{result.fileSize && <span>{result.fileSize}</span>}</div>
              <div className="cardFooter"><span>Grátis · clique para detalhes</span><button onClick={event => { event.stopPropagation(); setSelectedResult(result) }}>Ver detalhes <ArrowUpRight size={14}/></button></div>
            </div>
          </article>)}</div>}

          {!loading && filteredResults.length === 0 && <div className="emptyState"><CarFront size={32}/><h3>Nenhum modelo gratuito encontrado</h3><p>Tente pesquisar com marca + modelo ou remover filtros. Itens pagos são descartados propositalmente.</p></div>}

          {sourceStatuses.length > 0 && <details className="sourceStatusSection"><summary><Database size={17}/> Status das {sourceStatuses.length} fontes <span>{sourceStatuses.filter(s => s.status === 'ok').length} responderam</span></summary><div className="sourceStatusGrid">{sourceStatuses.map(item => <a key={item.provider} href={item.searchUrl} target="_blank" rel="noreferrer" className={item.status === 'ok' ? 'sourceOk' : 'sourceError'}>{item.status === 'ok' ? <CircleCheck size={15}/> : <CircleX size={15}/>}<span><strong>{item.name}</strong><small>{item.status === 'ok' ? `${item.count} gratuito(s) · ${item.durationMs}ms` : 'Abrir busca na fonte'}</small></span><ArrowUpRight size={13}/></a>)}</div></details>}

          {(apiError || (!loading && remoteResults.length === 0)) && <section className="providerSearchSection"><div className="providerSearchHeading"><div><Globe2 size={18}/><strong>Busca direta por opções gratuitas</strong></div><span>O VJ 3D Search só indexa como resultado o que foi identificado como gratuito.</span></div><div className="providerSearchGrid">{providers.map(provider => <a key={provider.id} href={providerSearchUrl(provider, submittedQuery)} target="_blank" rel="noreferrer"><span className="providerSearchIcon"><CarFront size={17}/></span><span><strong>{provider.name}</strong><small>buscar grátis na fonte</small></span><ArrowUpRight size={15}/></a>)}</div></section>}
        </div>
      </section>

      <section className="sources" id="sources"><div className="sectionHeading"><div><span className="sectionEyebrow">FONTES PESQUISADAS</span><h2>{providers.length} bases · resultados exibidos só se forem grátis</h2><p>O agregador pode pesquisar marketplaces e bibliotecas mistas, mas itens pagos nunca entram no catálogo do VJ 3D Search.</p></div></div><div className="providerGrid">{providers.map(provider => <a key={provider.id} href={provider.searchUrl || provider.url} target="_blank" rel="noreferrer"><div className="providerIcon"><CarFront size={17}/></div><div className="providerText"><strong>{provider.name}</strong><span>{provider.categories.slice(0,3).join(' · ')}</span></div><div className="providerMeta"><b>FREE</b><small>FILTER</small></div></a>)}</div></section>
      <footer><span>VJ 3D Search</span><small>Automotive 3D Meta Search · somente veículos gratuitos</small></footer>
      {selectedResult && <ResultModal result={selectedResult} onClose={() => setSelectedResult(null)}/>} 
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
