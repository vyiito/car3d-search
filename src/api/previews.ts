import type { GlobalSearchResult } from './search'
import { API_BASE, requestSignal } from './config'

const cache = new Map<string, { expires: number; images: string[] }>()
const waiting: Array<() => void> = []
let active = 0
function drain() { while (active < 4 && waiting.length) waiting.shift()!() }

function schedule<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const abort = () => { const index = waiting.indexOf(run); if (index >= 0) waiting.splice(index, 1); reject(signal.reason) }
    const run = () => {
      signal.removeEventListener('abort', abort)
      if (signal.aborted) { reject(signal.reason); return }
      active++
      task().then(resolve, reject).finally(() => { active--; drain() })
    }
    if (signal.aborted) { reject(signal.reason); return }
    signal.addEventListener('abort', abort, { once: true })
    waiting.push(run); drain()
  })
}

export async function recoverPreview(result: Pick<GlobalSearchResult, 'sourceId' | 'sourceUrl'>, signal: AbortSignal): Promise<string[]> {
  const key = result.sourceId + ':' + result.sourceUrl, hit = cache.get(key)
  if (hit && hit.expires > Date.now()) return hit.images
  return schedule(async () => {
    const params = new URLSearchParams({ sourceId: result.sourceId, url: result.sourceUrl })
    const response = await fetch(`${API_BASE}/api/preview?${params}`, { signal: requestSignal(signal, 12000) })
    if (!response.ok) return []
    const payload = await response.json()
    const images = [...new Set<string>((Array.isArray(payload.images) ? payload.images : []).filter((value: unknown) => typeof value === 'string' && /^https?:\/\//i.test(value)))]
    cache.set(key, { expires: Date.now() + (images.length ? 600000 : 120000), images })
    if (cache.size > 400) cache.delete(cache.keys().next().value!)
    return images
  }, signal)
}
