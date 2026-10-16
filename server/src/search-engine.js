import pLimit from 'p-limit'
import { prepareResults, normalizeText } from './search-core.js'
import { parsePerSource } from './search-options.js'
import { withSearchContext } from './search-context.js'
import { sourceFailure } from './source-failures.js'

// REST and SSE use one engine: one adapter and one status per provider.
export function createSearchEngine({ providerList, adapterMap, genericSearch,
  concurrency = Number(process.env.SEARCH_CONCURRENCY || 8), providerTimeoutMs = 26000,
  searchTimeoutMs = 65000, cacheTtlMs = Number(process.env.CACHE_TTL_MS || 600000) }) {
  const cache = new Map()
  const limit = pLimit(Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 8)
  return async function search(query, options = {}) {
    const selected = options.sourceIds?.length ? providerList.filter(provider => options.sourceIds.includes(provider.id)) : providerList
    if (options.sourceIds?.some(id => !providerList.some(provider => provider.id === id))) throw new Error('Unknown provider')
    const perSource = parsePerSource(options.perSource, options.expanded ? 200 : 60, options.expanded ? 200 : 80)
    const key = `${normalizeText(query)}|${perSource}|${options.expanded ? 'expanded' : 'standard'}|${selected.map(provider => provider.id).sort().join(',')}`
    const emit = typeof options.emit === 'function' ? options.emit : () => {}
    options.signal?.throwIfAborted()
    const hit = cache.get(key)
    if (hit && Date.now() < hit.expiresAt && !options.refresh) {
      for (const entry of hit.entries) { options.signal?.throwIfAborted(); emit({ type: 'source', ...entry }) }
      return { ...hit.payload, cached: true }
    }
    const searchDeadlineAt = Date.now() + searchTimeoutMs
    const deadline = AbortSignal.timeout(searchTimeoutMs)
    const requestSignal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
    const entries = await Promise.all(selected.map(provider => limit(async () => {
      let searchUrl = provider.browseUrl || provider.baseUrl
      try { searchUrl = provider.buildUrl(query) } catch {}
      const started = Date.now()
      const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(options.expanded ? 50000 : providerTimeoutMs)])
      const state = { signal, deadlineAt: Math.min(searchDeadlineAt, started + (options.expanded ? 50000 : providerTimeoutMs)), maxPages: options.expanded ? 40 : provider.id === 'mediafire-rr3' ? 16 : provider.id === 'vosan' ? 24 : 8, requests: [], progress: null }
      let payload, error
      try {
        signal.throwIfAborted()
        const task = withSearchContext(state, () => {
          const adapter = adapterMap.get(provider.id)
          return adapter ? adapter(query, perSource) : genericSearch(provider, query, perSource)
        })
        payload = await new Promise((resolve, reject) => {
          const abort = () => reject(signal.reason)
          signal.addEventListener('abort', abort, { once: true })
          Promise.resolve(task).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort))
          if (signal.aborted) abort()
        })
        if (payload?.error || payload?.status === 'error') error = payload.error || 'Source search failed.'
        if (!error && !payload?.pagesFetched && !payload?.results?.length) error = 'A fonte não forneceu uma página de resultados.'
      } catch (failure) {
        error = signal.aborted ? 'Tempo limite da consulta excedido.' : failure instanceof Error ? failure.message : 'Source search failed.'
        payload = state.progress || payload
      }
      const results = prepareResults(payload?.results, query, provider, perSource)
      const failedRequests = state.requests.filter(request => !request.recovered && !request.optional && (request.error || request.status >= 400 || request.status === 202))
      if (!error && state.requests.length && failedRequests.length === state.requests.length && !results.length) error = failedRequests[0].error || `HTTP ${failedRequests[0].status}: a fonte não pôde ser consultada.`
      if (!error && !results.length && payload?.failedPages?.length && !payload.pagesFetched) error = payload.failedPages[0].error
      const failure = error || payload?.failedPages?.length ? sourceFailure(error || payload.failedPages[0].error, failedRequests) : null
      const truncated = (payload?.results?.length || 0) > perSource || payload?.hasMore === true || payload?.stopReason === 'result-limit' || payload?.stopReason === 'page-limit'
      const sections = payload?.sections || state.progress?.sections || []
      const totalAvailable = payload?.totalAvailable ?? state.progress?.totalAvailable
      const coverage = { depth: options.expanded ? 'expanded' : 'standard',
        status: error || failedRequests.length || payload?.failedPages?.length ? 'partial' : truncated ? 'limited' : payload?.stopReason === 'exhausted' ? 'query-complete' : 'unverified',
        hasMore: truncated, stopReason: signal.aborted ? 'time-limit' : truncated ? payload?.stopReason === 'exhausted' ? 'result-limit' : payload?.stopReason || 'result-limit' : payload?.stopReason || 'not-verified',
        totalAvailable: Number.isFinite(totalAvailable) ? totalAvailable : null,
        sections, checkedSections: sections.filter(section => state.requests.some(request => {
          const verified = request.status >= 200 && request.status < 300 && request.status !== 202
          if (!verified) return false
          if (request.url.startsWith(section)) return true
          if (provider.id === 'mediafire-rr3') {
            const folderKey = new URL(section).pathname.match(/^\/folder\/([^/]+)/)?.[1]
            return folderKey && new URL(request.url).searchParams.get('folder_key') === folderKey
          }
          return false
        })),
        requests: state.requests.map(({ url, status, error, optional, recovered }) => ({ url, status: status || null, ...(error ? { error } : {}), ...(optional ? { optional: true } : {}), ...(recovered ? { recovered: true } : {}) })),
        failedPages: payload?.failedPages || [],
      }
      const source = { provider: provider.id, name: provider.name, searchUrl,
        status: error ? 'error' : 'ok', count: results.length,
        pagesFetched: Number(payload?.pagesFetched || 0), durationMs: Date.now() - started,
        ...(failure || {}), coverage,
      }
      const entry = { source, results }
      if (!options.signal?.aborted) emit({ type: 'source', ...entry })
      return entry
    })))
    options.signal?.throwIfAborted()
    const results = prepareResults(entries.flatMap(entry => entry.results), query, {}, Number.MAX_SAFE_INTEGER)
    const sources = entries.map(entry => entry.source)
    const payload = { query, results, sources, total: results.length, totalResults: results.length,
      providerCount: selected.length, searchedProviders: sources.length, completed: sources.length,
      successfulProviders: sources.filter(source => source.status === 'ok').length,
      automotiveOnly: true, freeOnly: false, marketMode: 'free+paid', cached: false, finishedAt: new Date().toISOString() }
    cache.set(key, { entries, payload, expiresAt: Date.now() + (sources.some(source => source.status === 'error' || source.coverage.status === 'partial') ? Math.min(cacheTtlMs, 30000) : cacheTtlMs) })
    if (cache.size > 120) cache.delete(cache.keys().next().value)
    return payload
  }
}
