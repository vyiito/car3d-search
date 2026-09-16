import React, { useEffect, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  ArrowUpRight, CalendarRange, CarFront, Check, ChevronDown, CircleCheck, CircleX,
  Database, Download, ExternalLink, Eye, FileText, Filter, Gauge, Globe2, HardDrive,
  ImageOff, Layers3, Link2, LoaderCircle, RotateCcw, Search, ShieldCheck, SlidersHorizontal,
  Sparkles, UserRound, X, Zap,
} from 'lucide-react'
import { providers, type Provider } from './data/providers'
import { globalSearch, type GlobalSearchResult, type SourceSearchStatus } from './api/search'
import DiscoveryCarousel from './components/DiscoveryCarousel'
import './styles.css'

type KindFilter = 'Todos' | '3D Model' | 'Game Mod'
type SortMode = 'Relevância' | 'Mais recentes' | 'Nome A-Z' | 'Fonte'
type DownloadMode = 'Todos' | 'Direto' | 'Via fonte'
type ImageMode = 'Todos' | 'Com imagem' | 'Sem imagem'
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

function toggleValue(list: string[], value: string) {
  return list.includes(value) ? list.filter(item => item !== value) : [...list, value]
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
        <button className="modalClose" onClick={onClose} aria-label="Fechar"><X size={18}/></button>
        <div className="modalMedia">
          {result.imageUrl ? <img src={result.imageUrl} alt={result.title}/> : <div className="modalImageFallback"><ImageOff size={38}/><span>Imagem não disponível</span></div>}
          <div className="modalMediaShade"/>
          <span className="modalIndex">VJ / FREE ASSET</span>
          <span className="modalSourceBadge">{result.source}</span>
          <span className="modalPriceBadge free">GRÁTIS</span>
        </div>
        <div className="modalContent">
          <div className="modalKicker"><CarFront size={14}/> {result.vehicleClass} {result.brand ? `· ${result.brand}` : ''}</div>
          <h2>{result.title}</h2>
          {result.description && <p className="modalDescription">{result.description}</p>}
          <div className="modalInfoGrid">
            <div><CarFront size={16}/><span>Categoria</span><strong>{result.vehicleClass}</strong></div>
            <div><UserRound size={16}/><span>Autor</span><strong>{result.author || 'Não informado'}</strong></div>
            <div><HardDrive size={16}/><span>Tamanho</span><strong>{result.fileSize || 'Na fonte'}</strong></div>
            <div><FileText size={16}/><span>Formatos</span><strong>{result.formats.length ? result.formats.join(', ') : 'Na fonte'}</strong></div>
            <div><Link2 size={16}/><span>Fonte</span><strong>{result.source}</strong></div>
            <div><ShieldCheck size={16}/><span>Acesso</span><strong>Gratuito</strong></div>
          </div>
          <div className="modalFormats">
            {result.formats.map(format => <span key={format}>{format}</span>)}
            <span className="downloadableChip">100% GRÁTIS</span>
            {result.downloadUrl && <span className="downloadableChip">DOWNLOAD DIRETO</span>}
          </div>
          <div className="modalActions">
            {result.downloadUrl
              ? <a className="primaryAction" href={result.downloadUrl} target="_blank" rel="noreferrer" download><Download size={17}/> Baixar agora</a>
              : <button className="primaryAction disabled" disabled><Download size={17}/> Download via fonte</button>}
            <a className="secondaryAction" href={result.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={17}/> Abrir página original</a>
          </div>
          <p className="modalNote">O VJ 3D Search indexa apenas assets gratuitos. O arquivo permanece hospedado e sujeito às regras da fonte original.</p>
        </div>
      </section>
    </div>
  )
}

