import { API_BASE, requestSignal, responseError } from './config'

export type ClassicStatus = 'ok' | 'empty' | 'blocked' | 'access-required' | 'rate-limit' | 'timeout' | 'error' | 'mismatch'
export interface ClassicListing { id: string; title: string; url: string; imageUrl: string | null }
export interface ClassicSearch {
  query: string; searchUrl: string; status: ClassicStatus; message: string; retryAt?: string
  listings: ClassicListing[]; page: number; hasMore: boolean; limited?: boolean
}
export interface ClassicPhoto { id: string; url: string; caption: string; sourceUrl: string }
export interface ClassicGallery {
  id?: string; query: string; title: string; sourceUrl: string; searchUrl: string
  status: ClassicStatus; message: string; kind?: 'public-gallery' | 'preview-only'
  images: ClassicPhoto[]; expiresAt?: string; limited?: boolean; maxPhotos: number; maxZipBytes: number
}
export async function findClassicCars(title: string, page: number, signal: AbortSignal): Promise<ClassicSearch> {
  const response = await fetch(`${API_BASE}/api/classic/references?${new URLSearchParams({ title, page: String(page) })}`, { signal: requestSignal(signal, 20000) })
  if (!response.ok) throw await responseError(response)
  const payload = await response.json()
  if (!Array.isArray(payload.listings) || !payload.status || !payload.searchUrl) throw new Error('Resposta de referências inválida.')
  return payload
}
export async function getClassicGallery(title: string, url: string, signal: AbortSignal): Promise<ClassicGallery> {
  const response = await fetch(`${API_BASE}/api/classic/references/gallery?${new URLSearchParams({ title, url })}`, { signal: requestSignal(signal, 20000) })
  if (!response.ok) throw await responseError(response)
  const payload = await response.json()
  if (!Array.isArray(payload.images) || !payload.status) throw new Error('Resposta de galeria inválida.')
  return payload
}
export async function downloadClassicZip(galleryId: string, ids: string[], all: boolean, signal: AbortSignal) {
  const response = await fetch(`${API_BASE}/api/classic/references/zip`, {
    method: 'POST', signal: requestSignal(signal, 120000), headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ galleryId, ids, all }),
  })
  if (!response.ok) throw await responseError(response)
  if (!response.headers.get('content-type')?.includes('application/zip')) throw new Error('A fonte não retornou um ZIP válido.')
  const blob = await response.blob()
  if (!blob.size) throw new Error('O ZIP retornado está vazio.')
  return blob
}
