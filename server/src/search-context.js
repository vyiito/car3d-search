import { AsyncLocalStorage } from 'node:async_hooks'

const context = new AsyncLocalStorage()
export const withSearchSignal = (signal, task) => context.run(signal, task)
export function searchFetch(url, options = {}) {
  const signal = context.getStore()
  return globalThis.fetch(url, { ...options, ...(signal ? { signal: options.signal ? AbortSignal.any([signal, options.signal]) : signal } : {}) })
}