function SelectFilter({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <div className="filterBlock">
      <label>{label}</label>
      <div className="selectWrap">
        <select value={value} onChange={e => onChange(e.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select>
        <ChevronDown size={14}/>
      </div>
    </div>
  )
}

function App() {
  const [query, setQuery] = useState('')
  const [submittedQuery, setSubmittedQuery] = useState('')
  const [kind, setKind] = useState<KindFilter>('Todos')
  const [vehicleClass, setVehicleClass] = useState<VehicleGroup>('Todos')
  const [selectedFormats, setSelectedFormats] = useState<string[]>([])
  const [selectedSources, setSelectedSources] = useState<string[]>([])
  const [downloadMode, setDownloadMode] = useState<DownloadMode>('Todos')
  const [imageMode, setImageMode] = useState<ImageMode>('Todos')
  const [yearFrom, setYearFrom] = useState('')
  const [yearTo, setYearTo] = useState('')
  const [sortMode, setSortMode] = useState<SortMode>('Relevância')
  const [searchFocused, setSearchFocused] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
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

  const rawResults = useMemo(() => remoteResults.filter(result => result.isFree === true), [remoteResults])

  const sourceCounts = useMemo(() => {
    const map = new Map<string, number>()
    rawResults.forEach(result => map.set(result.source, (map.get(result.source) || 0) + 1))
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [rawResults])

  const formatCounts = useMemo(() => {
    const map = new Map<string, number>()
    rawResults.forEach(result => result.formats.forEach(format => map.set(format, (map.get(format) || 0) + 1)))
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [rawResults])

  const yearBounds = useMemo(() => {
    const years = rawResults.map(result => result.year).filter((year): year is number => Boolean(year))
    return years.length ? { min: Math.min(...years), max: Math.max(...years) } : { min: 1950, max: new Date().getFullYear() + 1 }
  }, [rawResults])

  useEffect(() => {
    setSelectedSources(current => current.filter(source => sourceCounts.some(([name]) => name === source)))
    setSelectedFormats(current => current.filter(format => formatCounts.some(([name]) => name === format)))
  }, [sourceCounts, formatCounts])

  const filteredResults = useMemo(() => {
    const from = yearFrom ? Number(yearFrom) : null
    const to = yearTo ? Number(yearTo) : null
    const filtered = rawResults.filter(result => {
      const matchesKind = kind === 'Todos' || (kind === '3D Model' ? result.sourceType === '3d-models' : result.sourceType === 'game-mods')
      const matchesVehicle = vehicleClass === 'Todos' || result.vehicleClass === vehicleClass
      const matchesFormats = !selectedFormats.length || selectedFormats.some(format => result.formats.includes(format))
      const matchesSources = !selectedSources.length || selectedSources.includes(result.source)
      const matchesDownload = downloadMode === 'Todos' || (downloadMode === 'Direto' ? Boolean(result.downloadUrl) : !result.downloadUrl)
      const matchesImage = imageMode === 'Todos' || (imageMode === 'Com imagem' ? Boolean(result.imageUrl) : !result.imageUrl)
      const matchesYear = (!from && !to) || (Boolean(result.year) && (!from || (result.year || 0) >= from) && (!to || (result.year || 9999) <= to))
      return matchesKind && matchesVehicle && matchesFormats && matchesSources && matchesDownload && matchesImage && matchesYear
    })
    return [...filtered].sort((a, b) => {
      if (sortMode === 'Mais recentes') return (b.year || 0) - (a.year || 0) || b.score - a.score
      if (sortMode === 'Nome A-Z') return a.title.localeCompare(b.title)
      if (sortMode === 'Fonte') return a.source.localeCompare(b.source) || a.title.localeCompare(b.title)
      return b.score - a.score
    })
  }, [rawResults, kind, vehicleClass, selectedFormats, selectedSources, downloadMode, imageMode, yearFrom, yearTo, sortMode])

  const activeFilters = [
    kind !== 'Todos', vehicleClass !== 'Todos', selectedFormats.length > 0, selectedSources.length > 0,
    downloadMode !== 'Todos', imageMode !== 'Todos', Boolean(yearFrom), Boolean(yearTo), sortMode !== 'Relevância',
  ].filter(Boolean).length

  const clearFilters = () => {
    setKind('Todos')
    setVehicleClass('Todos')
    setSelectedFormats([])
    setSelectedSources([])
    setDownloadMode('Todos')
    setImageMode('Todos')
    setYearFrom('')
    setYearTo('')
    setSortMode('Relevância')
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
      <div className="pageNoise" aria-hidden="true"/>
      <header className="topbar">
        <a className="brand" href="#"><span className="brandMark">VJ</span><span>3D SEARCH<small>FREE AUTOMOTIVE META INDEX</small></span></a>
        <nav><a href="#search">BUSCAR</a><a href="#results">CATÁLOGO</a><a href="#sources">FONTES</a><a className="githubLink" href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GITHUB <ArrowUpRight size={13}/></a></nav>
        <span className="topStatus"><i/> ONLINE · {providers.length} FONTES</span>
      </header>

      <section className="hero" id="search">
        <div className="heroCode">VJ // AUTOMOTIVE SEARCH SYSTEM <span>01</span></div>
        <div className="eyebrow"><ShieldCheck size={14}/> APENAS VEÍCULOS · APENAS GRÁTIS</div>
        <h1>ENCONTRE O <em>3D</em><br/><span>QUE ESTÁ FALTANDO.</span></h1>
        <p>Um meta-buscador automotivo que varre múltiplas comunidades e bibliotecas, filtra conteúdo pago e organiza tudo em uma interface única.</p>

        <div className="searchArea">
          <div className="searchBox">
            <span className="searchIndex">01</span>
            <Search size={22}/>
            <input value={query} onFocus={() => setSearchFocused(true)} onBlur={() => window.setTimeout(() => setSearchFocused(false), 160)} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runSearch()} placeholder="Marca, modelo, geração ou ano..."/>
            <button onClick={() => runSearch()}>{loading ? <LoaderCircle className="spin" size={18}/> : <><span>BUSCAR</span><ArrowUpRight size={16}/></>}</button>
          </div>
          {searchFocused && query.trim() && <div className="searchSuggestions">
            <span className="suggestionLabel">SUGESTÕES</span>
            {suggestions.map(term => <button className="suggestionItem" key={term} onMouseDown={() => runSearch(term)}><span className="suggestionThumb"><CarFront size={17}/></span><span className="suggestionText"><strong>{term}</strong><small>buscar em todas as fontes</small></span><ArrowUpRight size={14}/></button>)}
            <button className="searchAllSuggestion" onMouseDown={() => runSearch()}><Globe2 size={15}/> BUSCAR “{query}” EM {providers.length} FONTES</button>
          </div>}
        </div>

        <div className="quickSearches"><span>ACESSO RÁPIDO</span>{['Honda City','Supra MK4','BMW E36','911 GT3','Skyline R34'].map(term => <button key={term} onClick={() => runSearch(term)}>{term}</button>)}</div>
        <div className="heroMetrics"><span><b>00</b> resultados pagos</span><span><b>20+</b> bases pesquisadas</span><span><b>100%</b> foco automotivo</span></div>
      </section>

      {!submittedQuery && <DiscoveryCarousel onSelect={setSelectedResult} onSearch={runSearch}/>} 

      <section className={`resultsShell ${!submittedQuery ? 'searchIdle' : ''}`} id="results">
        <div className="catalogTopline">
          <div><span>RESULTADOS / {submittedQuery.toUpperCase()}</span><h2>CATÁLOGO LIVRE</h2></div>
          <div className="catalogCounters"><strong>{filteredResults.length}</strong><span>DE {rawResults.length} EXIBIDOS</span></div>
          <button className="mobileFilterButton" onClick={() => setFiltersOpen(!filtersOpen)}><Filter size={15}/> FILTROS {activeFilters ? `(${activeFilters})` : ''}</button>
        </div>

        <section className="vehicleTabs">
          {vehicleGroups.map((group, index) => <button key={group.value} className={vehicleClass === group.value ? 'active' : ''} onClick={() => setVehicleClass(group.value)}><span>{String(index).padStart(2,'0')}</span>{group.label}</button>)}
        </section>

        <div className="content">
          <aside className={`filtersPanel ${filtersOpen ? 'open' : ''}`}>
            <div className="filterTitle"><SlidersHorizontal size={17}/><div><strong>REFINAR BUSCA</strong><small>{activeFilters ? `${activeFilters} filtro(s) ativo(s)` : 'facetas desta pesquisa'}</small></div><button onClick={() => setFiltersOpen(false)} className="filterClose"><X size={16}/></button></div>

            <div className="filterSection">
              <span className="filterSectionTitle"><Download size={13}/> DOWNLOAD</span>
              <div className="segmentedFilter">
                {(['Todos','Direto','Via fonte'] as DownloadMode[]).map(option => <button key={option} className={downloadMode === option ? 'active' : ''} onClick={() => setDownloadMode(option)}>{option}</button>)}
              </div>
            </div>

            <div className="filterSection">
              <span className="filterSectionTitle"><Layers3 size={13}/> TIPO</span>
              <div className="segmentedFilter two">
                {(['Todos','3D Model','Game Mod'] as KindFilter[]).map(option => <button key={option} className={kind === option ? 'active' : ''} onClick={() => setKind(option)}>{option === '3D Model' ? 'Modelo 3D' : option === 'Game Mod' ? 'Game mod' : option}</button>)}
              </div>
            </div>

            <div className="filterSection">
              <span className="filterSectionTitle"><Eye size={13}/> PREVIEW</span>
              <div className="segmentedFilter">
                {(['Todos','Com imagem','Sem imagem'] as ImageMode[]).map(option => <button key={option} className={imageMode === option ? 'active' : ''} onClick={() => setImageMode(option)}>{option}</button>)}
              </div>
            </div>

            <div className="filterSection">
              <span className="filterSectionTitle"><CalendarRange size={13}/> ANO</span>
              <div className="yearFilter"><input type="number" min={yearBounds.min} max={yearBounds.max} value={yearFrom} onChange={e => setYearFrom(e.target.value)} placeholder={`De ${yearBounds.min}`}/><span>—</span><input type="number" min={yearBounds.min} max={yearBounds.max} value={yearTo} onChange={e => setYearTo(e.target.value)} placeholder={`Até ${yearBounds.max}`}/></div>
            </div>

            {formatCounts.length > 0 && <div className="filterSection">
              <span className="filterSectionTitle"><FileText size={13}/> FORMATOS <small>{selectedFormats.length || ''}</small></span>
              <div className="facetChips">{formatCounts.slice(0,14).map(([name,count]) => <button key={name} className={selectedFormats.includes(name) ? 'active' : ''} onClick={() => setSelectedFormats(current => toggleValue(current,name))}><span>{name}</span><b>{count}</b></button>)}</div>
            </div>}

            {sourceCounts.length > 0 && <div className="filterSection sourcesFacetSection">
              <span className="filterSectionTitle"><Database size={13}/> FONTES NESTA BUSCA <small>{selectedSources.length || ''}</small></span>
              <div className="sourceFacets">{sourceCounts.map(([name,count]) => <button key={name} className={selectedSources.includes(name) ? 'active' : ''} onClick={() => setSelectedSources(current => toggleValue(current,name))}><span className="facetCheck">{selectedSources.includes(name) && <Check size={11}/>}</span><span className="facetName">{name}</span><b>{count}</b></button>)}</div>
            </div>}

            <SelectFilter label="Ordenar resultados" value={sortMode} onChange={value => setSortMode(value as SortMode)} options={['Relevância','Mais recentes','Nome A-Z','Fonte']} />
            <button className="clearFilters" onClick={clearFilters}><RotateCcw size={13}/> LIMPAR FILTROS</button>
            <div className="automotiveGuard"><ShieldCheck size={16}/><span><strong>FREE + AUTOMOTIVE GUARD</strong><small>Pagos, arquitetura e objetos genéricos são removidos antes da exibição.</small></span></div>
          </aside>

          <div className="results">
            <div className="resultsToolbar">
              <div className="activeFilterStrip">
                <span className="freeChip"><Zap size={12}/> FREE ONLY</span>
                {downloadMode !== 'Todos' && <span>{downloadMode === 'Direto' ? 'Download direto' : 'Via fonte'}</span>}
                {selectedSources.length > 0 && <span>{selectedSources.length} fonte(s)</span>}
                {selectedFormats.length > 0 && <span>{selectedFormats.join(' / ')}</span>}
                {(yearFrom || yearTo) && <span>{yearFrom || '—'} → {yearTo || '—'}</span>}
              </div>
              <span className="sortReadout"><Gauge size={13}/> {sortMode}</span>
            </div>

            {loading && <div className="globalLoading"><div className="loadingMark"><LoaderCircle className="spin" size={26}/></div><div><strong>VARRENDO AS BASES</strong><span>classificando veículos, removendo pagos e consolidando resultados...</span></div></div>}
            {apiError && <div className="apiWarning"><CircleX size={17}/><span>{apiError}</span></div>}

            {!loading && filteredResults.length > 0 && <div className="grid">{filteredResults.map((result,index) => <article className="card" key={result.id} style={{'--delay': `${Math.min(index,12) * 32}ms`} as React.CSSProperties} onClick={() => setSelectedResult(result)} tabIndex={0} onKeyDown={event => { if (event.key === 'Enter') setSelectedResult(result) }}>
              <div className="thumb">
                {result.imageUrl ? <img src={result.imageUrl} alt={result.title} loading="lazy" onError={e => { e.currentTarget.style.display='none'; e.currentTarget.nextElementSibling?.classList.add('show') }}/>: null}
                <span className={`imageFallback ${result.imageUrl ? '' : 'show'}`}><ImageOff size={29}/><small>SEM PREVIEW</small></span>
                <span className="thumbShade"/>
                <span className="cardIndex">{String(index + 1).padStart(2,'0')}</span>
                <span className="vehicleBadge"><CarFront size={11}/>{result.vehicleClass}</span>
                <span className="priceBadge free">FREE</span>
                {result.downloadUrl && <span className="downloadBadge"><Download size={11}/> DIRETO</span>}
              </div>
              <div className="cardBody">
                <div className="sourceRow"><span>{result.source}</span><span>{result.sourceType === 'game-mods' ? 'GAME MOD' : '3D ASSET'}</span></div>
                <h3>{result.title}</h3>
                <div className="vehicleIdentity"><span>{result.brand || 'Marca não identificada'}</span>{result.year && <span>{result.year}</span>}</div>
                <div className="chips">{result.formats.length ? result.formats.slice(0,5).map(f => <span key={f}>{f}</span>) : <span>FORMATO NA FONTE</span>}{result.fileSize && <span>{result.fileSize}</span>}</div>
                <div className="cardFooter"><span>{result.downloadUrl ? 'DOWNLOAD DIRETO' : 'DOWNLOAD VIA FONTE'}</span><button onClick={event => { event.stopPropagation(); setSelectedResult(result) }}>DETALHES <ArrowUpRight size={13}/></button></div>
              </div>
            </article>)}</div>}

            {!loading && filteredResults.length === 0 && <div className="emptyState"><span>404 / FILTER</span><CarFront size={31}/><h3>NENHUM ASSET NESTA COMBINAÇÃO</h3><p>Remova uma fonte, formato ou intervalo de ano. O sistema continua restringindo tudo a veículos gratuitos.</p><button onClick={clearFilters}><RotateCcw size={13}/> limpar filtros</button></div>}

            {sourceStatuses.length > 0 && <details className="sourceStatusSection"><summary><Database size={16}/> STATUS DAS FONTES <span>{sourceStatuses.filter(s => s.status === 'ok').length}/{sourceStatuses.length} responderam</span></summary><div className="sourceStatusGrid">{sourceStatuses.map(item => <a key={item.provider} href={item.searchUrl} target="_blank" rel="noreferrer" className={item.status === 'ok' ? 'sourceOk' : 'sourceError'}>{item.status === 'ok' ? <CircleCheck size={14}/> : <CircleX size={14}/>}<span><strong>{item.name}</strong><small>{item.status === 'ok' ? `${item.count} asset(s) · ${item.durationMs}ms` : 'abrir fonte'}</small></span><ArrowUpRight size={12}/></a>)}</div></details>}

            {(apiError || (!loading && rawResults.length === 0)) && <section className="providerSearchSection"><div className="providerSearchHeading"><div><Globe2 size={17}/><strong>BUSCA DIRETA NAS FONTES</strong></div><span>Pesquisa contextualizada como veículo gratuito.</span></div><div className="providerSearchGrid">{providers.map(provider => <a key={provider.id} href={providerSearchUrl(provider, submittedQuery)} target="_blank" rel="noreferrer"><span className="providerSearchIcon"><CarFront size={16}/></span><span><strong>{provider.name}</strong><small>{provider.categories.slice(0,2).join(' · ')}</small></span><ArrowUpRight size={14}/></a>)}</div></section>}
          </div>
        </div>
      </section>

      <section className="sources" id="sources">
        <div className="sectionHeading"><div><span className="sectionEyebrow">SOURCE MATRIX / 02</span><h2>{providers.length} BASES INDEXADAS.</h2><p>Bibliotecas 3D, coleções de game assets e comunidades de mods automotivos.</p></div><div className="sourceLegend"><span><i/> FREE FILTER ACTIVE</span><b>{providers.length}</b></div></div>
        <div className="providerGrid">{providers.map((provider,index) => <a key={provider.id} href={provider.searchUrl || provider.url} target="_blank" rel="noreferrer"><span className="providerNumber">{String(index + 1).padStart(2,'0')}</span><div className="providerText"><strong>{provider.name}</strong><span>{provider.categories.slice(0,3).join(' · ')}</span></div><ArrowUpRight size={14}/></a>)}</div>
      </section>

      <footer><span>VJ 3D SEARCH</span><small>FREE AUTOMOTIVE META SEARCH · BUILT FOR DISCOVERY</small></footer>
      {selectedResult && <ResultModal result={selectedResult} onClose={() => setSelectedResult(null)}/>} 
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
