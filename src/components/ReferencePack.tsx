import { useEffect, useMemo, useState } from 'react'
import { Check, Download, ExternalLink, Globe2, Image as ImageIcon, LoaderCircle, PackageOpen, RefreshCw, Square, SquareCheckBig } from 'lucide-react'
import type { GlobalSearchResult } from '../api/search'
import { getReferencePack, referencePackDownloadUrl, type ReferenceImage, type ReferencePack as ReferencePackData } from '../api/references'
import '../reference-pack.css'

interface Props { result: GlobalSearchResult }

type AngleFilter = 'all' | string

const angleOrder = ['front','rear','side','three-quarter','interior','details','reference']

function resolutionLabel(image: ReferenceImage) {
  if (!image.width || !image.height) return null
  return `${image.width}×${image.height}`
}

export default function ReferencePack({ result }: Props) {
  const [pack, setPack] = useState<ReferencePackData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [angle, setAngle] = useState<AngleFilter>('all')
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(false)
    setPack(null)
    setAngle('all')
    getReferencePack(result, controller.signal)
      .then(data => {
        setPack(data)
        setSelected(new Set(data.images.filter(image => image.downloadAllowed).map(image => image.id)))
      })
      .catch(err => { if (err?.name !== 'AbortError') setError(true) })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [result.id, result.title, result.brand, result.year, reloadKey])

  const availableAngles = useMemo(() => {
    if (!pack) return []
    return angleOrder
      .map(id => ({ id, label: pack.images.find(image => image.angle === id)?.angleLabel || id.toUpperCase(), count: pack.images.filter(image => image.angle === id).length }))
      .filter(item => item.count > 0)
  }, [pack])

  const visible = useMemo(() => {
    if (!pack) return []
    return angle === 'all' ? pack.images : pack.images.filter(image => image.angle === angle)
  }, [pack, angle])

  const downloadable = useMemo(() => pack?.images.filter(image => image.downloadAllowed) || [], [pack])
  const selectedCount = downloadable.filter(image => selected.has(image.id)).length
  const zipHref = pack && selectedCount ? referencePackDownloadUrl(pack.packId, downloadable.filter(image => selected.has(image.id)).map(image => image.id)) : null

  const toggle = (image: ReferenceImage) => {
    if (!image.downloadAllowed) return
    setSelected(current => {
      const next = new Set(current)
      next.has(image.id) ? next.delete(image.id) : next.add(image.id)
      return next
    })
  }

  const selectAll = () => setSelected(new Set(downloadable.map(image => image.id)))
  const clearAll = () => setSelected(new Set())

  const webLinks = pack?.webSearch || []

  return (
    <section className="referencePack">
      <div className="referencePackHeading">
        <div>
          <span className="referencePackCode">VJ REFERENCE KIT / 05</span>
          <h3>FOTOS REAIS PARA MODELAGEM</h3>
          <p>O VJ limpa o nome do asset, tenta ano, geração, aliases e o nome simples do carro. Imagens com licença compatível podem entrar no .ZIP; o restante fica como referência.</p>
        </div>
        {pack && <div className="referencePackStats"><strong>{pack.images.length}</strong><span>IMAGENS</span><strong>{pack.angleCoverage.length}</strong><span>GRUPOS</span></div>}
      </div>

      {loading && <div className="referencePackLoading"><LoaderCircle className="spin" size={20}/><div><strong>IDENTIFICANDO O CARRO E BUSCANDO REFERÊNCIAS</strong><span>nome limpo · geração · aliases · Openverse · Wikimedia Commons</span></div></div>}

      {!loading && error && <div className="referencePackEmpty"><ImageIcon size={26}/><div><strong>NÃO FOI POSSÍVEL CARREGAR AS REFERÊNCIAS</strong><span>A busca de assets continua funcionando normalmente.</span></div><button onClick={() => setReloadKey(value => value + 1)}><RefreshCw size={14}/> TENTAR NOVAMENTE</button></div>}

      {!loading && !error && pack && !pack.images.length && <div className="referencePackEmpty referencePackEmptyWide"><ImageIcon size={26}/><div><strong>NENHUMA REFERÊNCIA ABERTA INDEXADA PARA “{pack.query}”</strong><span>O VJ já tentou versões mais simples do nome. Você ainda pode procurar o carro diretamente na web; essas imagens aparecem como referência externa e não entram automaticamente no ZIP.</span></div>{webLinks.length>0&&<div className="referenceWebLinks">{webLinks.map(link=><a key={link.id} href={link.url} target="_blank" rel="noreferrer"><Globe2 size={13}/>{link.label}<ExternalLink size={11}/></a>)}</div>}</div>}

      {!loading && pack && pack.images.length > 0 && <>
        <div className="referenceToolbar">
          <div className="referenceAngles">
            <button className={angle === 'all' ? 'active' : ''} onClick={() => setAngle('all')}>TODAS <span>{pack.images.length}</span></button>
            {availableAngles.map(item => <button key={item.id} className={angle === item.id ? 'active' : ''} onClick={() => setAngle(item.id)}>{item.label} <span>{item.count}</span></button>)}
          </div>
          <div className="referenceSelectionActions">
            <button onClick={selectAll}><SquareCheckBig size={13}/> SELECIONAR LICENCIADAS</button>
            <button onClick={clearAll}><Square size={13}/> LIMPAR</button>
          </div>
        </div>

        <div className="referenceGrid">
          {visible.map(image => {
            const isSelected = selected.has(image.id)
            return <article key={image.id} className={`referenceCard ${isSelected ? 'selected' : ''} ${image.downloadAllowed ? '' : 'referenceOnly'}`}>
              <button className="referenceImageButton" onClick={() => toggle(image)} aria-label={image.downloadAllowed ? (isSelected ? 'Remover do pack' : 'Adicionar ao pack') : 'Referência somente'}>
                <img src={image.thumbnailUrl} alt={image.title} loading="lazy"/>
                <span className="referenceAngleBadge">{image.angleLabel}</span>
                {image.downloadAllowed ? <span className="referenceSelectBadge">{isSelected ? <Check size={13}/> : <Square size={13}/>}</span> : <span className="referenceOnlyBadge">REFERENCE ONLY</span>}
              </button>
              <div className="referenceCardMeta">
                <strong title={image.title}>{image.title}</strong>
                <div><span>{image.source}</span>{resolutionLabel(image) && <span>{resolutionLabel(image)}</span>}{image.matchLevel&&<span>{image.matchLevel.toUpperCase()}</span>}</div>
                <small>{image.license}{image.licenseVersion ? ` ${image.licenseVersion}` : ''} · {image.creator}</small>
                <a href={image.sourcePage} target="_blank" rel="noreferrer"><ExternalLink size={11}/> ABRIR ORIGINAL</a>
              </div>
            </article>
          })}
        </div>

        {webLinks.length>0&&<div className="referenceMoreWeb"><span><Globe2 size={14}/> NÃO ACHOU O ÂNGULO CERTO?</span><div>{webLinks.map(link=><a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={10}/></a>)}</div></div>}

        <div className="referencePackFooter">
          <div className="referenceLicenseNote"><PackageOpen size={19}/><div><strong>{pack.downloadableCount} imagens elegíveis para o ZIP</strong><span>O arquivo inclui um sources.txt com autor, licença e URL original de cada referência.</span></div></div>
          {zipHref ? <a className="referenceDownload" href={zipHref}><Download size={17}/><span><b>BAIXAR REFERENCE PACK .ZIP</b><small>{selectedCount} imagem{selectedCount === 1 ? '' : 'ns'} selecionada{selectedCount === 1 ? '' : 's'}</small></span></a> : <button className="referenceDownload disabled" disabled><Download size={17}/><span><b>SELECIONE IMAGENS</b><small>somente imagens com licença aceita entram no ZIP</small></span></button>}
        </div>
      </>}
    </section>
  )
}
