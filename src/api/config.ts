export const API_BASE = (import.meta.env.VITE_SEARCH_API_URL || (import.meta.env.DEV ? '' : 'https://car3d-search-api.onrender.com')).replace(/\/$/, '')

export function requestSignal(signal?: AbortSignal, timeout = 75000) {
  const deadline = AbortSignal.timeout(timeout)
  return signal ? AbortSignal.any([signal, deadline]) : deadline
}

export async function responseError(response: Response) {
  const payload = await response.json().catch(() => null)
  return new Error(payload?.error || `A API respondeu com erro ${response.status}.`)
}
