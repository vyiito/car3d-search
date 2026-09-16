import { providers } from './providers.js'
import { searchAll } from './search.js'
import { searchBrasilSimulatorMods } from './brasil-adapter.js'
import { search3DSky } from './3dsky-adapter.js'
import { searchVosan } from './vosan-adapter.js'
import { searchOvertake } from './overtake-adapter.js'
import { searchVertexNative } from './vertex-adapter.js'
import { nativeMarketAdapters } from './market-adapters.js'
import { search3DBaza, searchWireWheels } from './catalog-adapters.js'
import { searchCGMoodV2, searchZifir, search3ddd } from './remaining-adapters.js'
import { searchRenderHubClean, search3dCarClean } from './commerce-adapters.js'
import { searchCGTraderMarketV2 } from './cgtrader-adapter.js'

const providerMap = new Map(providers.map(provider => [provider.id, provider]))

const explicitAdapters = new Map([
  ['brasil-simulator-mods', searchBrasilSimulatorMods],
  ['3dsky', search3DSky],
  ['vosan', searchVosan],
  ['overtake', searchOvertake],
  ['vertex-warehouse', searchVertexNative],
  ['3d-baza', search3DBaza],
  ['wire-wheels-club', searchWireWheels],
  ['cgmood', searchCGMoodV2],
  ['zifir3d', searchZifir],
  ['renderhub', searchRenderHubClean],
  ['3ddd-ru', search3ddd],
  ['3dcar-ru', search3dCarClean],
  ['cgtrader', searchCGTraderMarketV2],
])

const nativeAdapterEntries = Object.entries(nativeMarketAdapters).filter(([id]) => !explicitAdapters.has(id))
export const progressiveNativeIds = [...new Set([...explicitAdapters.keys(), ...nativeAdapterEntries.map(([id]) => id)])]

function normalizeMarketResult(result) {
  if (!result) return result
  const price = typeof result.price === 'number' && Number.isFinite(result.price) ? result.price : null
  let isFree = result.isFree
  if (price === 0) isFree = true
  else if (price !== null && price > 0) isFree = false
  return { ...result, price, isFree }
}

function sourceMeta(id, query) {
  const provider = providerMap.get(id)
  let searchUrl = provider?.baseUrl || ''
  try { searchUrl = provider?.buildUrl ? provider.buildUrl(query) : (provider?.browseUrl || provider?.baseUrl || '') } catch {}
  return {
    provider: id,
    name: provider?.name || id,
    searchUrl,
  }
}

function cleanPayload(payload) {
  const results = Array.isArray(payload?.results) ? payload.results.map(normalizeMarketResult).filter(Boolean) : []
  return {
    results,
    pagesFetched: Number(payload?.pagesFetched || 0),
    error: payload?.error || null,
  }
}

async function runAdapter(id, adapter, query, perSource, emit) {
  const started = Date.now()
  const meta = sourceMeta(id, query)
  try {
    const payload = cleanPayload(await adapter(query, perSource))
    const source = {
      ...meta,
      status: payload.error ? 'error' : 'ok',
      count: payload.results.length,
      pagesFetched: payload.pagesFetched,
      durationMs: Date.now() - started,
      ...(payload.error ? { error: payload.error } : {}),
    }
    emit({ type: 'source', source, results: payload.results })
    return source
  } catch (error) {
    const source = {
      ...meta,
      status: 'error',
      count: 0,
      pagesFetched: 0,
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
    emit({ type: 'source', source, results: [] })
    return source
  }
}

export async function progressiveSearch(query, options = {}) {
  const perSource = Math.max(1, Math.min(Number(options.perSource || 60), 80))
  const emit = typeof options.emit === 'function' ? options.emit : () => {}
  const completed = []

  const nativeTasks = [
    ...[...explicitAdapters.entries()].map(([id, adapter]) => runAdapter(id, adapter, query, perSource, emit)),
    ...nativeAdapterEntries.map(([id, adapter]) => runAdapter(id, adapter, query, perSource, emit)),
  ]

  const genericTask = searchAll(query, {
    perSource,
    excludeIds: progressiveNativeIds,
    onSource: source => {
      const results = Array.isArray(source.results) ? source.results.map(normalizeMarketResult) : []
      const cleanSource = { ...source }
      delete cleanSource.results
      emit({ type: 'source', source: cleanSource, results })
    },
  })

  const settled = await Promise.allSettled([...nativeTasks, genericTask])
  for (const entry of settled) if (entry.status === 'fulfilled' && entry.value?.provider) completed.push(entry.value)

  return {
    query,
    providerCount: providers.length,
    finishedAt: new Date().toISOString(),
  }
}
