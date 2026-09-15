export interface GlobalSearchResult {
  id: string
  title: string
  source: string
  sourceId: string
  sourceType: '3d-models' | 'game-mods'
  sourceUrl: string
  imageUrl: string | null
  formats: string[]
  price: number | null
  isFree: boolean | null
  downloadable: boolean | null
  downloadUrl: string | null
  author: string | null
  description: string | null
  fileSize: string | null
  score: number
}

export interface SourceSearchStatus {
  provider: string
  name: string
  status: 'ok' | 'error'
  count: number
  searchUrl: string
  durationMs: number
  error?: string
}

export interface GlobalSearchResponse {
  query: string
  total: number
  providerCount: number
  searchedProviders: number
  successfulProviders: number
  results: GlobalSearchResult[]
  sources: SourceSearchStatus[]
  cached: boolean
}

const API_BASE = (import.meta.env.VITE_SEARCH_API_URL || 'https://car3d-search-api.onrender.com').replace(/\/$/, '')

export async function globalSearch(query: string, signal?: AbortSignal): Promise<GlobalSearchResponse> {
  const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&perSource=40`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json()
}
