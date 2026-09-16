import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Download, ExternalLink, Gauge, Globe2, Image as ImageIcon, Layers3, LoaderCircle, PackageOpen, RefreshCw, Square, SquareCheckBig } from 'lucide-react'
import type { GlobalSearchResult } from '../api/search'
import { getReferencePack, referencePackDownloadUrl, type ReferenceImage, type ReferencePack as ReferencePackData } from '../api/references'
import '../reference-pack.css'

interface Props { result: GlobalSearchResult }
type AngleFilter = 'all' | string
const angleOrder = [
  'front','rear','left-side','right-side','side',
  'front-left-three-quarter','front-right-three-quarter','front-three-quarter',
  'rear-left-three-quarter','rear-right-three-quarter','rear-three-quarter','three-quarter','top',
  'detail-headlight','detail-taillight','detail-grille','detail-mirror','detail-handle','detail-badge','detail-exhaust','detail-spoiler','detail-diffuser','wheel','brake','details',
  'interior-dashboard','interior-cockpit','interior-steering-wheel','interior-cluster','interior-console','interior-seats','interior-door','interior-trunk','interior',
  'engine-bay','engine','suspension','underbody','reference',
]
const groupLabels: Record<string,string> = { exterior:'EXTERIOR', details:'DETALHES', interior:'INTERIOR', mechanical:'MECÂNICA', technical:'TÉCNICO', reference:'GERAL' }

function resolutionLabel(image: ReferenceImage) { return image.width && image.height ? `${image.width}×${image.height}` : null }

