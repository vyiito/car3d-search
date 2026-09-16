export interface DownloadCandidate {
  url: string
  label: string
  kind: 'direct' | 'action'
}

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
  downloadActionUrl?: string | null
  downloadStatus?: 'direct' | 'source' | 'unavailable'
  downloadCandidates?: DownloadCandidate[]
  gallery?: string[]
  license?: string | null
  detailsFetchedAt?: string | null
  author: string | null
  description: string | null
  fileSize: string | null
  brand: string | null
  year: number | null
  vehicleClass: 'Car' | 'SUV' | 'Race Car' | 'Motorcycle' | 'Truck / Pickup' | 'Van' | 'Bus' | 'Utility / Tractor' | string
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
  automotiveOnly?: boolean
  freeOnly?: boolean
  results: GlobalSearchResult[]
  sources: SourceSearchStatus[]
  cached: boolean
}

const API_BASE = (import.meta.env.VITE_SEARCH_API_URL || 'https://car3d-search-api.onrender.com').replace(/\/$/, '')

export async function globalSearch(query: string, signal?: AbortSignal, perSource = 40): Promise<GlobalSearchResponse> {
  const safePerSource = Math.max(1, Math.min(perSource, 50))
  const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&perSource=${safePerSource}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response.json()
}

export async function getResultDetails(result: GlobalSearchResult, signal?: AbortSignal): Promise<GlobalSearchResult> {
  const url = `${API_BASE}/api/details?sourceId=${encodeURIComponent(result.sourceId)}&url=${encodeURIComponent(result.sourceUrl)}`
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`API ${response.status}`)
  const details = await response.json()

  return {
    ...result,
    ...details,
    title: details.title || result.title,
    imageUrl: details.imageUrl || result.imageUrl,
    gallery: details.gallery?.length ? details.gallery : (result.imageUrl ? [result.imageUrl] : []),
    formats: details.formats?.length ? details.formats : result.formats,
    author: details.author || result.author,
    description: details.description || result.description,
    fileSize: details.fileSize || result.fileSize,
    year: details.year || result.year,
    downloadUrl: details.downloadUrl || result.downloadUrl,
    downloadStatus: details.downloadUrl ? 'direct' : details.downloadActionUrl ? 'source' : (details.downloadStatus || result.downloadStatus || 'unavailable'),
  }
}
