import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Download, ExternalLink, Images, LoaderCircle, Search, X } from 'lucide-react'
import { downloadClassicZip, findClassicCars, getClassicGallery, type ClassicGallery, type ClassicListing, type ClassicSearch } from '../api/classic'
import type { GlobalSearchResult } from '../api/search'
import { classicReaderInstalled } from '../api/classic-reader'
import '../classic-references.css'

type Props = { result: GlobalSearchResult }
const errorText = (error: unknown) => error instanceof Error ? error.message : 'Não foi possível carregar as referências.'

export default function ClassicReferences({ result }: Props) {
  const initial = result.brand && !result.title.toLowerCase().includes(result.brand.toLowerCase()) ? `${result.brand} ${result.title}` : result.title
  const [draft, setDraft] = useState(initial), [term, setTerm] = useState(initial)
  const [search, setSearch] = useState<ClassicSearch | null>(null), [gallery, setGallery] = useState<ClassicGallery | null>(null)
  const [activeListing, setActiveListing] = useState(''), [activePhoto, setActivePhoto] = useState(0)
  const [selected, setSelected] = useState<Set<string>>(new Set()), [loading, setLoading] = useState(false), [galleryLoading, setGalleryLoading] = useState(false)
  const [error, setError] = useState(''), [galleryError, setGalleryError] = useState(''), [zipError, setZipError] = useState(''), [notice, setNotice] = useState(''), [zipping, setZipping] = useState(false)
  const searchAbort = useRef<AbortController | null>(null), galleryAbort = useRef<AbortController | null>(null), zipAbort = useRef<AbortController | null>(null)
  const [directUrl, setDirectUrl] = useState('')
  const [readerReady, setReaderReady] = useState(false), [readerNotice, setReaderNotice] = useState('')

  function cancelZip() { zipAbort.current?.abort(); setZipping(false) }
  async function openGallery(listing: Pick<ClassicListing, 'url'>, query: string) {
    galleryAbort.current?.abort(); cancelZip()
    const controller = new AbortController(); galleryAbort.current = controller
    setActiveListing(listing.url); setGallery(null); setSelected(new Set()); setActivePhoto(0); setGalleryLoading(true); setGalleryError(''); setZipError(''); setNotice('')
    try { const payload = await getClassicGallery(query, listing.url, controller.signal); if (!controller.signal.aborted) setGallery(payload) }
    catch (failure) { if (!controller.signal.aborted) setGalleryError(errorText(failure)) }
    finally { if (!controller.signal.aborted) setGalleryLoading(false) }
  }
  async function runSearch(query: string, page = 1) {
    searchAbort.current?.abort()
    const controller = new AbortController(); searchAbort.current = controller
    if (page === 1) {
      galleryAbort.current?.abort(); cancelZip(); setSearch(null); setGallery(null); setGalleryLoading(false); setActiveListing(''); setSelected(new Set()); setGalleryError(''); setZipError(''); setNotice(''); setTerm(query)
    }
    setLoading(true); setError('')
    try {
      const payload = await findClassicCars(query, page, controller.signal)
      if (controller.signal.aborted) return
      setSearch(previous => page === 1 || !previous ? payload : { ...payload, listings: [...new Map([...previous.listings, ...payload.listings].map(item => [item.id, item])).values()] })
      if (page === 1 && payload.listings[0]) void openGallery(payload.listings[0], query)
    } catch (failure) { if (!controller.signal.aborted) setError(errorText(failure)) }
    finally { if (!controller.signal.aborted) setLoading(false) }
  }
  useEffect(() => {
    setDraft(initial); void runSearch(initial)
    void classicReaderInstalled().then(setReaderReady)
    return () => { searchAbort.current?.abort(); galleryAbort.current?.abort(); zipAbort.current?.abort() }
  }, [result.sourceUrl])
  async function connectReader() {
    const installed = await classicReaderInstalled(); setReaderReady(installed)
    if (installed) { setReaderNotice('Leitor conectado. As páginas públicas serão abertas em abas temporárias no navegador.'); void runSearch(term) }
    else setReaderNotice('Instale o leitor e recarregue o VJ para concluir a conexão.')
  }

  async function download(all: boolean) {
    if (!gallery?.id || zipping) return
    const controller = new AbortController(); zipAbort.current = controller
    setZipping(true); setZipError(''); setNotice('')
    try {
      const blob = await downloadClassicZip(gallery.id, [...selected], all, controller.signal)
      if (controller.signal.aborted) return
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${gallery.title.replace(/[^a-zA-Z0-9-]+/g, '_')}_CLASSIC_referencias.zip`
      document.body.appendChild(anchor); anchor.click(); anchor.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setNotice(`ZIP preparado com ${all ? gallery.images.length : selected.size} foto(s).`)
    } catch (failure) { if (!controller.signal.aborted) setZipError(errorText(failure)) }
    finally { if (!controller.signal.aborted) setZipping(false) }
  }
  const searchUrl = search?.searchUrl || `https://www.classic.com/search/?q=${encodeURIComponent(term)}`
  const current = gallery?.images[activePhoto]
  return <section className="classicPanel" aria-labelledby="classic-heading">
    <div className="classicHeading"><div><span className="assetSectionCode">FOTOS DO VEÍCULO REAL</span><h3 id="classic-heading"><Images size={19}/> Referências · CLASSIC.COM</h3></div><a href={searchUrl} target="_blank" rel="noreferrer">Buscar no site <ExternalLink size={13}/></a></div>
    <details className="classicReader"><summary>{readerReady ? 'Leitor conectado ao navegador' : 'Conectar o CLASSIC.COM pelo navegador'}</summary><p className="classicHelp">Quando o CLASSIC.COM recusa a consulta do servidor, o leitor acessa as páginas públicas pelo seu Chrome ou Edge. Galerias que exigem acesso continuam sujeitas ao login no site original.</p><ol><li><a href={`${import.meta.env.BASE_URL}classic-reader.zip`} download>Baixar VJ CLASSIC Reader.zip</a> e extrair a pasta.</li><li>Abrir <code>chrome://extensions</code> ou <code>edge://extensions</code>, ativar o modo do desenvolvedor e carregar a pasta extraída sem compactação.</li><li>Recarregar o VJ e conectar o leitor.</li></ol><button className="classicSecondary" onClick={() => void connectReader()}>Conectar leitor</button>{readerNotice && <p role="status" className="classicHelp">{readerNotice}</p>}</details>
    <form className="classicSearch" onSubmit={event => { event.preventDefault(); if (draft.trim().length >= 2) void runSearch(draft.trim()) }}>
      <label htmlFor="classic-query">Marca, modelo, geração, versão e ano</label><div><input id="classic-query" value={draft} maxLength={160} onChange={event => setDraft(event.target.value)} placeholder="Ex.: 2023 Ford Bronco DR"/><button disabled={loading || draft.trim().length < 2}><Search size={15}/> Buscar referências</button></div>
    </form>
    {loading && <p className="classicStatus" role="status"><LoaderCircle className="spin" size={16}/> Procurando exemplares no CLASSIC.COM…</p>}
    {error && <p className="classicMessage" role="alert">{error}</p>}
    {search && <p className="classicMessage" role="status">{search.message}{search.retryAt && <span> Nova tentativa após {new Date(search.retryAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.</span>}</p>}
    {search && search.listings.length > 0 && <><p className="classicHelp">Busca: <strong>{search.query}</strong>. As galerias ficam separadas por exemplar.</p><div className="classicListings" aria-label="Exemplares encontrados">{search.listings.map(item => <button key={item.id} type="button" aria-pressed={activeListing === item.url} onClick={() => void openGallery(item, term)}>{item.imageUrl && <img src={item.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer"/>}<span>{item.title}</span></button>)}</div>
      {search.hasMore && search.page < 5 && <button className="classicSecondary" disabled={loading} onClick={() => void runSearch(term, search.page + 1)}>Mais exemplares <ArrowRight size={14}/></button>}{search.limited && <p className="classicHelp">Limite de 5 páginas atingido. Refine a busca ou consulte o site original.</p>}</>}
    <details className="classicDirect"><summary>Já tem o link do exemplar?</summary><form onSubmit={event => { event.preventDefault(); if (directUrl.trim()) { searchAbort.current?.abort(); setLoading(false); void openGallery({ url: directUrl.trim() }, term) } }}><label htmlFor="classic-direct-url">Link do veículo ou lote no CLASSIC.COM</label><div><input id="classic-direct-url" type="url" value={directUrl} onChange={event => setDirectUrl(event.target.value)} placeholder="https://www.classic.com/veh/…" maxLength={2000} required/><button>Carregar galeria</button></div></form></details>
    {galleryLoading && <p className="classicStatus" role="status"><LoaderCircle className="spin" size={16}/> Carregando as fotos do exemplar…</p>}
    {galleryError && <p className="classicMessage" role="alert">{galleryError}</p>}
    {gallery && <div className="classicGallery">
      <div className="classicGalleryTitle"><h4>{gallery.title || 'Galeria do exemplar'}</h4><a href={gallery.sourceUrl} target="_blank" rel="noreferrer">Ver exemplar <ExternalLink size={13}/></a></div><p className="classicHelp">{gallery.message}</p>
      {gallery.limited && <p className="classicMessage">Esta galeria carregou {gallery.images.length} de {gallery.totalAvailable || `mais de ${gallery.maxPhotos}`} fotos publicadas. Consulte o exemplar para ver as demais.</p>}
      {gallery.transport === 'browser' && <p className="classicHelp">Carregada pelo leitor do navegador · {gallery.resolution === 'published-full' ? 'resoluções publicadas na visualização ampliada' : 'resoluções de prévia publicadas'}.</p>}
      {current && <><figure className="classicPreview"><img src={current.url} alt={current.caption} referrerPolicy="no-referrer"/><figcaption><button aria-label="Foto anterior" disabled={activePhoto === 0} onClick={() => setActivePhoto(value => value - 1)}><ArrowLeft size={16}/></button><span>{activePhoto + 1} / {gallery.images.length} · {current.caption}</span><button aria-label="Próxima foto" disabled={activePhoto === gallery.images.length - 1} onClick={() => setActivePhoto(value => value + 1)}><ArrowRight size={16}/></button></figcaption></figure>
        <div className="classicSelection"><label><input type="checkbox" checked={selected.size === gallery.images.length} onChange={event => setSelected(event.target.checked ? new Set(gallery.images.map(image => image.id)) : new Set())}/> Selecionar todas</label><span>{selected.size} selecionada(s)</span></div>
        <div className="classicPhotos" aria-label="Fotos do exemplar">{gallery.images.map((image, index) => <div className="classicPhoto" key={image.id}><button type="button" aria-pressed={index === activePhoto} aria-label={`Ampliar foto ${index + 1}`} onClick={() => setActivePhoto(index)}><img src={image.url} alt={image.caption} loading="lazy" referrerPolicy="no-referrer"/></button><label><input type="checkbox" aria-label={`Selecionar foto ${index + 1}`} checked={selected.has(image.id)} onChange={event => setSelected(previous => { const next = new Set(previous); if (event.target.checked) next.add(image.id); else next.delete(image.id); return next })}/> Foto {index + 1}</label></div>)}</div>
        <div className="classicDownloads"><button disabled={!selected.size || zipping} onClick={() => void download(false)}><Download size={15}/> Baixar selecionadas.zip ({selected.size})</button><button className="classicSecondary" disabled={zipping} onClick={() => void download(true)}><Download size={15}/> Baixar todas.zip ({gallery.images.length})</button>{zipping && <button className="classicSecondary" onClick={cancelZip}><X size={14}/> Cancelar ZIP</button>}</div>
        {zipping && <p className="classicStatus" role="status"><LoaderCircle className="spin" size={15}/> Preparando as fotos e o ZIP…</p>}{notice && <p className="classicStatus" role="status">{notice}</p>}{zipError && <p className="classicMessage" role="alert">{zipError}</p>}
        <p className="classicHelp">Até 64 MB por ZIP. “Todas” inclui as {gallery.images.length} fotos desta galeria carregada. O arquivo inclui os links de origem; os direitos das fotos permanecem com seus titulares.</p>
      </>}
    </div>}
  </section>
}
