import pLimit from 'p-limit'
import { prepareResults, normalizeText } from './search-core.js'
import { parsePerSource } from './search-options.js'
import { withSearchContext } from './search-context.js'
import { sourceFailure } from './source-failures.js'

// REST and SSE use one engine: one adapter and one status per provider.
export function createSearchEngine({ providerList, adapterMap, genericSearch,
  concurrency = Number(process.env.SEARCH_CONCURRENCY || 8), providerTimeoutMs = 26000,
  searchTimeoutMs = 65000, cacheTtlMs = Number(process.env.CACHE_TTL_MS || 600000), failureCacheTtlMs = 5000, accessBackoffMs = 300000 }) {
  const cache = new Map(), backoff = new Map(), flights = new Map()
  const limit = pLimit(Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 8)
  const priority = ['renderhub', 'sketchfab', '3dwarehouse', 'gta5-mods', 'blendkit', 'assettohub', 'brasil-simulator-mods', '3drush']
  const rank = provider => { const index = priority.indexOf(provider.id); return index < 0 ? priority.length : index }
  const remember = (key, value) => { cache.delete(key); cache.set(key, value); if (cache.size > 400) cache.delete(cache.keys().next().value) }

  async function run(query, options, selected, perSource, emit) {
    const searchDeadlineAt = Date.now() + searchTimeoutMs
    const deadline = AbortSignal.timeout(searchTimeoutMs)
    const requestSignal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
    const ordered = [...selected].sort((a, b) => rank(a) - rank(b))
    const completed = await Promise.all(ordered.map(provider => {
      const cacheKey = `${provider.id}|${normalizeText(query)}|${perSource}|${options.expanded ? 'expanded' : 'standard'}`
      const hit = cache.get(cacheKey)
      let searchUrl = provider.browseUrl || provider.baseUrl
      try { searchUrl = provider.buildUrl(query) } catch {}
      if (!options.refresh && hit && Date.now() < hit.expiresAt) {
        remember(cacheKey, hit)
        const entry = { ...hit.entry, source: { ...hit.entry.source, searchUrl, cached: true }, fromCache: true }
        emit({ type: 'source', source: entry.source, results: entry.results }); return entry
      }
      const denied = backoff.get(provider.id)
      if (!options.refresh && !options.expanded && denied && Date.now() < denied.until) {
        const historical = hit && Date.now() < hit.staleUntil && hit.entry.results.length ? hit.entry.results : []
        const source = { provider: provider.id, name: provider.name, searchUrl, status: 'error', count: historical.length, pagesFetched: 0, durationMs: 0,
          ...denied.failure, deferred: true, cached: Boolean(historical.length), stale: Boolean(historical.length), checkedAt: denied.checkedAt, retryAt: new Date(denied.until).toISOString(),
          coverage: { depth: 'standard', status: 'partial', hasMore: true, stopReason: 'access-backoff', sections: [], checkedSections: [], requests: [], failedPages: [], totalAvailable: null } }
        const entry = { source, results: historical, fromCache: true }; emit({ type: 'source', source, results: historical }); return entry
      }
      return limit(async () => {
        const started = Date.now()
        const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(options.expanded ? 50000 : providerTimeoutMs)])
        const state = { signal, deadlineAt: Math.min(searchDeadlineAt, started + (options.expanded ? 50000 : providerTimeoutMs)), maxPages: options.expanded ? 40 : provider.id === 'mediafire-rr3' ? 16 : provider.id === 'vosan' ? 24 : 8, requests: [], progress: null }
        let payload, error, settled = false, published = ''
        state.onCheckpoint = progress => {
          if (settled || signal.aborted) return
          const results = prepareResults(progress.results, query, provider, perSource)
          const signature = results.map(item => item.id).join('|')
          if (!results.length || signature === published) return
          published = signature
          emit({ type: 'source', interim: true, results, source: { provider: provider.id, name: provider.name, searchUrl, status: 'ok', count: results.length,
            pagesFetched: progress.pagesFetched || 0, durationMs: Date.now() - started,
            coverage: { depth: options.expanded ? 'expanded' : 'standard', status: 'limited', hasMore: true, stopReason: 'searching', sections: progress.sections || [], checkedSections: [], requests: [], failedPages: [] } } })
        }
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
        settled = true
        let results = prepareResults(payload?.results, query, provider, perSource)
        const stale = Boolean(error && hit && Date.now() < hit.staleUntil && hit.entry.results.length)
        if (stale) results = prepareResults([...results, ...hit.entry.results], query, provider, perSource)
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
          pagesFetched: Number(payload?.pagesFetched || 0), durationMs: Date.now() - started, checkedAt: new Date().toISOString(), ...(stale ? { cached: true, stale: true, cachedAt: hit.entry.source.cachedAt || hit.entry.source.checkedAt } : {}),
          ...(failure || {}), coverage,
        }
        const entry = { source, results }
        if (!options.signal?.aborted) {
          const accessFailure = source.status === 'error' && ['blocked', 'access-required', 'rate-limit'].includes(source.failureKind)
            && (!source.pagesFetched || source.failureKind !== 'blocked')
          const ttl = accessFailure ? source.failureKind === 'rate-limit' ? 60000 : accessBackoffMs : source.status === 'error' || source.coverage.status === 'partial' ? failureCacheTtlMs : cacheTtlMs
          if (accessFailure) { source.retryAt = new Date(Date.now() + ttl).toISOString(); backoff.set(provider.id, { until: Date.now() + ttl, checkedAt: source.checkedAt, failure: { ...failure } }) }
          else if (source.status === 'ok') backoff.delete(provider.id)
          remember(cacheKey, { entry, expiresAt: Date.now() + ttl, staleUntil: stale ? hit.staleUntil : Date.now() + 24 * 60 * 60 * 1000 })
        }
        if (!options.signal?.aborted) emit({ type: 'source', ...entry })
        return entry
      })
    }))
    const byId = new Map(completed.map(entry => [entry.source.provider, entry]))
    const entries = selected.map(provider => byId.get(provider.id))
    options.signal?.throwIfAborted()
    const results = prepareResults(entries.flatMap(entry => entry.results), query, {}, Number.MAX_SAFE_INTEGER)
    const sources = entries.map(entry => entry.source)
    const payload = { query, results, sources, total: results.length, totalResults: results.length,
      providerCount: selected.length, searchedProviders: sources.length, completed: sources.length,
      successfulProviders: sources.filter(source => source.status === 'ok').length,
      automotiveOnly: true, freeOnly: false, marketMode: 'free+paid', cached: entries.every(entry => entry.fromCache), finishedAt: new Date().toISOString() }
    return payload
  }

  return function search(query, options = {}) {
    const selected = options.sourceIds?.length ? providerList.filter(provider => options.sourceIds.includes(provider.id)) : providerList
    if (options.sourceIds?.some(id => !providerList.some(provider => provider.id === id))) return Promise.reject(new Error('Unknown provider'))
    if (options.signal?.aborted) return Promise.reject(options.signal.reason)
    const perSource = parsePerSource(options.perSource, options.expanded ? 200 : 60, options.expanded ? 200 : 80)
    const key = `${normalizeText(query)}|${perSource}|${options.expanded ? 'expanded' : 'standard'}|${selected.map(provider => provider.id).sort().join(',')}|${Boolean(options.refresh)}`
    let flight = flights.get(key)
    if (!flight) {
      flight = { controller: new AbortController(), listeners: new Set(), events: new Map(), consumers: 0, done: false }
      flights.set(key, flight)
      const current = flight
      const emit = event => { if (!current.controller.signal.aborted) { current.events.set(event.source.provider, event); for (const listener of current.listeners) listener(event) } }
      current.task = Promise.resolve().then(() => run(query, { ...options, signal: current.controller.signal }, selected, perSource, emit)).finally(() => {
        current.done = true; if (flights.get(key) === current) flights.delete(key)
      })
    }
    const current = flight
    return new Promise((resolve, reject) => {
      const listener = event => options.emit?.(event)
      current.consumers++; current.listeners.add(listener)
      for (const event of current.events.values()) listener(event)
      let attached = true
      const detach = () => {
        if (!attached) return false
        attached = false; current.listeners.delete(listener); options.signal?.removeEventListener('abort', abort); current.consumers--
        if (!current.consumers && !current.done) { current.controller.abort(); if (flights.get(key) === current) flights.delete(key) }
        return true
      }
      const abort = () => { if (detach()) reject(options.signal.reason) }
      options.signal?.addEventListener('abort', abort, { once: true })
      current.task.then(value => { if (detach()) resolve(value) }, error => { if (detach()) reject(error) })
      if (options.signal?.aborted) abort()
    })
  }
}
