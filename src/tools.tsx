import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowLeft, ArrowRight, ArrowUpRight, Check, CircleAlert, CircleCheck, Clock3, Download, FileArchive, FileBox, History, LoaderCircle, RotateCcw, Upload, Wrench, X } from 'lucide-react'
import { cancelConversion, conversionDownload, converterCapabilities, getConversion, terminalConversion, uploadConversion, type ConversionCapabilities, type ConversionJob, type SavedConversion } from './api/conversions'
import './styles.css'
import './purple-overrides.css'
import './tools.css'

const HISTORY_KEY = 'vj:conversions:v1'
const PER_PAGE = 6
const labels: Record<ConversionJob['status'], string> = { queued: 'Na fila', decrypting: 'Descriptografando', converting: 'Convertendo', packaging: 'Preparando ZIP', uploading: 'Finalizando', completed: 'Pronto para baixar', failed: 'Não concluído', cancelled: 'Cancelado', expired: 'Expirado' }
function readHistory(): SavedConversion[] {
  try {
    const data = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(data) ? data.filter(item => /^[a-f0-9-]{36}$/.test(item?.job?.id) && /^[a-f0-9]{64}$/.test(item?.accessToken) && typeof item.job.filename === 'string' && item.job.status in labels).slice(0, 20).map(item => item.job.status === 'completed' && item.job.expiresAt <= Date.now() ? { ...item, job: { ...item.job, status: 'expired' } } : item) : []
  } catch { return [] }
}
const bytes = (value: number) => `${(value / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
const count = (value: number) => value.toLocaleString('pt-BR')
const date = (value: number) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

function Tools() {
  const [tab, setTab] = useState(window.location.hash === '#history' ? 'history' : 'converter')
  const [history, setHistory] = useState<SavedConversion[]>(readHistory)
  const [selected, setSelected] = useState<string | null>(() => readHistory()[0]?.job.id || null)
  const [capabilities, setCapabilities] = useState<ConversionCapabilities | null>(null)
  const [connectionError, setConnectionError] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [carFolder, setCarFolder] = useState('')
  const [folderFiles, setFolderFiles] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [percent, setPercent] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const input = useRef<HTMLInputElement>(null)
  const directoryInput = useRef<HTMLInputElement | null>(null)
  const upload = useRef<AbortController | null>(null)
  const historyRef = useRef(history)
  historyRef.current = history
  const current = history.find(item => item.job.id === selected)
  const maxBytes = capabilities?.maxInputBytes || 128 * 1024 * 1024
  const pages = Math.max(1, Math.ceil(history.length / PER_PAGE))
  const activeCount = history.filter(item => !terminalConversion(item.job)).length

  useEffect(() => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) } catch {}
  }, [history])
  useEffect(() => {
    const restore = () => setTab(window.location.hash === '#history' ? 'history' : 'converter')
    window.addEventListener('hashchange', restore)
    return () => window.removeEventListener('hashchange', restore)
  }, [])
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function refresh() {
      try {
        const state = await converterCapabilities(controller.signal)
        if (alive) { setCapabilities(state); setConnectionError(false) }
      } catch { if (alive) setConnectionError(true) }
      if (alive) timer = setTimeout(refresh, 12000)
    }
    void refresh()
    return () => { alive = false; clearTimeout(timer); controller.abort() }
  }, [])
  useEffect(() => {
    let alive = true, timer: ReturnType<typeof setTimeout>
    const controller = new AbortController()
    async function refresh() {
      const targets = historyRef.current.filter(item => !terminalConversion(item.job) || item.job.id === selected)
      for (const saved of targets) {
        try {
          const job = await getConversion(saved, controller.signal)
          if (alive) setHistory(current => current.map(item => item.job.id === job.id ? { ...item, job } : item))
        } catch { /* Keep local history through a temporary API outage. */ }
      }
      if (alive) timer = setTimeout(refresh, 3500)
    }
    void refresh()
    return () => { alive = false; clearTimeout(timer); controller.abort() }
  }, [selected])
  useEffect(() => () => upload.current?.abort(), [])

  function navigate(value: string) {
    setTab(value); window.location.hash = value; setError(null)
  }
  function choose(files: FileList | File[] | null, directory = false) {
    if (uploading || !files?.length) return
    setError(null)
    if (directory) {
      const candidates = [...files].filter(item => /\.kn5$/i.test(item.name)).sort((a, b) => Number(/collider|_decrypted|_lod/i.test(a.name)) - Number(/collider|_decrypted|_lod/i.test(b.name)) || b.size - a.size)
      if (!candidates.length) { setError('Esta pasta não contém arquivos KN5.'); return }
      setFolderFiles(candidates)
      return selectModel(candidates[0])
    }
    setFolderFiles([])
    if (files.length !== 1) { setError('Envie um arquivo KN5 por vez.'); return }
    selectModel(files[0])
  }
  function selectModel(candidate: File) {
    setFile(null); setError(null)
    if (!/\.kn5$/i.test(candidate.name)) { setError('Selecione um arquivo .kn5.'); return }
    if (candidate.size > maxBytes) { setError(`O limite por arquivo é ${bytes(maxBytes)}.`); return }
    if (candidate.size < 18) { setError('Este arquivo está vazio ou incompleto.'); return }
    setFile(candidate)
    const relative = candidate.webkitRelativePath?.split('/') || []
    setCarFolder(relative.length > 1 ? relative[relative.length - 2] : '')
  }
  async function start() {
    if (!file || uploading || !capabilities?.online || connectionError) return
    if (carFolder && (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(carFolder) || carFolder.endsWith('.'))) { setError('Confira o nome da pasta original: use letras, números, ponto, hífen ou sublinhado.'); return }
    const controller = new AbortController(); upload.current = controller
    setUploading(true); setPercent(0); setError(null)
    try {
      const saved = await uploadConversion(file, setPercent, controller.signal, carFolder)
      setHistory(current => [saved, ...current.filter(item => item.job.id !== saved.job.id)].slice(0, 20))
      setSelected(saved.job.id); setFile(null); setCarFolder(''); setFolderFiles([]); setPage(1)
      if (input.current) input.current.value = ''
    } catch (failure) {
      if (!(failure instanceof DOMException && failure.name === 'AbortError')) setError(failure instanceof Error ? failure.message : 'Não foi possível enviar o arquivo.')
    } finally { setUploading(false); upload.current = null }
  }
  async function download(saved: SavedConversion) {
    setBusy(saved.job.id); setError(null)
    try { window.location.assign(await conversionDownload(saved)) }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'O download não pôde ser iniciado.') }
    finally { setBusy(null) }
  }
  async function cancel(saved: SavedConversion) {
    setBusy(saved.job.id); setError(null)
    try {
      const job = await cancelConversion(saved)
      setHistory(current => current.map(item => item.job.id === job.id ? { ...item, job } : item))
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Não foi possível cancelar.') }
    finally { setBusy(null) }
  }

  return <div className="toolsPage">
    <header className="toolsHeader"><a className="brand" href="./"><span className="brandMark">VJ</span><span>3D SEARCH<small>AUTOMOTIVE TOOLBOX</small></span></a><nav aria-label="Navegação principal"><a href="./">CATÁLOGO</a><a href="tools.html" aria-current="page"><Wrench size={14}/> FERRAMENTAS <span className="toolsNew">NOVO</span></a></nav><a className="toolsReturn" href="./"><ArrowLeft size={14}/><span>Voltar à busca</span></a></header>
    <div className="toolsContainer">
      <div className="toolsBreadcrumb"><a href="./">VJ 3D</a><span>/</span> FERRAMENTAS <span>/</span> CONVERSOR KN5</div>
      <section className="toolsHero">
        <div><div className="toolsEyebrow"><span/> VJ WORKSHOP / 01</div><h1>DA PISTA<br/>AO SEU <em>EDITOR.</em></h1><p>Transforme seus arquivos do Assetto Corsa em modelos prontos para importar. Envie o KN5 e baixe a malha, os materiais e as texturas em um só lugar.</p><div className="toolsHeroTags"><span>DESCRIPTOGRAFIA INCLUÍDA</span><span>OBJ + MTL + TEXTURAS</span></div></div>
        <div className="formatVisual" aria-hidden="true"><div className="formatLines"/><div className="formatSource"><FileBox size={34} strokeWidth={1}/><strong>.KN5</strong><small>ASSETTO CORSA</small></div><div className="formatConnector"><span/><ArrowRight size={25}/><span/></div><div className="formatTarget"><FileArchive size={34} strokeWidth={1}/><strong>.OBJ</strong><small>SEU PRÓXIMO PROJETO</small></div><div className="formatVisualFooter"><span>01 / CONVERT ENGINE</span><b>VJ</b></div></div>
      </section>
      <div className="toolsTabs" role="tablist" aria-label="Ferramentas"><button id="converter-tab" role="tab" aria-selected={tab === 'converter'} aria-controls="converter-panel" onClick={() => navigate('converter')}><Wrench size={16}/> Conversor KN5 <span>01</span></button><button id="history-tab" role="tab" aria-selected={tab === 'history'} aria-controls="history-panel" onClick={() => navigate('history')}><History size={16}/> Minhas conversões <span>{history.length}</span></button><div className={`converterAvailability ${capabilities?.online && !connectionError ? 'online' : ''}`} role="status"><i/>{connectionError ? 'Conexão indisponível' : !capabilities ? 'Conectando ao conversor' : capabilities.online ? 'Conversor online' : 'Conversor offline'}</div></div>
      {error && <div className="toolsError" role="alert"><CircleAlert size={17}/><span>{error}</span><button aria-label="Fechar aviso" onClick={() => setError(null)}><X size={16}/></button></div>}
      {tab === 'converter' ? <div className="converterLayout" id="converter-panel" role="tabpanel" aria-labelledby="converter-tab">
        <section className="converterMain"><div className="toolsPanelHeading"><span className="toolsStepNumber">01</span><div><h2>Seu arquivo. Outro formato.</h2><p>Selecione ou arraste um KN5 para começar.</p></div><span className="toolsFormatTag">KN5 → OBJ</span></div>
          <input ref={input} id="kn5-file" type="file" accept=".kn5" aria-label="Selecionar arquivo KN5" disabled={uploading} onChange={event => choose(event.target.files)}/>
          <input ref={node => { directoryInput.current = node; node?.setAttribute('webkitdirectory', '') }} type="file" multiple aria-label="Selecionar pasta do mod" disabled={uploading} onChange={event => choose(event.target.files, true)}/>
          <button type="button" className={`kn5Dropzone ${dragging ? 'dragging' : ''} ${file ? 'hasFile' : ''}`} disabled={uploading} onClick={() => input.current?.click()} onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={event => { event.preventDefault(); setDragging(false); choose(event.dataTransfer.files) }}>
            <span className="dropzoneIcon">{file ? <FileBox size={34} strokeWidth={1.3}/> : <Upload size={34} strokeWidth={1.3}/>}</span>
            <strong>{file ? file.name : 'Solte seu arquivo KN5 aqui'}</strong><p>{file ? `${bytes(file.size)} · Clique para trocar o arquivo` : <>ou <u>selecione no computador</u></>}</p><small>UM ARQUIVO POR VEZ · ATÉ {bytes(maxBytes)}</small>
          </button>
          <div className="folderChoice"><button className="toolsSecondary" disabled={uploading} onClick={() => directoryInput.current?.click()}>Selecionar pasta do mod <ArrowUpRight size={14}/></button><span>Preenche o nome original automaticamente.<br/>Só o KN5 escolhido será enviado.</span></div>
          {folderFiles.length > 1 && <label className="originalFolder">Modelo desta pasta<select aria-label="Modelo desta pasta" value={file?.webkitRelativePath || ''} disabled={uploading} onChange={event => { const found = folderFiles.find(item => item.webkitRelativePath === event.target.value); if (found) selectModel(found) }}>{folderFiles.map(item => <option key={item.webkitRelativePath} value={item.webkitRelativePath}>{item.webkitRelativePath} · {bytes(item.size)}</option>)}</select></label>}
          <label className="originalFolder">Pasta original do carro <span>opcional</span><input aria-label="Pasta original do carro" value={carFolder} disabled={uploading} maxLength={96} placeholder="ex.: mnba_ford_mustang_gt_2018" autoComplete="off" onChange={event => setCarFolder(event.target.value.trim())}/><small>Algumas proteções dependem desse nome. Se o KN5 sozinho não abrir, selecione a pasta do mod ou informe o nome aqui.</small></label>
          {uploading && <div className="uploadProgress" aria-live="polite"><span>{percent < 100 ? `Enviando arquivo · ${percent}%` : 'Arquivo enviado. Validando…'}</span><progress max="100" value={percent}/></div>}
          {!uploading && capabilities && !capabilities.online && <p className="converterOffline"><Clock3 size={15}/> O agente de conversão está desconectado. Você pode selecionar o arquivo e enviar quando ele voltar.</p>}
          <div className="converterSubmit"><p><Check size={14}/> O original permanece no seu computador.</p>{uploading ? <button className="toolsSecondary" onClick={() => upload.current?.abort()}><X size={15}/> Cancelar envio</button> : <button className="toolsPrimary" disabled={!file || !capabilities?.online || connectionError} onClick={() => void start()}>CONVERTER ARQUIVO <ArrowUpRight size={18}/></button>}</div>
          <p className="converterFootnote">Envie um KN5 com as texturas incorporadas. Arquivos protegidos dependem das chaves disponíveis; se não puderem ser abertos, você verá o motivo.</p>
          {current && <div className={`conversionCurrent ${current.job.status}`} aria-live="polite"><div className="currentHeading"><span>{current.job.status === 'completed' ? <CircleCheck size={22}/> : terminalConversion(current.job) ? <CircleAlert size={22}/> : <LoaderCircle className="toolsSpin" size={22}/>}</span><div><small>SUA CONVERSÃO</small><h3>{labels[current.job.status]}</h3><p>{current.job.filename}</p></div><button aria-label="Ocultar conversão" onClick={() => setSelected(null)}><X size={17}/></button></div>
            {!terminalConversion(current.job) && <><progress aria-label="Progresso da conversão" max="100" value={current.job.progress}/><ol className="conversionSteps">{[['decrypting', 'Abrir KN5'], ['converting', 'Converter'], ['packaging', 'Empacotar'], ['completed', 'Baixar']].map(([stage, label], index) => <li key={stage} className={current.job.progress >= [25, 50, 75, 100][index] ? 'active' : ''}><span>{String(index + 1).padStart(2, '0')}</span>{label}</li>)}</ol><div className="currentActions"><span>{current.job.status === 'queued' ? `Posição na fila: ${current.job.queuePosition || 1}` : 'Você pode continuar navegando enquanto processamos.'}</span><button disabled={busy === current.job.id} onClick={() => void cancel(current)}>Cancelar</button></div></>}
            {current.job.error && <p className="currentError">{current.job.error}</p>}
            {current.job.status === 'completed' && <><div className="conversionSummary"><span><b>{count(current.job.report?.triangles || 0)}</b> triângulos</span><span><b>{current.job.report?.materials || 0}</b> materiais</span><span><b>{current.job.report?.textures || 0}</b> texturas</span></div>{Boolean(current.job.report?.placeholderTextures) && <p className="currentError">O modelo contém {current.job.report?.placeholderTextures} textura(s) de 1 pixel. Elas podem ser cores sólidas ou substitutas; confira o resultado no seu editor.</p>}<div className="currentDownload"><span>ZIP · {bytes(current.job.outputBytes)}<small>Disponível até {date(current.job.expiresAt)}</small></span><button className="toolsPrimary" disabled={busy === current.job.id} onClick={() => void download(current)}><Download size={16}/> BAIXAR ZIP</button></div></>}
          </div>}
        </section>
        <aside className="converterAside"><div className="toolsPanelHeading"><span className="toolsStepNumber">02</span><h2>O que você recebe</h2></div><div className="outputFile"><span>OBJ</span><div><strong>Modelo 3D</strong><p>Malha com grupos e coordenadas UV.</p></div><Check size={15}/></div><div className="outputFile"><span>MTL</span><div><strong>Materiais</strong><p>Materiais vinculados à geometria.</p></div><Check size={15}/></div><div className="outputFile"><span>TEX</span><div><strong>Texturas</strong><p>Imagens incorporadas ao KN5 original.</p></div><Check size={15}/></div><div className="toolsZipNote"><FileArchive size={22}/><p>Tudo em um ZIP.<br/><strong>Extraia junto e importe o OBJ.</strong></p></div><div className="toolsNotes"><h3>Antes de converter</h3><p>Os materiais são uma aproximação dos shaders do jogo. Rig e animações não são preservados no OBJ.</p><p>Arquivos enviados e resultados são temporários. Baixe seu ZIP em até {capabilities?.retentionMinutes || 60} minutos após a conclusão.</p><a href="./">Encontrar outro modelo no catálogo <ArrowRight size={14}/></a></div></aside>
      </div> : <section className="conversionHistory" id="history-panel" role="tabpanel" aria-labelledby="history-tab"><div className="historyHeading"><div><span className="toolsEyebrow">SEU HISTÓRICO / LOCAL</span><h2>Minhas conversões<span>.</span></h2><p>Os últimos 20 envios deste navegador. Os downloads são temporários.</p></div><span>{activeCount ? `${activeCount} em andamento` : `${history.length} conversões`}</span></div>
        {history.length ? <><div className="historyList">{history.slice((page - 1) * PER_PAGE, page * PER_PAGE).map(saved => <article key={saved.job.id}><FileBox size={24}/><div className="historyIdentity"><strong>{saved.job.filename}</strong><small>{date(saved.job.createdAt)} {saved.job.outputBytes > 0 && `· ${bytes(saved.job.outputBytes)}`}</small></div><span className={`historyStatus ${saved.job.status}`}>{labels[saved.job.status]}</span><button className="toolsSecondary" onClick={() => { setSelected(saved.job.id); navigate('converter') }}>Ver detalhes <ArrowUpRight size={14}/></button>{saved.job.status === 'completed' && <button className="historyDownload" disabled={busy === saved.job.id} aria-label={`Baixar ${saved.job.filename}`} onClick={() => void download(saved)}><Download size={17}/></button>}</article>)}</div><nav className="toolsPagination" aria-label="Páginas de conversões"><span>{history.length} conversões · {PER_PAGE} por página</span><div><button disabled={page === 1} aria-label="Página anterior de conversões" onClick={() => setPage(value => value - 1)}><ArrowLeft size={15}/></button>{Array.from({ length: pages }, (_, index) => <button key={index} aria-label={`Página ${index + 1} de conversões`} aria-current={page === index + 1 ? 'page' : undefined} onClick={() => setPage(index + 1)}>{index + 1}</button>)}<button disabled={page === pages} aria-label="Próxima página de conversões" onClick={() => setPage(value => value + 1)}><ArrowRight size={15}/></button></div></nav></> : <div className="historyEmpty"><History size={36} strokeWidth={1}/><h3>Seu próximo projeto começa aqui.</h3><p>Quando você enviar um KN5, acompanhe a conversão por esta aba.</p><button className="toolsPrimary" onClick={() => navigate('converter')}>CONVERTER MEU PRIMEIRO ARQUIVO <ArrowRight size={16}/></button></div>}
      </section>}
      <div className="toolsBottomLink"><span>PRECISA DO MODELO PRIMEIRO?</span><a href="./">Explore o catálogo automotivo <ArrowUpRight size={17}/></a></div>
    </div><footer className="toolsFooter"><span>VJ 3D / FERRAMENTAS</span><small>DA BUSCA AO SEU PRÓXIMO PROJETO.</small><a href="https://github.com/vyiito/car3d-search" target="_blank" rel="noreferrer">GITHUB <ArrowUpRight size={12}/></a></footer>
  </div>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Tools/></React.StrictMode>)
