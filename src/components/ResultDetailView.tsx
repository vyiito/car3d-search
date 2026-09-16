import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft, ArrowUpRight, Calendar, CarFront, Check, Clipboard, Database,
  Download, ExternalLink, FileText, Gamepad2, HardDrive, ImageOff, Images, Link2,
  LoaderCircle, ShieldCheck, UserRound, X,
} from 'lucide-react'
import { getResultDetails, vjDirectDownloadUrl, type GlobalSearchResult } from '../api/search'
import '../detail.css'

interface Props {
  result: GlobalSearchResult
  onClose: () => void
  onEnriched?: (result: GlobalSearchResult) => void
}

export default function ResultDetailView({ result, onClose, onEnriched }: Props) {
  const [detail, setDetail] = useState(result)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [activeImage, setActiveImage] = useState(0)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    setDetail(result)
    setActiveImage(0)
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    getResultDetails(result, controller.signal)
      .then(enriched => { setDetail(enriched); onEnriched?.(enriched) })
      .catch(err => { if (err?.name !== 'AbortError') setError(true) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [result.id])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = previous; document.removeEventListener('keydown', onKey) }
  }, [onClose])

  const gallery = useMemo(() => {
    const images = detail.gallery?.length ? detail.gallery : detail.imageUrl ? [detail.imageUrl] : []
    return [...new Set(images.filter(Boolean))]
  }, [detail.gallery, detail.imageUrl])

  const confirmedDownloadHref = vjDirectDownloadUrl(detail)

  const copyShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {}
  }

  return (
    <div className="assetDetail" role="dialog" aria-modal="true" aria-label={detail.title}>
      <header className="assetDetailTopbar">
        <button onClick={onClose} className="assetBack"><ArrowLeft size={16}/> VOLTAR AO CATÁLOGO</button>
        <div className="assetDetailBrand"><span>VJ</span><b>ASSET VIEW</b><small>{detail.source}</small></div>
        <button onClick={onClose} className="assetClose" aria-label="Fechar"><X size={18}/></button>
      </header>

      <main className="assetDetailBody">
        <section className="assetVisualColumn">
          <div className="assetHeroMedia">
            {gallery[activeImage] ? <img src={gallery[activeImage]} alt={detail.title}/> : <div className="assetNoImage"><ImageOff size={42}/><span>SEM PREVIEW DISPONÍVEL</span></div>}
            <div className="assetMediaShade"/>
            <span className="assetMediaCode">VJ / {detail.sourceId.toUpperCase()}</span>
            <span className="assetFreeStamp">FREE</span>
            <div className="assetMediaIdentity"><span>{detail.game || detail.vehicleClass}</span><strong>{detail.brand || 'VEÍCULO'}</strong></div>
          </div>

          {gallery.length > 1 && <div className="assetGalleryRail"><span className="assetGalleryLabel"><Images size={13}/> GALERIA / {gallery.length}</span><div className="assetGalleryThumbs">{gallery.map((image, index) => <button key={image} className={index === activeImage ? 'active' : ''} onClick={() => setActiveImage(index)}><img src={image} alt=""/><span>{String(index + 1).padStart(2,'0')}</span></button>)}</div></div>}

          <section className="assetDescriptionPanel"><span className="assetSectionCode">DESCRIPTION / 01</span><h3>SOBRE ESTE ASSET</h3><p>{detail.description || 'A fonte não forneceu uma descrição detalhada para este modelo. Use os metadados extraídos e a página original para verificar informações adicionais.'}</p></section>
        </section>

        <aside className="assetInfoColumn">
          <div className="assetDetailStatus">{loading ? <><LoaderCircle className="spin" size={15}/> ANALISANDO PÁGINA ORIGINAL</> : error ? <>DETALHES PARCIAIS · FONTE NÃO ANALISADA</> : <><Check size={14}/> DADOS DA FONTE ATUALIZADOS</>}</div>
          <div className="assetTitleBlock"><span className="assetKicker"><CarFront size={13}/> {detail.vehicleClass} · {detail.game || (detail.sourceType === 'game-mods' ? 'GAME MOD' : '3D ASSET')}</span><h1>{detail.title}</h1><div className="assetTags"><span>100% GRÁTIS</span>{confirmedDownloadHref && <span>DOWNLOAD DIRETO CONFIRMADO</span>}{detail.game && <span>{detail.game}</span>}{detail.year && <span>{detail.year}</span>}</div></div>

          <div className="assetPrimaryActions">
            {confirmedDownloadHref && <a href={confirmedDownloadHref} className="assetDownload direct"><Download size={17}/><span><b>BAIXAR DIRETO</b><small>arquivo final confirmado pelo VJ</small></span><ArrowUpRight size={16}/></a>}
            <a href={detail.sourceUrl} target="_blank" rel="noreferrer" className="assetSourceAction"><ExternalLink size={15}/> VER PÁGINA ORIGINAL</a>
          </div>

          <section className="assetSpecSection"><span className="assetSectionCode">METADATA / 02</span><div className="assetSpecGrid"><div><UserRound size={15}/><span>AUTOR</span><strong>{detail.author || 'Não informado'}</strong></div><div><Database size={15}/><span>FONTE</span><strong>{detail.source}</strong></div>{detail.game&&<div><Gamepad2 size={15}/><span>JOGO / SOURCE</span><strong>{detail.game}</strong></div>}<div><Calendar size={15}/><span>ANO</span><strong>{detail.year || 'Não identificado'}</strong></div><div><HardDrive size={15}/><span>TAMANHO</span><strong>{detail.fileSize || 'Não informado'}</strong></div><div><ShieldCheck size={15}/><span>LICENÇA</span><strong>{detail.license || 'Verificar na fonte'}</strong></div><div><Link2 size={15}/><span>DOWNLOAD</span><strong>{confirmedDownloadHref ? 'Direto confirmado' : 'Somente pela fonte'}</strong></div></div></section>

          <section className="assetFormatsSection"><span className="assetSectionCode">FORMATS / 03</span><div className="assetFormatList">{detail.formats.length ? detail.formats.map(format => <span key={format}><FileText size={12}/>{format}</span>) : <span><FileText size={12}/>FORMATO NA FONTE</span>}</div></section>

          <section className="assetResolverSection"><span className="assetSectionCode">DOWNLOAD RESOLVER / 04</span><div className={`assetResolverState ${confirmedDownloadHref ? 'resolved' : ''}`}><span className="resolverDot"/><div><strong>{confirmedDownloadHref ? 'ARQUIVO FINAL CONFIRMADO' : detail.downloadActionUrl ? 'A FONTE TEM UMA ETAPA DE DOWNLOAD' : 'SEM LINK DIRETO PÚBLICO'}</strong><small>{confirmedDownloadHref ? 'O botão acima usa o VJ para validar o asset e redirecionar ao arquivo público final.' : 'O VJ não mostra botão de baixar enquanto não encontrar um arquivo final público. Use a página original para downloads intermediários.'}</small></div></div>{detail.downloadCandidates && detail.downloadCandidates.some(candidate => candidate.kind === 'direct') && <details className="assetRoutes"><summary>rotas diretas detectadas</summary><div>{detail.downloadCandidates.filter(candidate => candidate.kind === 'direct').slice(0,6).map(candidate => <a key={candidate.url} href={candidate.url} target="_blank" rel="noreferrer"><span>DIRECT</span><b>{candidate.label}</b><ArrowUpRight size={12}/></a>)}</div></details>}</section>

          <div className="assetUtilityActions"><button onClick={copyShare}><Clipboard size={14}/>{copied ? 'LINK VJ COPIADO' : 'COPIAR LINK VJ'}</button><a href={detail.sourceUrl} target="_blank" rel="noreferrer"><ExternalLink size={14}/> ABRIR FONTE</a></div>
          <p className="assetLegalNote">O VJ só exibe “Baixar direto” quando encontra um arquivo final público. O arquivo continua hospedado pela fonte original; o VJ não replica nem redistribui o conteúdo.</p>
        </aside>
      </main>
    </div>
  )
}
