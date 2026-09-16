import type { GlobalSearchResult, SourceSearchStatus } from './search'

const API_BASE = (import.meta.env.VITE_SEARCH_API_URL || 'https://car3d-search-api.onrender.com').replace(/\/$/, '')

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
}

export interface ProgressiveCallbacks {
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
  try { return JSON.parse(data) } catch { return null }
}

export async function progressiveSearch(query: string, callbacks: ProgressiveCallbacks = {}, signal?: AbortSignal, perSource = 60) {
  const safePerSource = Math.max(1, Math.min(perSource, 80))
  const url = `${API_BASE}/api/search/stream?q=${encodeURIComponent(query)}&perSource=${safePerSource}`
  const response = await fetch(url, { signal, headers: { Accept: 'text/event-stream' } })
  if (!response.ok) throw new Error(`API ${response.status}`)
  if (!response.body) throw new Error('Streaming response unavailable.')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  const handle = (payload: any) => {
    if (!payload || typeof payload !== 'object') return
    if (payload.type === 'source') callbacks.onSource?.(payload as ProgressiveSourceEvent)
    else if (payload.type === 'done') callbacks.onDone?.(payload as ProgressiveDoneEvent)
    else if (payload.type === 'error') callbacks.onError?.(String(payload.error || 'Progressive search failed.'))
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const blocks = buffer.split(/\r?\n\r?\n/)
    buffer = blocks.pop() || ''
    for (const block of blocks) handle(parseEventBlock(block))
  }

  buffer += decoder.decode()
  if (buffer.trim()) handle(parseEventBlock(buffer))
}