export default function ReferencePack({ result }: Props) {
  const [pack,setPack]=useState<ReferencePackData|null>(null),[loading,setLoading]=useState(true),[error,setError]=useState(false)
  const [selected,setSelected]=useState<Set<string>>(new Set()),[angle,setAngle]=useState<AngleFilter>('all'),[reloadKey,setReloadKey]=useState(0)
  const [failedImages,setFailedImages]=useState<Set<string>>(new Set())
  const requestSequence=useRef(0)
  const assetKey=`${result.sourceId}|${result.sourceUrl}|${result.id}|${result.title}|${result.brand||''}|${result.year||''}|${result.vehicleClass||''}`

  useEffect(()=>{
    const requestId=++requestSequence.current
    const controller=new AbortController()
    setLoading(true);setError(false);setPack(null);setSelected(new Set());setFailedImages(new Set());setAngle('all')
    getReferencePack(result,controller.signal)
      .then(data=>{if(controller.signal.aborted||requestSequence.current!==requestId)return;setPack(data);setSelected(new Set(data.images.filter(image=>image.downloadAllowed).map(image=>image.id)))})
      .catch(err=>{if(controller.signal.aborted||requestSequence.current!==requestId)return;if(err?.name!=='AbortError')setError(true)})
      .finally(()=>{if(!controller.signal.aborted&&requestSequence.current===requestId)setLoading(false)})
    return()=>controller.abort()
  },[assetKey,reloadKey])

  const displayImages=useMemo(()=>pack?.images.filter(image=>!failedImages.has(image.id))||[],[pack,failedImages])
  const availableAngles=useMemo(()=>{
    const ids=[...new Set(displayImages.map(image=>image.angle).filter(Boolean))]
    return ids.sort((a,b)=>{const ai=angleOrder.indexOf(a),bi=angleOrder.indexOf(b);return(ai<0?999:ai)-(bi<0?999:bi)}).map(id=>({id,label:displayImages.find(image=>image.angle===id)?.angleLabel||id.toUpperCase(),count:displayImages.filter(image=>image.angle===id).length}))
  },[displayImages])
  const visible=useMemo(()=>angle==='all'?displayImages:displayImages.filter(image=>image.angle===angle),[displayImages,angle])
  const downloadable=useMemo(()=>displayImages.filter(image=>image.downloadAllowed),[displayImages])
  const referenceOnly=displayImages.length-downloadable.length
  const coverageCount=useMemo(()=>new Set(displayImages.map(image=>image.angle).filter(Boolean)).size,[displayImages])
  const selectedCount=downloadable.filter(image=>selected.has(image.id)).length
  const zipHref=pack&&selectedCount?referencePackDownloadUrl(pack.packId,downloadable.filter(image=>selected.has(image.id)).map(image=>image.id)):null
  const modeling=pack?.modelingCoverage
  const readiness=modeling?.readiness||0
  const toggle=(image:ReferenceImage)=>{if(!image.downloadAllowed)return;setSelected(current=>{const next=new Set(current);next.has(image.id)?next.delete(image.id):next.add(image.id);return next})}
  const selectAll=()=>setSelected(new Set(downloadable.map(image=>image.id))),clearAll=()=>setSelected(new Set()),webLinks=pack?.webSearch||[]
  const modelingLinks=webLinks.filter(link=>!['google','bing','commons'].includes(link.id))
  const generalLinks=webLinks.filter(link=>['google','bing','commons'].includes(link.id))
  const markImageFailed=(image:ReferenceImage)=>{setFailedImages(current=>new Set(current).add(image.id));setSelected(current=>{const next=new Set(current);next.delete(image.id);return next})}
  const handleImageError=(event:React.SyntheticEvent<HTMLImageElement>,image:ReferenceImage)=>{const element=event.currentTarget;if(element.dataset.fallback!=='1'&&image.imageUrl&&image.imageUrl!==image.thumbnailUrl){element.dataset.fallback='1';element.src=image.imageUrl;return}markImageFailed(image)}

  return <section className="referencePack" data-asset-key={assetKey}>
    <div className="referencePackHeading"><div><span className="referencePackCode">VJ MODELING REFERENCE ENGINE / 06</span><h3>REFERÊNCIAS PARA MODELAGEM 3D</h3><p>O VJ combina imagens licenciáveis com galerias automotivas especializadas. Ele prioriza identidade, variedade de ângulos, exterior, detalhes, interior e mecânica; fontes sem licença de redistribuição aparecem como REFERENCE ONLY.</p>{pack?.canonicalVehicle&&<div className="referenceCanonical"><span>VEÍCULO IDENTIFICADO</span><strong>{pack.year?`${pack.year} `:''}{pack.canonicalVehicle}{pack.identity?.vehicleClass?` · ${pack.identity.vehicleClass}`:''}</strong></div>}</div>{pack&&<div className="referencePackStats"><strong>{displayImages.length}</strong><span>IMAGENS</span><strong>{coverageCount}</strong><span>ÂNGULOS</span><strong>{readiness}%</strong><span>READINESS</span></div>}</div>

    {loading&&<div className="referencePackLoading"><LoaderCircle className="spin" size={20}/><div><strong>BUSCANDO GALERIAS E ÂNGULOS PARA MODELAGEM</strong><span>Commons · Openverse · Caricos · NetCarShow · Cars & Bids · Bring a Trailer · fontes técnicas</span></div></div>}
    {!loading&&error&&<div className="referencePackEmpty"><ImageIcon size={26}/><div><strong>NÃO FOI POSSÍVEL CARREGAR AS REFERÊNCIAS</strong><span>A busca de assets continua funcionando normalmente.</span></div><button onClick={()=>setReloadKey(value=>value+1)}><RefreshCw size={14}/> TENTAR NOVAMENTE</button></div>}
    {!loading&&!error&&pack&&!displayImages.length&&<div className="referencePackEmpty referencePackEmptyWide"><ImageIcon size={26}/><div><strong>NENHUMA REFERÊNCIA FIEL INDEXADA PARA “{pack.canonicalVehicle||pack.query}”</strong><span>O VJ rejeitou outro tipo de veículo, gerações incompatíveis, brinquedos, renders e previews quebrados. Use as fontes especializadas abaixo para busca manual.</span></div></div>}

    {!loading&&pack&&<>
      {modeling&&<div className="referenceReadiness"><div className="referenceReadinessTitle"><Gauge size={16}/><div><strong>MODEL READINESS {readiness}%</strong><span>cobertura útil para reconstruir o veículo, não apenas quantidade bruta</span></div></div><div className="referenceCoverageGrid">{Object.entries(modeling.targets).map(([group,target])=>{const value=modeling.groups[group]||0,pct=Math.min(100,Math.round(value/target*100));return <div key={group} className="referenceCoverageItem"><div><span>{groupLabels[group]||group.toUpperCase()}</span><b>{value}/{target}</b></div><i><em style={{width:`${pct}%`}}/></i></div>})}</div></div>}

      {pack.primarySet&&<a className="referencePrimarySet" href={pack.primarySet.sourcePage} target="_blank" rel="noreferrer"><Layers3 size={18}/><div><span>PRIMARY REFERENCE SET</span><strong>{pack.primarySet.source} · {pack.primarySet.title}</strong><small>{pack.primarySet.count} imagens · {pack.primarySet.angles} ângulos identificados</small></div><ExternalLink size={14}/></a>}

      {(pack.sourceGroups?.length||0)>0&&<div className="referenceSourceSummary">{pack.sourceGroups?.map(source=><div key={source.source}><strong>{source.source}</strong><span>{source.count} refs · {source.angles} ângulos{source.referenceOnly?` · ${source.referenceOnly} reference only`:''}</span></div>)}</div>}

      {displayImages.length>0&&<>
        <div className="referenceToolbar"><div className="referenceAngles"><button className={angle==='all'?'active':''} onClick={()=>setAngle('all')}>TODAS <span>{displayImages.length}</span></button>{availableAngles.map(item=><button key={item.id} className={angle===item.id?'active':''} onClick={()=>setAngle(item.id)}>{item.label} <span>{item.count}</span></button>)}</div><div className="referenceSelectionActions"><button onClick={selectAll}><SquareCheckBig size={13}/> LICENCIADAS</button><button onClick={clearAll}><Square size={13}/> LIMPAR</button></div></div>
        <div className="referenceGrid">{visible.map(image=>{const isSelected=selected.has(image.id);return <article key={`${pack.packId}:${image.id}`} className={`referenceCard ${isSelected?'selected':''} ${image.downloadAllowed?'':'referenceOnly'}`}><button className="referenceImageButton" onClick={()=>toggle(image)} aria-label={image.downloadAllowed?(isSelected?'Remover do pack':'Adicionar ao pack'):'Referência somente'}><img src={image.thumbnailUrl} alt={image.title} loading="lazy" referrerPolicy="no-referrer" onError={event=>handleImageError(event,image)}/><span className="referenceAngleBadge">{image.angleLabel}</span>{image.downloadAllowed?<span className="referenceSelectBadge">{isSelected?<Check size={13}/>:<Square size={13}/>}</span>:<span className="referenceOnlyBadge">REFERENCE ONLY</span>}</button><div className="referenceCardMeta"><strong title={image.title}>{image.title}</strong><div><span>{image.source}</span>{resolutionLabel(image)&&<span>{resolutionLabel(image)}</span>}{image.matchLevel&&<span>{image.matchLevel.toUpperCase()}</span>}{image.angleConfidence==='metadata'&&<span>ANGLE VERIFIED</span>}{image.identityScore&&<span>MATCH {image.identityScore}</span>}</div><small>{image.downloadAllowed?`${image.license}${image.licenseVersion?` ${image.licenseVersion}`:''}`:'Abra a fonte original para termos e alta resolução'} · {image.creator}</small><a href={image.sourcePage} target="_blank" rel="noreferrer"><ExternalLink size={11}/> ABRIR ORIGINAL</a></div></article>})}</div>
      </>}

      {modelingLinks.length>0&&<div className="referenceModelingSources"><div><Globe2 size={15}/><span><strong>FONTES ESPECIALIZADAS</strong><small>galerias, leilões, press rooms, blueprints e bibliotecas criadas para referência</small></span></div><div className="referenceWebLinks">{modelingLinks.map(link=><a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={10}/></a>)}</div></div>}
      {generalLinks.length>0&&<div className="referenceMoreWeb"><span><Globe2 size={14}/> BUSCA COMPLEMENTAR</span><div>{generalLinks.map(link=><a key={link.id} href={link.url} target="_blank" rel="noreferrer">{link.label}<ExternalLink size={10}/></a>)}</div></div>}

      <div className="referencePackFooter"><div className="referenceLicenseNote"><PackageOpen size={19}/><div><strong>{downloadable.length} licenciadas para ZIP · {referenceOnly} reference only</strong><span>O ZIP continua incluindo somente imagens com licença permitida. Galerias automotivas externas servem como referência visual e abrem na fonte original.</span></div></div>{zipHref?<a className="referenceDownload" href={zipHref}><Download size={17}/><span><b>BAIXAR REFERENCE PACK .ZIP</b><small>{selectedCount} imagem{selectedCount===1?'':'ns'} selecionada{selectedCount===1?'':'s'}</small></span></a>:<button className="referenceDownload disabled" disabled><Download size={17}/><span><b>SELECIONE IMAGENS</b><small>somente imagens com licença aceita entram no ZIP</small></span></button>}</div>
    </>}
  </section>
}
