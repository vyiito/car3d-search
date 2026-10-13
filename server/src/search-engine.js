import pLimit from 'p-limit'
import { prepareResults, normalizeText } from './search-core.js'
import { parsePerSource } from './search-options.js'
import { withSearchSignal } from './search-context.js'

// REST and SSE use one engine: one adapter and one status per provider.
export function createSearchEngine({ providerList, adapterMap, genericSearch,
  concurrency = Number(process.env.SEARCH_CONCURRENCY || 8), providerTimeoutMs = 20000,
  searchTimeoutMs = 55000, cacheTtlMs = Number(process.env.CACHE_TTL_MS || 600000) }) {
  const cache = new Map()
  const limit = pLimit(Number.isInteger(concurrency) && concurrency > 0 ? concurrency : 8)
  return async function search(query, options = {}) {
    const perSource = parsePerSource(options.perSource)
    const key = `${normalizeText(query)}|${perSource}`
    const emit = typeof options.emit === 'function' ? options.emit : () => {}
    options.signal?.throwIfAborted()
    const hit = cache.get(key)
    if (hit && Date.now() < hit.expiresAt && !options.refresh) {
      for (const entry of hit.entries) { options.signal?.throwIfAborted(); emit({ type: 'source', ...entry }) }
      return { ...hit.payload, cached: true }
    }
    const deadline = AbortSignal.timeout(searchTimeoutMs)
    const requestSignal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline
    const entries = await Promise.all(providerList.map(provider => limit(async () => {
      let searchUrl = provider.browseUrl || provider.baseUrl
      try { searchUrl = provider.buildUrl(query) } catch {}
      const started = Date.now()
      const signal = AbortSignal.any([requestSignal, AbortSignal.timeout(providerTimeoutMs)])
      let payload, error
      try {
        signal.throwIfAborted()
        const task = withSearchSignal(signal, () => {
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
      }
      const results = prepareResults(payload?.results, query, provider, perSource)
      const source = { provider: provider.id, name: provider.name, searchUrl,
        status: error ? 'error' : 'ok', count: results.length,
        pagesFetched: Number(payload?.pagesFetched || 0), durationMs: Date.now() - started,
        ...(error ? { error } : {}),
      }
      const entry = { source, results }
      if (!options.signal?.aborted) emit({ type: 'source', ...entry })
      return entry
    })))
    options.signal?.throwIfAborted()
    const results = prepareResults(entries.flatMap(entry => entry.results), query, {}, Number.MAX_SAFE_INTEGER)
    const sources = entries.map(entry => entry.source)
    const payload = { query, results, sources, total: results.length, totalResults: results.length,
      providerCount: providerList.length, searchedProviders: sources.length, completed: sources.length,
      successfulProviders: sources.filter(source => source.status === 'ok').length,
      automotiveOnly: true, freeOnly: false, marketMode: 'free+paid', cached: false, finishedAt: new Date().toISOString() }
    cache.set(key, { entries, payload, expiresAt: Date.now() + (sources.some(source => source.status === 'error') ? Math.min(cacheTtlMs, 30000) : cacheTtlMs) })
    if (cache.size > 120) cache.delete(cache.keys().next().value)
    return payload
  }
}
