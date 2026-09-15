import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import {
  Search,
  SlidersHorizontal,
  Box,
  ExternalLink,
  CarFront,
  Database,
  Globe2,
  ChevronDown,
  ImageOff,
  Sparkles,
  Gamepad2,
  Shapes,
  ArrowUpRight,
} from 'lucide-react'
import { models } from './data/models'
import { providers, type Provider } from './data/providers'
import './styles.css'

type KindFilter = 'Todos' | '3D Model' | 'Game Mod'

function providerSearchUrl(provider: Provider, term: string) {
  const clean = term.trim()
  if (!clean) return provider.searchUrl || provider.url

  if (provider.searchUrl?.includes('{query}')) {
    return provider.searchUrl.replace('{query}', encodeURIComponent(clean))
  }

  try {
    const host = new URL(provider.url).hostname.replace(/^www\./, '')
    return `https://www.google.com/search?q=${encodeURIComponent(`site:${host} ${clean}`)}`
  } catch {
    return provider.searchUrl || provider.url
  }
}

function App() {
  const [query, setQuery] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [format, setFormat] = useState('Todos')
  const [usage, setUsage] = useState('Todos')
  const [kind, setKind] = useState<KindFilter>('Todos')
  const [searchFocused, setSearchFocused] = useState(false)

  const formats = ['Todos', ...Array.from(new Set(models.flatMap(m => m.formats))).sort()]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter(model => {
      const text = `${model.title} ${model.brand} ${model.vehicle} ${model.source}`.toLowerCase()
      const matchesQuery = !q || text.includes(q)
      const matchesFree = !freeOnly || model.isFree
      const matchesFormat = format === 'Todos' || model.formats.includes(format)
      const matchesUse = usage === 'Todos' || model.use.includes(usage as 'game' | 'print' | 'render')
      const matchesKind = kind === 'Todos' || model.sourceType === kind
      return matchesQuery && matchesFree && matchesFormat && matchesUse && matchesKind
    })
  }, [query, freeOnly, format, usage, kind])

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return models
      .filter(model => `${model.title} ${model.brand} ${model.vehicle}`.toLowerCase().includes(q))
      .slice(0, 5)
  }, [query])

  const runSearch = () => {
    setSearchFocused(false)
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brandMark"><CarFront size={22} /></span>
          <span>Car3D<span>Search</span></span>
        </a>
        <nav>
          <a href="#search">Buscar</a>
          <a href="#results">Explorar</a>
          <a href="#sources">Fontes</a>
          <a className="githubLink" href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GitHub <ArrowUpRight size={13}/></a>
        </nav>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><Sparkles size={14}/> Metabuscador de veículos 3D</div>
        <h1>Um lugar para encontrar<br/><span>qualquer veículo em 3D.</span></h1>
        <p>Pesquise em bibliotecas de modelos 3D e sites de mods ao mesmo tempo. Compare fontes, formatos, preço e encontre o arquivo ideal para Blender, games ou impressão.</p>

        <div className="searchArea">
          <div className="searchBox">
            <Search size={23}/>
            <input
              value={query}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runSearch()}
              placeholder="Subaru Forester STI SG9, BMW E36, Lancer Evo IX..."
            />
            <button onClick={runSearch}>Buscar</button>
          </div>

          {searchFocused && query.trim() && (
            <div className="searchSuggestions">
              {suggestions.length > 0 ? (
                <>
                  <div className="suggestionLabel">Modelos do protótipo</div>
                  {suggestions.map(model => (
                    <button
                      className="suggestionItem"
                      key={model.id}
                      onMouseDown={() => {
                        setQuery(model.title)
                        setTimeout(runSearch, 10)
                      }}
                    >
                      <span className="suggestionThumb"><img src={model.imageUrl} alt="" /></span>
                      <span className="suggestionText"><strong>{model.title}</strong><small>{model.source} · {model.formats.join(', ')}</small></span>
                      <ArrowUpRight size={15}/>
                    </button>
                  ))}
                </>
              ) : (
                <div className="noLocalSuggestion">
                  <Search size={18}/>
                  <div><strong>Nenhum item local ainda</strong><small>Mas você pode buscar “{query}” nas {providers.length} fontes mapeadas abaixo.</small></div>
                </div>
              )}
              <button className="searchAllSuggestion" onMouseDown={runSearch}><Globe2 size={16}/> Buscar “{query}” nas fontes mapeadas</button>
            </div>
          )}
        </div>

        <div className="quickSearches">
          <span>Buscas rápidas</span>
          {['BMW E36', 'Forester SG9', 'Lancer Evo', 'Skyline R34'].map(term => (
            <button key={term} onClick={() => { setQuery(term); setTimeout(runSearch, 50) }}>{term}</button>
          ))}
        </div>
      </section>

      <section className="stats">
        <div><strong>{providers.length}</strong><span>fontes mapeadas</span></div>
        <div><strong>{providers.filter(p => p.sourceType === '3d-models').length}</strong><span>bibliotecas 3D</span></div>
        <div><strong>{providers.filter(p => p.sourceType === 'game-mods').length}</strong><span>fontes de mods</span></div>
        <div><strong>{formats.length - 1}</strong><span>formatos no protótipo</span></div>
      </section>

      <section className="catalogToolbar">
        <div className="kindTabs">
          {(['Todos', '3D Model', 'Game Mod'] as KindFilter[]).map(item => (
            <button key={item} className={kind === item ? 'active' : ''} onClick={() => setKind(item)}>
              {item === '3D Model' && <Shapes size={15}/>} {item === 'Game Mod' && <Gamepad2 size={15}/>} {item}
            </button>
          ))}
        </div>
        <span className="demoNotice">Protótipo visual + busca nas fontes · indexação automática será conectada no backend</span>
      </section>

      <section className="content" id="results">
        <aside>
          <div className="filterTitle"><SlidersHorizontal size={18}/> Filtros</div>
          <label className="toggleRow"><span>Somente gratuitos</span><input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)}/></label>
          <label>Formato</label>
          <div className="selectWrap"><select value={format} onChange={e => setFormat(e.target.value)}>{formats.map(f => <option key={f}>{f}</option>)}</select><ChevronDown size={15}/></div>
          <label>Uso</label>
          <div className="selectWrap"><select value={usage} onChange={e => setUsage(e.target.value)}><option>Todos</option><option value="game">Game Ready / Mod</option><option value="print">Impressão 3D</option><option value="render">Render</option></select><ChevronDown size={15}/></div>
          <button className="clearFilters" onClick={() => { setFreeOnly(false); setFormat('Todos'); setUsage('Todos'); setKind('Todos'); setQuery('') }}>Limpar filtros</button>
        </aside>

        <div className="results">
          <div className="resultsHeader">
            <div><h2>{query ? `Resultados para “${query}”` : 'Veículos em destaque'}</h2><p>{filtered.length} resultado(s) locais · {query.trim() ? `${providers.length} fontes disponíveis para pesquisar` : 'digite um veículo para pesquisar'}</p></div>
          </div>

          {filtered.length > 0 && (
            <div className="grid">
              {filtered.map(model => (
                <article className="card" key={model.id}>
                  <a className="thumb" href={model.sourceUrl} target="_blank" rel="noreferrer" aria-label={`Abrir ${model.title}`}>
                    <img src={model.imageUrl} alt={model.title} loading="lazy" onError={e => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.add('show') }}/>
                    <span className="imageFallback"><ImageOff size={30}/><small>Imagem indisponível</small></span>
                    <span className="thumbShade" />
                    <span className="typeBadge">{model.sourceType === 'Game Mod' ? <Gamepad2 size={12}/> : <Shapes size={12}/>} {model.sourceType}</span>
                    <span className={model.isFree ? 'priceBadge free' : 'priceBadge'}>{model.isFree ? 'GRÁTIS' : `$${model.price}`}</span>
                    <span className="yearBadge">{model.year}</span>
                  </a>
                  <div className="cardBody">
                    <div className="sourceRow"><span>{model.source}</span><span>{model.quality}</span></div>
                    <h3>{model.title}</h3>
                    <p className="vehicleMeta">{model.brand} · {model.vehicle}</p>
                    <div className="chips">{model.formats.map(f => <span key={f}>{f}</span>)}</div>
                    <div className="cardFooter">
                      <a className="credit" href={model.imageCreditUrl} target="_blank" rel="noreferrer">Imagem: Commons</a>
                      <a className="sourceButton" href={model.sourceUrl} target="_blank" rel="noreferrer">Ver na fonte <ExternalLink size={14}/></a>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {query.trim() && (
            <section className="providerSearchSection">
              <div className="providerSearchHeading">
                <div><Globe2 size={18}/><strong>Pesquisar “{query}” nas fontes</strong></div>
                <span>Abre a busca específica ou uma busca restrita ao site.</span>
              </div>
              <div className="providerSearchGrid">
                {providers.map(provider => (
                  <a key={provider.id} href={providerSearchUrl(provider, query)} target="_blank" rel="noreferrer">
                    <span className="providerSearchIcon">{provider.sourceType === 'game-mods' ? <Gamepad2 size={17}/> : <Shapes size={17}/>}</span>
                    <span><strong>{provider.name}</strong><small>{provider.sourceType === 'game-mods' ? 'Mods de veículos' : 'Modelos 3D'}</small></span>
                    <ArrowUpRight size={16}/>
                  </a>
                ))}
              </div>
            </section>
          )}

          {!filtered.length && !query.trim() && <div className="empty"><Box size={40}/><h3>Nenhum modelo encontrado</h3><p>Tente outro veículo ou remova alguns filtros.</p></div>}
        </div>
      </section>

      <section className="sources" id="sources">
        <div className="sectionHeading">
          <div className="headingIcon"><Database size={20}/></div>
          <div><h2>{providers.length} fontes já mapeadas</h2><p>A base que estamos montando para o motor de busca.</p></div>
        </div>
        <div className="providerGrid">
          {providers.map(provider => (
            <a key={provider.id} href={provider.searchUrl || provider.url} target="_blank" rel="noreferrer">
              <div className="providerIcon">{provider.sourceType === 'game-mods' ? <Gamepad2 size={17}/> : provider.sourceType === '3d-models' ? <Shapes size={17}/> : <Globe2 size={17}/>}</div>
              <div className="providerText"><strong>{provider.name}</strong><span>{provider.categories.slice(0, 3).join(' · ')}</span></div>
              <div className="providerMeta"><b>P{provider.priority}</b><small>{provider.freeModels ? 'FREE' : ''}{provider.paidModels ? ' + PRO' : ''}</small></div>
            </a>
          ))}
        </div>
      </section>

      <footer><span>Car3D Search</span> · construindo um metabuscador de modelos 3D automotivos</footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
