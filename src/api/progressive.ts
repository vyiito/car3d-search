import type { GlobalSearchResult, SourceSearchStatus } from './search'
import { API_BASE, requestSignal, responseError } from './config'
import { normalizeSearchResult, isVehicleResult } from '../../server/src/search-core.js'

export interface ProgressiveSourceEvent {
  type: 'source'
  source: SourceSearchStatus
  results: GlobalSearchResult[]
  completed: number
  totalResults: number
}

export interface ProgressiveDoneEvent {
  type: 'done'
  query: string
  providerCount: number
  completed: number
  totalResults: number
  finishedAt: string
  successfulProviders?: number
}

export interface ProgressiveCallbacks {
  onStart?: (event: { providerCount: number }) => void
  onSource?: (event: ProgressiveSourceEvent) => void
  onDone?: (event: ProgressiveDoneEvent) => void
  onError?: (message: string) => void
}

function parseEventBlock(block: string) {
  const data = block
    .split(/\r?\n/)
    .filter(line => line.startsWith('data:'))
    .map(line => line.slice(5).trimStart())
    .join('\n')
  if (!data) return null
  return JSON.parse(data)
}

export async function progressiveSearch(query: string, callbacks: ProgressiveCallbacks = {}, signal?: AbortSignal, perSource = 60, refresh = false) {
  const safePerSource = Math.max(1, Math.min(perSource, 80))
  const url = `${API_BASE}/api/search/stream?q=${encodeURIComponent(query)}&perSource=${safePerSource}${refresh ? '&refresh=1' : ''}`
  const response = await fetch(url, { signal: requestSignal(signal), headers: { Accept: 'text/event-stream' } })
  if (!response.ok) throw await responseError(response)
  if (!response.headers.get('content-type')?.includes('text/event-stream')) throw new Error('Resposta progressiva inválida.')
  if (!response.body) throw new Error('Streaming response unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let completed = false

  const handle = (payload: any) => {
    if (!payload || typeof payload !== 'object') return
    if (payload.type === 'start') callbacks.onStart?.(payload)
    else if (payload.type === 'source') {
      if (!payload.source || !Array.isArray(payload.results)) throw new Error('Evento de fonte inválido.')
      payload.results = payload.results.map((item: GlobalSearchResult) => normalizeSearchResult(item)).filter((item: GlobalSearchResult | null) => item && isVehicleResult(item))
      callbacks.onSource?.(payload as ProgressiveSourceEvent)
    }
    else if (payload.type === 'done') { completed = true; callbacks.onDone?.(payload as ProgressiveDoneEvent) }
    else if (payload.type === 'error') { const message = String(payload.error || 'A busca falhou.'); callbacks.onError?.(message); throw new Error(message) }
  }

  try { while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) handle(parseEventBlock(block))
  }

  buffer += decoder.decode()
  if (buffer.trim()) handle(parseEventBlock(buffer))
  if (!completed) throw new Error('A conexão terminou antes de concluir a pesquisa. Os resultados recebidos foram preservados.')
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
