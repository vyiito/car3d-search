import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Box, Camera, Check, CircleAlert, Eye, EyeOff, Focus, FolderOpen, Grid2X2, Layers, LoaderCircle, Maximize2, MousePointer2, Palette, Rotate3D, Search, Upload, X } from 'lucide-react'
import { prepareBundle, type ModelBundle, type ViewerSource } from '../viewer/files'
import { prepareModel } from '../viewer/model'
import type { ModelInfo, ViewerRuntime, View } from '../viewer/runtime'
import '../workshop.css'

type Props = { source: ViewerSource | null; onSource: (source: ViewerSource | null) => void }
const format = (value: number) => value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const formats = '.glb,.gltf,.obj,.mtl,.bin,.zip,.png,.jpg,.jpeg,.webp,.bmp,.dds,.tga,.ktx2'
const partPageSize = 100

export default function ViewerWorkspace({ source, onSource }: Props) {
  const [bundle, setBundle] = useState<ModelBundle | null>(null)
  const [model, setModel] = useState('')
  const [state, setState] = useState<'empty' | 'loading' | 'ready' | 'error'>('empty')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [warnings, setWarnings] = useState<string[]>([])
  const [info, setInfo] = useState<ModelInfo | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [surfaceId, setSurfaceId] = useState('')
  const [search, setSearch] = useState('')
  const [partPage, setPartPage] = useState(0)
  const [wireframe, setWireframe] = useState(false)
  const [rotate, setRotate] = useState(false)
  const [grid, setGrid] = useState(true)
  const [view, setView] = useState<View>('perspective')
  const [dragging, setDragging] = useState(false)
  const [textureBusy, setTextureBusy] = useState(false)
  const host = useRef<HTMLDivElement>(null)
  const stage = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const directory = useRef<HTMLInputElement | null>(null)
  const texture = useRef<HTMLInputElement>(null)
  const runtime = useRef<ViewerRuntime | null>(null)
  const infoRef = useRef<ModelInfo | null>(null)
  const partList = useRef<HTMLDivElement>(null)
  const selectedRow = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const list = partList.current, row = selectedRow.current
    if (!list || !row) return
    const listBox = list.getBoundingClientRect(), rowBox = row.getBoundingClientRect()
    const top = listBox.top + list.clientTop, bottom = top + list.clientHeight
    // Scroll only the parts panel, keeping the camera and the page in place.
    if (rowBox.top < top) list.scrollTop += rowBox.top - top
    else if (rowBox.bottom > bottom) list.scrollTop += rowBox.bottom - bottom
  }, [selected, partPage, search])

  useEffect(() => {
    const controller = new AbortController()
    setBundle(null); setModel(''); setInfo(null); setError(''); setNotice(''); setWarnings([]); setSelected(null); setSurfaceId(''); setSearch(''); setPartPage(0)
    if (!source) { setState('empty'); return () => controller.abort() }
    setState('loading')
    void prepareBundle(source, controller.signal).then(value => {
      if (!controller.signal.aborted) { setBundle(value); setModel(value.models[0]) }
    }).catch(failure => {
      if (!controller.signal.aborted) { setState('error'); setError(failure instanceof Error ? failure.message : 'Não foi possível ler esta seleção.') }
    })
    return () => controller.abort()
  }, [source])

  useEffect(() => {
    if (!bundle || !model || !host.current) return
    const controller = new AbortController(), container = host.current
    setState('loading'); setInfo(null); setWarnings([]); setNotice(''); setSelected(null); setSurfaceId(''); setSearch(''); setPartPage(0); setWireframe(false); setRotate(false); setGrid(true); setView('perspective'); setTextureBusy(false)
    void prepareModel(bundle, model, controller.signal).then(async prepared => {
      const { createViewer } = await import('../viewer/runtime')
      controller.signal.throwIfAborted()
      return createViewer(container, bundle, model, controller.signal, {
        change: next => { if (controller.signal.aborted) return; infoRef.current = next; setInfo(next); setSurfaceId(previous => next.materials.some(item => item.id === previous) ? previous : next.materials[0]?.id || '') },
        select: (id, revealInList) => {
          if (controller.signal.aborted) return
          setSelected(id)
          const parts = infoRef.current?.parts || [], index = parts.findIndex(item => item.id === id), part = parts[index]
          if (part?.materials[0]) setSurfaceId(part.materials[0])
          if (revealInList && index >= 0) { setSearch(''); setPartPage(Math.floor(index / partPageSize)) }
        },
        warning: message => { if (!controller.signal.aborted) setWarnings(current => current.includes(message) || current.length >= 80 ? current : [...current, message]) },
      }, prepared)
    }).then(viewer => { if (controller.signal.aborted) viewer.dispose(); else { runtime.current = viewer; setState('ready') } }).catch(failure => {
      if (!controller.signal.aborted) { setState('error'); setError(failure instanceof Error ? failure.message : 'Seu navegador não conseguiu abrir a prévia 3D.') }
    })
    return () => { controller.abort(); runtime.current?.dispose(); runtime.current = null; infoRef.current = null }
  }, [bundle, model])

  function open(files: FileList | File[] | null) { if (files?.length) onSource({ files: [...files] }) }
  async function replace(file: File | undefined) {
    const engine = runtime.current
    if (!engine || !file || textureBusy) return
    setTextureBusy(true); setNotice('')
    try { await engine.replaceTexture(surfaceId, file) }
    catch (failure) { if (runtime.current === engine) setNotice(failure instanceof Error ? failure.message : 'Não foi possível abrir esta textura.') }
    finally { if (runtime.current === engine) setTextureBusy(false) }
  }
  async function screenshot() {
    const engine = runtime.current
    if (!engine) return
    setNotice('')
    try {
      const blob = await engine.screenshot()
      const url = URL.createObjectURL(blob), anchor = document.createElement('a')
      anchor.href = url; anchor.download = (model.split('/').pop()?.replace(/\.[^.]+$/, '') || 'modelo') + '-vj3d.png'; anchor.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (failure) { if (runtime.current === engine) setNotice(failure instanceof Error ? failure.message : 'Não foi possível salvar a imagem.') }
  }
  const ready = state === 'ready'
  const surface = info?.materials.find(item => item.id === surfaceId)
  const filtered = info?.parts.filter(part => part.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())) || []
  const pageParts = filtered.slice(partPage * partPageSize, (partPage + 1) * partPageSize)
  const visible = info?.parts.filter(part => part.visible).length || 0
  const selectedPart = info?.parts.find(part => part.id === selected)

  return <section className="viewerWorkspace" aria-label="Bancada de visualização 3D">
    <div className="workshopHeading"><div><span className="toolsEyebrow"><Box size={13}/> VJ WORKSHOP / 02</span><h2>Seu modelo. <em>Em cada detalhe.</em></h2><p>Abra, explore as peças e confira o acabamento antes de importar no seu editor.</p></div><span className="viewerLocalBadge"><Check size={13}/> ARQUIVOS ABERTOS LOCALMENTE</span></div>
    <input ref={input} type="file" multiple accept={formats} hidden aria-label="Abrir arquivos no visualizador" onChange={event => { open(event.target.files); event.target.value = '' }}/>
    <input ref={node => { directory.current = node; node?.setAttribute('webkitdirectory', '') }} type="file" multiple hidden aria-label="Abrir pasta no visualizador" onChange={event => { open(event.target.files); event.target.value = '' }}/>
    <input ref={texture} type="file" accept=".png,.jpg,.jpeg,.webp,.bmp,.dds,.tga,.ktx2" hidden aria-label="Substituir textura difusa" onChange={event => { void replace(event.target.files?.[0]); event.target.value = '' }}/>
    <div className="viewerImport"><button className="toolsPrimary" onClick={() => input.current?.click()}><Upload size={15}/> ABRIR ARQUIVOS</button><button className="toolsSecondary" onClick={() => directory.current?.click()}><FolderOpen size={15}/> Abrir pasta</button><span>GLB · glTF · OBJ + MTL · ZIP<small>Até 256 MB por seleção · 2 milhões de triângulos</small></span>{source && <button className="viewerClear" onClick={() => onSource(null)} aria-label="Fechar modelo"><X size={17}/></button>}</div>
    {notice && <div className="toolsError" role="alert"><CircleAlert size={16}/><span>{notice}</span><button aria-label="Fechar aviso do visualizador" onClick={() => setNotice('')}><X size={15}/></button></div>}
    <div className={`viewerDesk ${dragging ? 'viewerDragging' : ''}`} onDragOver={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); setDragging(true) }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false) }} onDrop={event => { event.preventDefault(); setDragging(false); open(event.dataTransfer.files) }}>
      <div className="viewerMain">
        <div className="viewerModelBar"><span><Box size={15}/>{bundle?.label || source?.label || source?.files[0]?.name || 'NENHUM MODELO ABERTO'}</span>{bundle && bundle.models.length > 1 && <label>Modelo<select aria-label="Modelo do pacote" value={model} onChange={event => setModel(event.target.value)}>{bundle.models.map(path => <option key={path} value={path}>{path}</option>)}</select></label>}</div>
        <div className="viewerStage" ref={stage}>
          <div className="workshopCanvas" ref={host}/>
          {state !== 'ready' && <div className={`viewerOverlay viewerOverlay-${state}`} role={state === 'error' ? 'alert' : 'status'}>
            {state === 'loading' ? <LoaderCircle className="toolsSpin" size={36}/> : state === 'error' ? <CircleAlert size={36}/> : <Box size={50} strokeWidth={1}/>}
            <h3>{state === 'loading' ? 'Preparando seu modelo' : state === 'error' ? 'Não foi possível abrir' : 'Traga seu próximo projeto.'}</h3>
            <p>{state === 'loading' ? 'Lendo a geometria, os materiais e as texturas…' : state === 'error' ? error : 'Arraste um ZIP, um GLB ou os arquivos OBJ, MTL e texturas juntos.'}</p>
            {state === 'empty' && <button className="toolsSecondary" onClick={() => input.current?.click()}>Escolher modelo <Upload size={14}/></button>}
            {state === 'loading' && <button className="toolsSecondary" onClick={() => onSource(null)}>Cancelar abertura</button>}
            {state === 'error' && <button className="toolsSecondary" onClick={() => input.current?.click()}>Abrir outro arquivo</button>}
            {state === 'empty' && <small>O KN5 pode ser aberto aqui depois de passar pelo conversor.</small>}
          </div>}
          {ready && <div className="viewerCanvasHint"><MousePointer2 size={12}/> Arraste para girar · scroll para zoom · clique para selecionar</div>}
          {dragging && <div className="viewerDropHint"><Upload size={30}/><strong>Solte os arquivos para abrir</strong></div>}
        </div>
        <div className="viewerToolbar"><div className="viewerViewButtons" role="group" aria-label="Vistas do modelo">{([['perspective', '3/4'], ['front', '+Z'], ['side', '+X'], ['top', 'Topo']] as const).map(([value, label]) => <button key={value} disabled={!ready} aria-pressed={view === value} onClick={() => { setView(value); runtime.current?.view(value) }}>{label}</button>)}</div><div className="viewerDisplayButtons"><button disabled={!ready} aria-pressed={wireframe} title="Ver malha" onClick={() => { setWireframe(!wireframe); runtime.current?.wireframe(!wireframe) }}><Grid2X2 size={15}/><span>Malha</span></button><button disabled={!ready} aria-pressed={rotate} title="Girar automaticamente" onClick={() => { setRotate(!rotate); runtime.current?.rotate(!rotate) }}><Rotate3D size={15}/><span>Girar</span></button><button disabled={!ready} aria-pressed={grid} title="Mostrar grade" onClick={() => { setGrid(!grid); runtime.current?.grid(!grid) }}><Layers size={15}/><span>Grade</span></button><button disabled={!ready} aria-label="Enquadrar modelo" title="Enquadrar modelo" onClick={() => runtime.current?.fit()}><Focus size={16}/></button><button disabled={!ready} aria-label="Tela cheia do visualizador" title="Tela cheia" onClick={() => { void stage.current?.requestFullscreen?.().catch(() => setNotice('A tela cheia não está disponível neste navegador.')) }}><Maximize2 size={15}/></button></div></div>
        <div className="viewerStats" aria-label="Dados do modelo"><span><b>{info ? format(info.triangles) : '—'}</b> triângulos</span><span><b>{info ? format(info.parts.length) : '—'}</b> peças</span><span><b>{info ? format(info.materials.length) : '—'}</b> materiais</span><span><b>{info ? format(info.textures) : '—'}</b> texturas no pacote</span></div>
        <div className="viewerExport"><span><Camera size={15}/> A imagem acompanha a vista e os materiais atuais.<small>PNG com fundo transparente.</small></span><button className="toolsSecondary" disabled={!ready} onClick={() => void screenshot()}><Camera size={15}/> Baixar PNG</button></div>
      </div>
      <aside className="viewerInspector" aria-label="Inspetor do modelo">
        <section className="viewerParts"><div className="inspectorTitle"><h3><Layers size={14}/> PEÇAS</h3><span>{visible}/{info?.parts.length || 0} visíveis</span></div><label className="viewerPartSearch"><Search size={14}/><input aria-label="Buscar peça" value={search} onChange={event => { setSearch(event.target.value); setPartPage(0); if (partList.current) partList.current.scrollTop = 0 }} placeholder="Buscar na hierarquia…" disabled={!ready}/></label>
          <p className="viewerSelectedPart" role="status">{selectedPart ? <>Selecionada: <strong>{selectedPart.name}</strong>{!selectedPart.visible && ' · oculta'}</> : 'Clique no modelo ou na lista para selecionar uma peça.'}</p>
          <div className="viewerPartList" ref={partList}>{info ? pageParts.map(part => <div ref={selected === part.id ? selectedRow : undefined} className={`viewerPartRow ${selected === part.id ? 'selected' : ''} ${!part.visible ? 'hiddenPart' : ''}`} key={part.id}><button className="viewerPartName" aria-pressed={selected === part.id} onClick={() => runtime.current?.select(selected === part.id ? null : part.id)}><Box size={13}/><span>{part.name}<small>{format(part.triangles)} triângulos</small></span></button><button className="viewerPartVisibility" aria-label={`${part.visible ? 'Ocultar' : 'Mostrar'} ${part.name}`} onClick={() => runtime.current?.visibility(part.id)}>{part.visible ? <Eye size={15}/> : <EyeOff size={15}/>}</button></div>) : <p>As peças do modelo aparecem aqui.</p>}{info && !filtered.length && <p>Nenhuma peça com esse nome.</p>}</div>
          {filtered.length > partPageSize && <nav className="viewerPartPages" aria-label="Páginas de peças"><button disabled={partPage === 0} onClick={() => { setPartPage(partPage - 1); if (partList.current) partList.current.scrollTop = 0 }}>Anterior</button><span>{partPage * partPageSize + 1}–{Math.min((partPage + 1) * partPageSize, filtered.length)} de {filtered.length}</span><button disabled={(partPage + 1) * partPageSize >= filtered.length} onClick={() => { setPartPage(partPage + 1); if (partList.current) partList.current.scrollTop = 0 }}>Próxima</button></nav>}
          <div className="viewerPartActions"><button disabled={!ready || !selected} onClick={() => selected && runtime.current?.isolate(selected)}>Isolar peça</button><button disabled={!ready || !selectedPart} onClick={() => selected && runtime.current?.visibility(selected)}>{selectedPart?.visible === false ? <Eye size={13}/> : <EyeOff size={13}/>} {selectedPart?.visible === false ? 'Mostrar peça' : 'Ocultar peça'}</button><button disabled={!ready || !selected} onClick={() => selected && runtime.current?.fit(selected)}>Enquadrar peça</button><button disabled={!ready} onClick={() => runtime.current?.showAll()}>Mostrar todas</button></div>
        </section>
        <section className="viewerMaterials"><div className="inspectorTitle"><h3><Palette size={14}/> MATERIAIS</h3><span>{selectedPart ? 'Da peça selecionada' : 'Do modelo'}</span></div><label className="viewerMaterialSelect">Material<select aria-label="Material para editar" value={surfaceId} disabled={!ready} onChange={event => setSurfaceId(event.target.value)}>{!info && <option value="">Abra um modelo</option>}{info?.materials.map(item => <option key={item.id} value={item.id}>{selectedPart?.materials.includes(item.id) ? '• ' : ''}{item.name}</option>)}</select></label>
          <div className="viewerMaterialColor"><label>Cor<input type="color" aria-label="Cor do material" disabled={!surface || !ready} value={surface?.color || '#b7afc2'} onChange={event => runtime.current?.surface(surfaceId, { color: event.target.value })}/></label><span>{surface?.color.toUpperCase() || '—'}</span></div>
          {([['opacity', 'Opacidade'], ['roughness', 'Rugosidade'], ['metalness', 'Metalização']] as const).map(([key, label]) => <label className="viewerSlider" key={key}><span>{label}<b>{surface ? Math.round(surface[key] * 100) + '%' : '—'}</b></span><input type="range" aria-label={label} min="0" max="1" step="0.01" value={surface?.[key] ?? 1} disabled={!ready || !surface} onChange={event => runtime.current?.surface(surfaceId, { [key]: Number(event.target.value) })}/></label>)}
          <div className="viewerTexture"><span>TEXTURA DE COR</span><strong>{surface?.texture || 'Sem textura difusa'}</strong><button className="toolsSecondary" disabled={!ready || !surface || textureBusy} onClick={() => texture.current?.click()}>{textureBusy ? <LoaderCircle className="toolsSpin" size={13}/> : <Upload size={13}/>} Trocar textura</button></div>
          <button className="viewerResetMaterial" disabled={!ready || !surface || textureBusy} onClick={() => runtime.current?.resetSurface(surfaceId)}>Restaurar material original</button><p className="viewerMaterialNote">Ajustes temporários nesta prévia. Materiais de jogos podem ter aparência diferente dos shaders originais.</p>
        </section>
        {info && <div className="viewerDimensions"><span>DIMENSÕES / UNIDADES DO MODELO</span><strong>{info.dimensions.map(format).join(' × ')}</strong></div>}
      </aside>
    </div>
    {warnings.length > 0 && <details className="viewerWarnings"><summary><CircleAlert size={15}/> Avisos do modelo ({warnings.length})</summary><ul>{warnings.map(message => <li key={message}>{message}</li>)}</ul></details>}
    <p className="viewerPrivacy">A abertura de arquivos locais acontece neste navegador. Para modelos com arquivos separados, selecione a pasta ou envie o conjunto completo em ZIP.</p>
  </section>
}
