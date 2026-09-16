import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, ArrowUpRight, CarFront, Download, ImageOff,
  LoaderCircle, Search, Shuffle, Sparkles,
} from 'lucide-react'
import { globalSearch, type GlobalSearchResult } from '../api/search'
import '../discovery.css'

type DiscoveryMode = 'Destaques' | 'Grátis' | 'Download direto' | 'Corrida'

interface DiscoveryCarouselProps {
  onSelect: (result: GlobalSearchResult) => void
  onSearch: (term: string) => void
}

function curateResults(results: GlobalSearchResult[]) {
  const sorted = [...results]
    .filter(result => result.title && result.sourceUrl)
    .sort((a, b) => Number(Boolean(b.imageUrl)) - Number(Boolean(a.imageUrl)) || b.score - a.score)

  const sourceCount = new Map<string, number>()
  const chosen: GlobalSearchResult[] = []

  for (const result of sorted) {
    if (!result.imageUrl) continue
    const count = sourceCount.get(result.sourceId) || 0
    if (count >= 2) continue
    chosen.push(result)
    sourceCount.set(result.sourceId, count + 1)
    if (chosen.length >= 18) break
  }

  if (chosen.length < 10) {
    for (const result of sorted) {
      if (chosen.some(item => item.id === result.id)) continue
      chosen.push(result)
      if (chosen.length >= 18) break
    }
  }

  return chosen
}

export default function DiscoveryCarousel({ onSelect, onSearch }: DiscoveryCarouselProps) {
  const [items, setItems] = useState<GlobalSearchResult[]>([])
  const [mode, setMode] = useState<DiscoveryMode>('Destaques')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const railRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    globalSearch('car', controller.signal, 6)
      .then(data => setItems(curateResults(data.results)))
      .catch(err => {
        if (err?.name !== 'AbortError') setError(true)
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [])

  const visibleItems = useMemo(() => {
    if (mode === 'Grátis') return items.filter(item => item.isFree === true)
    if (mode === 'Download direto') return items.filter(item => Boolean(item.downloadUrl))
    if (mode === 'Corrida') return items.filter(item => item.vehicleClass === 'Race Car' || /race|racing|gt3|rally|drift|formula/i.test(item.title))
    return items
  }, [items, mode])

  const scroll = (direction: -1 | 1) => {
    railRef.current?.scrollBy({ left: direction * Math.min(760, window.innerWidth * 0.72), behavior: 'smooth' })
  }

  const surprise = () => {
    const pool = visibleItems.length ? visibleItems : items
    if (!pool.length) return
    onSelect(pool[Math.floor(Math.random() * pool.length)])
  }

  return (
    <section className="discoverySection" aria-label="Descobrir modelos 3D automotivos">
      <div className="discoveryHead">
        <div>
          <span className="discoveryEyebrow"><Sparkles size={13}/> DESCOBERTA AO VIVO</span>
          <h2>Encontre algo que você nem estava procurando.</h2>
          <p>Uma seleção dinâmica de veículos reais encontrados nas bases do VJ 3D Search. Nada aqui é modelo de teste.</p>
        </div>
        <div className="discoveryActions">
          <button className="surpriseButton" onClick={surprise} disabled={!items.length}><Shuffle size={15}/> Surpreenda-me</button>
          <button className="railButton" onClick={() => scroll(-1)} aria-label="Anterior"><ArrowLeft size={17}/></button>
          <button className="railButton" onClick={() => scroll(1)} aria-label="Próximo"><ArrowRight size={17}/></button>
        </div>
      </div>

      <div className="discoveryModes">
        {(['Destaques', 'Grátis', 'Download direto', 'Corrida'] as DiscoveryMode[]).map(item => (
          <button key={item} className={mode === item ? 'active' : ''} onClick={() => setMode(item)}>{item}</button>
        ))}
        <span className="liveIndicator"><i/> resultados reais do agregador</span>
      </div>

      {loading && (
        <div className="discoveryLoading">
          <LoaderCircle className="spin" size={24}/>
          <div><strong>Montando sua vitrine automotiva</strong><span>Buscando previews reais nas fontes indexadas...</span></div>
        </div>
      )}

      {!loading && error && (
        <div className="discoveryError">
          <CarFront size={23}/><div><strong>A vitrine dinâmica não carregou agora.</strong><span>A busca principal continua funcionando normalmente.</span></div>
        </div>
      )}

      {!loading && !error && visibleItems.length === 0 && (
        <div className="discoveryError">
          <CarFront size={23}/><div><strong>Nenhum item nesta seleção.</strong><span>Troque o filtro acima para ver outros veículos.</span></div>
        </div>
      )}

      {!loading && visibleItems.length > 0 && (
        <div className="discoveryRail" ref={railRef}>
          {visibleItems.map((result, index) => (
            <article className="discoveryCard" key={result.id} onClick={() => onSelect(result)} tabIndex={0} onKeyDown={event => event.key === 'Enter' && onSelect(result)}>
              <div className="discoveryImage">
                {result.imageUrl
                  ? <img src={result.imageUrl} alt={result.title} loading="lazy"/>
                  : <div className="discoveryFallback"><ImageOff size={28}/></div>}
                <div className="discoveryShade"/>
                <span className="discoveryIndex">{String(index + 1).padStart(2, '0')}</span>
                <span className="discoveryType"><CarFront size={11}/>{result.vehicleClass}</span>
                <span className={result.isFree === true ? 'discoveryPrice free' : 'discoveryPrice'}>
                  {result.isFree === true ? 'GRÁTIS' : result.price != null ? `$${result.price}` : result.source}
                </span>
                {result.downloadUrl && <span className="discoveryDownload"><Download size={11}/> DOWNLOAD</span>}
              </div>
              <div className="discoveryBody">
                <div className="discoverySource"><span>{result.source}</span><span>{result.sourceType === 'game-mods' ? 'MOD' : '3D'}</span></div>
                <h3>{result.title}</h3>
                <p>{[result.brand, result.year, result.formats[0]].filter(Boolean).join(' · ') || 'Informações disponíveis na fonte'}</p>
                <div className="discoveryFooter">
                  <button onClick={event => { event.stopPropagation(); onSearch(result.title) }}><Search size={13}/> Buscar similares</button>
                  <span>Detalhes <ArrowUpRight size={13}/></span>
                </div>
              </div>
            </article>
          ))}
          <button className="discoverMoreCard" onClick={() => onSearch('car')}>
            <span><Search size={24}/></span>
            <strong>Explorar o catálogo</strong>
            <small>Veja ainda mais veículos encontrados nas bases.</small>
            <b>Pesquisar agora <ArrowUpRight size={14}/></b>
          </button>
        </div>
      )}
    </section>
  )
}
