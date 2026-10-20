import { ArrowUpRight, CircleCheck, CircleX, Database, LoaderCircle, Search } from 'lucide-react'
import type { SourceSearchStatus } from '../api/search'

const labels = {
  'query-complete': 'Paginação da consulta concluída',
  limited: 'Há páginas ou resultados por consultar',
  partial: 'Cobertura parcial: houve falhas',
  unverified: 'Cobertura ainda não confirmada',
}

export default function SourceStatus({ sources, expanding, onExpand }: {
  sources: SourceSearchStatus[]
  expanding: string | null
  onExpand: (sourceId: string) => void
}) {
  const complete = sources.filter(source => source.coverage?.status === 'query-complete').length
  return <details className="sourceStatusSection">
    <summary><Database size={16}/> STATUS E COBERTURA DAS FONTES <span>{complete}/{sources.length} com paginação concluída</span></summary>
    <p className="sourceCoverageHelp">Uma fonte pode ter mais modelos em outras páginas ou seções. “Paginação concluída” se refere à consulta feita nas entradas verificadas; catálogos protegidos ou não expostos pela fonte podem ficar fora da busca.</p>
    <div className="sourceStatusGrid">{sources.map(source => {
      const coverage = source.coverage
      const retryTime = source.retryAt && Number.isFinite(Date.parse(source.retryAt)) ? new Date(source.retryAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : null
      return <div key={source.provider} className="sourceCoverageCard">
        <a href={source.searchUrl} target="_blank" rel="noreferrer" className={source.status === 'ok' ? 'sourceOk' : 'sourceError'}>
          {source.status === 'ok' ? <CircleCheck size={14}/> : <CircleX size={14}/>}
          <span><strong>{source.name}</strong><small>{source.count} modelo(s) · {source.pagesFetched || 0} página(s)</small></span><ArrowUpRight size={12}/>
        </a>
        <span className={`coverageLabel coverage-${coverage?.status || 'unverified'}`}>{source.failureKind === 'blocked' ? 'Consulta automática bloqueada pela fonte' : source.failureKind === 'access-required' ? 'Catálogo exige acesso autorizado' : labels[coverage?.status || 'unverified']}</span>
        {source.error && <p className="sourceCoverageError">{source.error}</p>}
        {source.stale && <p className="sourceCoverageHelp">Resultados da consulta anterior preservados; a consulta atual está incompleta.</p>}
        {source.cached && !source.stale && <p className="sourceCoverageHelp">Consulta recente reutilizada do cache.</p>}
        {source.deferred && <p className="sourceCoverageHelp">A fonte recusou uma consulta recente. Novas tentativas automáticas estão em pausa{retryTime ? ` até ${retryTime}` : ''}; a busca no site original continua disponível.</p>}
        {coverage && <details className="coverageRoutes"><summary>Entradas e limites da consulta</summary>
          <p>{coverage.depth === 'expanded' ? 'Busca ampliada: até 200 modelos e 40 páginas.' : 'Busca inicial com limite de tempo e resultados.'}{coverage.totalAvailable !== null && Number.isFinite(coverage.totalAvailable) ? ` A fonte informou ${coverage.totalAvailable} entradas para sua busca; algumas podem não corresponder ao veículo.` : ''}</p>
          <ul>{[...new Set(coverage.requests.map(request => request.url))].map(url => <li key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></li>)}</ul>
        </details>}
        {source.retryable === false && <a className="sourceManualSearch" href={source.searchUrl} target="_blank" rel="noopener noreferrer">BUSCAR NO SITE <ArrowUpRight size={12}/></a>}
        {(source.retryable !== false && coverage?.status !== 'query-complete' && coverage?.depth !== 'expanded') && <button onClick={() => onExpand(source.provider)} disabled={Boolean(expanding)} aria-label={`Aprofundar busca em ${source.name}`}>
          {expanding === source.provider ? <LoaderCircle size={13} className="spin"/> : <Search size={13}/>}{expanding === source.provider ? 'CONSULTANDO MAIS PÁGINAS…' : 'APROFUNDAR NESTA FONTE'}
        </button>}
      </div>
    })}</div>
  </details>
}
