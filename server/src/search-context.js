import { AsyncLocalStorage } from 'node:async_hooks'

const context = new AsyncLocalStorage()
export const withSearchSignal = (signal, task) => context.run({ signal }, task)
export const withSearchContext = (state, task) => context.run(state, task)
export const searchContext = () => context.getStore()
export const searchPageLimit = (fallback = 8) => context.getStore()?.maxPages || fallback
export function searchCheckpoint(payload) {
  const state = context.getStore()
  if (!state) return
  state.progress = { ...state.progress, ...payload }
}
export async function searchFetch(url, options = {}) {
  const state = context.getStore(), signal = state?.signal
  const request = { url: String(url), method: options.method || 'GET' }
  if (state?.requests) state.requests.push(request)
  try {
    const response = await globalThis.fetch(url, { ...options, ...(signal ? { signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal } : {}) })
    request.status = response.status
    return response
  } catch (error) { request.error = error.message; throw error }
}
