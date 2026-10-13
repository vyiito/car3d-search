import { API_BASE, requestSignal, responseError } from './config'
import { normalizeSearchResult } from '../../server/src/search-core.js'

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
  priceLabel?: string | null
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
  game?: string | null
  year: number | null
  vehicleClass: 'Car' | 'SUV' | 'Race Car' | 'Motorcycle' | 'Truck / Pickup' | 'Van' | 'Bus' | 'Utility / Tractor' | string
  score: number
  includedVehicles?: string[]
  tags?: string[]
  isModelListing?: boolean
}

export interface SourceCoverage {
  depth: 'standard' | 'expanded'
  status: 'query-complete' | 'limited' | 'partial' | 'unverified'
  hasMore: boolean
  stopReason: string
  totalAvailable: number | null
  sections: string[]
  checkedSections?: string[]
  requests: Array<{ url: string; status: number | null; error?: string }>
  failedPages: Array<{ url: string; error: string }>
}

export interface SourceSearchStatus {
  provider: string
  name: string
  status: 'ok' | 'error'
  count: number
  pagesFetched?: number
  searchUrl: string
  durationMs: number
  error?: string
  coverage?: SourceCoverage
}

export interface GlobalSearchResponse {
  query: string
  total: number
  providerCount: number
  searchedProviders: number
  successfulProviders: number
  automotiveOnly?: boolean
  freeOnly?: boolean
  marketMode?: 'free+paid' | string
  results: GlobalSearchResult[]
  sources: SourceSearchStatus[]
  cached: boolean
}

export async function globalSearch(query: string, signal?: AbortSignal, perSource = 60): Promise<GlobalSearchResponse> {
  const safePerSource = Number.isFinite(perSource) ? Math.max(1, Math.min(Math.floor(perSource), 80)) : 60
  const url = `${API_BASE}/api/search?q=${encodeURIComponent(query)}&perSource=${safePerSource}`
  const response = await fetch(url, { signal: requestSignal(signal) })
  if (!response.ok) throw await responseError(response)
  const payload = await response.json()
  if (!Array.isArray(payload.results) || !Array.isArray(payload.sources)) throw new Error('Resposta de pesquisa inválida.')
  return { ...payload, results: payload.results.map((item: GlobalSearchResult) => normalizeSearchResult(item)).filter(Boolean) }
}

export async function expandedSourceSearch(query: string, sourceId: string, signal?: AbortSignal): Promise<GlobalSearchResponse> {
  const params = new URLSearchParams({ q: query, source: sourceId, depth: 'expanded', perSource: '200', refresh: '1' })
  const response = await fetch(`${API_BASE}/api/search?${params}`, { signal: requestSignal(signal) })
  if (!response.ok) throw await responseError(response)
  const payload = await response.json()
  if (!Array.isArray(payload.results) || !Array.isArray(payload.sources)) throw new Error('Resposta de pesquisa inválida.')
  return { ...payload, results: payload.results.map((item: GlobalSearchResult) => normalizeSearchResult(item)).filter(Boolean) }
}

export async function getResultDetails(result: GlobalSearchResult, signal?: AbortSignal): Promise<GlobalSearchResult> {
  const url = `${API_BASE}/api/details?sourceId=${encodeURIComponent(result.sourceId)}&url=${encodeURIComponent(result.sourceUrl)}`
  const response = await fetch(url, { signal: requestSignal(signal, 30000) })
  if (!response.ok) throw await responseError(response)
  const details = await response.json()

  return {
    ...result,
    ...details,
    title: details.title || result.title,
    imageUrl: details.imageUrl || result.imageUrl,
    gallery: details.gallery?.length ? details.gallery : (result.gallery?.length ? result.gallery : result.imageUrl ? [result.imageUrl] : []),
    formats: details.formats?.length ? details.formats : result.formats,
    author: details.author || result.author,
    description: details.description || result.description,
    fileSize: details.fileSize || result.fileSize,
    game: details.game || result.game || null,
    year: details.year || result.year,
    priceLabel: details.priceLabel || result.priceLabel || null,
    downloadUrl: details.downloadUrl ?? null,
    downloadStatus: details.downloadUrl ? 'direct' : details.downloadActionUrl ? 'source' : (details.downloadStatus || 'unavailable'),
  }
}

export function vjDirectDownloadUrl(result: GlobalSearchResult) {
  if (!result.downloadUrl) return null
  return `${API_BASE}/api/download?sourceId=${encodeURIComponent(result.sourceId)}&url=${encodeURIComponent(result.sourceUrl)}`
}
