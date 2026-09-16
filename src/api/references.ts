import type { GlobalSearchResult } from './search'

export type ReferenceAngle = 'front' | 'rear' | 'side' | 'three-quarter' | 'interior' | 'wheel' | 'engine' | 'details' | 'reference' | string

export interface ReferenceImage {
  id: string
  angle: ReferenceAngle
  angleLabel: string
  angleConfidence?: 'metadata' | 'fallback' | string
  title: string
  imageUrl: string
  thumbnailUrl: string
  sourcePage: string
  source: string
  provider: string | null
  creator: string
  creatorUrl: string | null
  license: string
  licenseVersion: string | null
  licenseUrl: string | null
  width: number | null
  height: number | null
  downloadAllowed: boolean
  redistributionNote: string
  matchLevel?: 'exact' | 'generation' | 'family' | 'alias' | string
}

export interface ReferenceSearchLink {
  id: string
  label: string
  url: string
}

export interface ReferencePack {
  packId: string
  query: string
  queryVariants?: Array<{ query: string; matchLevel: string }>
  title: string
  brand: string | null
  year: number | null
  images: ReferenceImage[]
  downloadableCount: number
  angleCoverage: string[]
  webSearch?: ReferenceSearchLink[]
  createdAt: string
  expiresInSeconds: number
}

const API_BASE = (import.meta.env.VITE_SEARCH_API_URL || 'https://car3d-search-api.onrender.com').replace(/\/$/, '')

export async function getReferencePack(result: GlobalSearchResult, signal?: AbortSignal): Promise<ReferencePack> {
  const url = new URL(`${API_BASE}/api/references`)
  url.searchParams.set('title', result.title)
  if (result.brand) url.searchParams.set('brand', result.brand)
  if (result.year) url.searchParams.set('year', String(result.year))
  url.searchParams.set('perAngle', '4')
  const response = await fetch(url.href, { signal })
  if (!response.ok) throw new Error(`Reference API ${response.status}`)
  return response.json()
}

export function referencePackDownloadUrl(packId: string, imageIds: string[]) {
  const url = new URL(`${API_BASE}/api/reference-pack.zip`)
  url.searchParams.set('packId', packId)
  if (imageIds.length) url.searchParams.set('ids', imageIds.join(','))
  return url.href
}
