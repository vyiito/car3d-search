import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Search, SlidersHorizontal, Box, ExternalLink, CarFront, Database, Globe2, ChevronDown } from 'lucide-react'
import { models } from './data/models'
import { providers } from './data/providers'
import './styles.css'

function App() {
  const [query, setQuery] = useState('')
  const [freeOnly, setFreeOnly] = useState(false)
  const [format, setFormat] = useState('Todos')
  const [usage, setUsage] = useState('Todos')

  const formats = ['Todos', ...Array.from(new Set(models.flatMap(m => m.formats))).sort()]

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return models.filter(model => {
      const text = `${model.title} ${model.brand} ${model.vehicle} ${model.source}`.toLowerCase()
      const matchesQuery = !q || text.includes(q)
      const matchesFree = !freeOnly || model.isFree
      const matchesFormat = format === 'Todos' || model.formats.includes(format)
      const matchesUse = usage === 'Todos' || model.use.includes(usage as 'game' | 'print' | 'render')
      return matchesQuery && matchesFree && matchesFormat && matchesUse
    })
  }, [query, freeOnly, format, usage])

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#">
          <span className="brandMark"><CarFront size={22} /></span>
          <span>Car3D<span>Search</span></span>
        </a>
        <nav>
          <a href="#search">Buscar</a>
          <a href="#sources">Fontes</a>
          <a href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>

      <section className="hero" id="search">
        <div className="eyebrow"><Globe2 size={15}/> Um buscador. Várias bibliotecas 3D.</div>
        <h1>Encontre o modelo 3D<br/><span>do veículo que você procura.</span></h1>
        <p>Pesquise carros, motos e outros veículos em múltiplas plataformas, compare formatos e encontre modelos gratuitos ou pagos.</p>

        <div className="searchBox">
          <Search size={23}/>
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Ex: Subaru Forester STI SG9, BMW E36, Lancer Evo IX..." />
          <button onClick={() => document.getElementById('results')?.scrollIntoView({ behavior: 'smooth' })}>Buscar</button>
        </div>

        <div className="quickSearches">
          <span>Populares:</span>
          {['BMW E36', 'Forester SG9', 'Lancer Evo', 'Skyline R34'].map(term => <button key={term} onClick={() => setQuery(term)}>{term}</button>)}
        </div>
      </section>

      <section className="stats">
        <div><strong>{models.length}</strong><span>modelos no MVP</span></div>
        <div><strong>{providers.length}</strong><span>fontes mapeadas</span></div>
        <div><strong>{formats.length - 1}</strong><span>formatos indexados</span></div>
      </section>

      <section className="content" id="results">
        <aside>
          <div className="filterTitle"><SlidersHorizontal size={18}/> Filtros</div>
          <label className="toggleRow"><span>Somente gratuitos</span><input type="checkbox" checked={freeOnly} onChange={e => setFreeOnly(e.target.checked)}/></label>
          <label>Formato</label>
          <div className="selectWrap"><select value={format} onChange={e => setFormat(e.target.value)}>{formats.map(f => <option key={f}>{f}</option>)}</select><ChevronDown size={15}/></div>
          <label>Uso</label>
          <div className="selectWrap"><select value={usage} onChange={e => setUsage(e.target.value)}><option>Todos</option><option value="game">Game Ready</option><option value="print">Impressão 3D</option><option value="render">Render</option></select><ChevronDown size={15}/></div>
        </aside>

        <div className="results">
          <div className="resultsHeader"><div><h2>Modelos encontrados</h2><p>{filtered.length} resultado(s) neste protótipo</p></div></div>
          <div className="grid">
            {filtered.map(model => (
              <article className="card" key={model.id}>
                <div className="thumb"><CarFront size={70}/><span>{model.brand}</span></div>
                <div className="cardBody">
                  <div className="sourceRow"><span>{model.source}</span><span className={model.isFree ? 'price free' : 'price'}>{model.isFree ? 'GRÁTIS' : `$${model.price}`}</span></div>
                  <h3>{model.title}</h3>
                  <div className="meta">{model.year && <span>{model.year}</span>}<span>{model.quality}</span></div>
                  <div className="chips">{model.formats.map(f => <span key={f}>{f}</span>)}</div>
                  <a href={model.sourceUrl} target="_blank" rel="noreferrer">Ver na fonte <ExternalLink size={15}/></a>
                </div>
              </article>
            ))}
          </div>
          {!filtered.length && <div className="empty"><Box size={40}/><h3>Nenhum modelo encontrado</h3><p>Tente outro termo ou remova alguns filtros.</p></div>}
        </div>
      </section>

      <section className="sources" id="sources">
        <div className="sectionHeading"><Database size={21}/><div><h2>Fontes mapeadas</h2><p>A base será construída e validada progressivamente.</p></div></div>
        <div className="providerGrid">
          {providers.map(provider => <a key={provider.id} href={provider.url} target="_blank" rel="noreferrer"><strong>{provider.name}</strong><span>{provider.freeModels ? 'Grátis' : ''}{provider.freeModels && provider.paidModels ? ' + ' : ''}{provider.paidModels ? 'Pago' : ''}</span><small>{provider.status === 'planned' ? 'Integração planejada' : provider.status}</small></a>)}
        </div>
      </section>

      <footer>Car3D Search · MVP inicial · Base construída colaborativamente</footer>
    </main>
  )
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>)
