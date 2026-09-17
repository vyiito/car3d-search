import type { GlobalSearchResult } from './search'

export type ReferenceAngle = 'front' | 'rear' | 'side' | 'three-quarter' | 'interior' | 'wheel' | 'engine' | 'details' | 'reference' | string

export interface ReferenceImage {
  id: string
  angle: ReferenceAngle
  angleLabel: string
  angleConfidence?: 'metadata' | 'query' | 'fallback' | string
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
  matchLevel?: 'exact' | 'model' | 'generation' | 'family' | 'alias' | 'specialized-gallery' | string
  identityScore?: number
  identityEngine?: string
  sourceKind?: 'specialized' | string
  modelingGroup?: 'exterior' | 'details' | 'interior' | 'mechanical' | 'technical' | 'reference' | string
  galleryTitle?: string | null
}

export interface ReferenceSearchLink { id: string; label: string; url: string; kind?: string }
export interface ReferenceSourceGroup { source: string; count: number; downloadable: number; referenceOnly: number; galleries: number; angles: number }
export interface ReferenceSourceStatus { name: string; status: 'ok' | 'error' | string; count: number; durationMs?: number; error?: string }
export interface ModelingCoverage { groups: Record<string, number>; targets: Record<string, number>; readiness: number }
export interface PrimaryReferenceSet { source: string; title: string; sourcePage: string; count: number; angles: number }

export interface ReferencePack {
  packId: string
  query: string
  canonicalVehicle?: string
  queryVariants?: Array<{ query: string; matchLevel: string }>
  title: string
  brand: string | null
  year: number | null
  images: ReferenceImage[]
  downloadableCount: number
  angleCoverage: string[]
  webSearch?: ReferenceSearchLink[]
  sourceGroups?: ReferenceSourceGroup[]
  sourceStatus?: ReferenceSourceStatus[]
  primarySet?: PrimaryReferenceSet | null
  modelingCoverage?: ModelingCoverage
  identity?: {
    brand?: string | null
    model?: string | null
    year?: number | null
    vehicleClass?: string | null
    vehicleKind?: string | null
    engine?: string
  }
  createdAt: string
  expiresInSeconds: number
}

const API_BASE = (import.meta.env.VITE_SEARCH_API_URL || 'https://car3d-search-api.onrender.com').replace(/\/$/, '')
const GAME_NOISE_RE = /\b(?:forza(?: horizon)?\s*\d*|forza motorsport|assetto corsa(?: competizione)?|gran turismo(?: sport|\s*\d+)?|csr racing\s*\d*|real racing\s*\d*|carx(?: drift racing| street)?|beamng(?:\.drive)?|need for speed(?: heat| unbound| no limits| mobile)?|gta\s*(?:iv|v|4|5)|euro truck simulator\s*2|american truck simulator)\b/gi
const FORMAT_NOISE_RE = /\b(?:fbx|obj|blend|blender|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|kn5|dds|textures?|pbr|low[- ]?poly|high[- ]?poly|game[- ]?ready)\b/gi
const MARKET_NOISE_RE = /\b(?:free|premium|download|asset|converted|conversion|ripped|rip|extract(?:ed)?|port(?:ed)?|addon|add-on|version|pack|3d\s*model)\b/gi
const CATALOG_NOISE_RE = /\b(?:individual cars?|individual vehicles?|car mods?|vehicle mods?|gallery|collection|vosan|vertex warehouse|3d cad browser|3dexport|renderhub|cgmood|3d-baza|roh3d|blendkit|sketchfab|cgtrader)\b/gi
const YEAR_RE = /\b(?:19[3-9]\d|20[0-3]\d)\b/g
const LISTING_SUFFIX_RE = /\s*[-–—]\s*(?:lm|lms|hq|hd|lod\d*|pack|asset|mod|render)\s*$/i
const DECIMAL_GENERATION_RE = /\b\d{3}\.(?:\d+|[ivx]+)\b/gi

function stripAuthorNoise(value: string, result: GlobalSearchResult) {
  let next = value
  const author = String(result.author || '').trim()
  if (author.length >= 2) {
    const escaped = author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    next = next.replace(new RegExp(`(?:\\s*[-–—|·]\\s*)?${escaped}[®™©]?\\s*$`, 'i'), ' ')
  }
  return next.replace(/(?:\s*[-–—|·]\s*)?[A-Za-z0-9._-]{2,40}[®™©]\s*$/u, ' ').replace(/\s+/g, ' ').trim()
}

function cleanVehicleReferenceTitle(result: GlobalSearchResult) {
  const brand = result.brand?.trim() || ''
  let value = stripAuthorNoise(String(result.title || ''), result)
    .replace(/\s*\|\s*[^|]{1,40}$/g, ' ')
    .replace(LISTING_SUFFIX_RE, ' ')
    .replace(/\([^)]*(?:3d\s*model|fbx|obj|blend|stl|3ds|max|c4d|forza|assetto|gran turismo|download|\b\d{5,}\b)[^)]*\)/gi, ' ')
    .replace(/\(\s*\d{5,}\s*\)/g, ' ')
    .replace(/\[[^\]]*(?:fbx|obj|blend|stl|game|mod|download|\b\d{5,}\b)[^\]]*\]/gi, ' ')
    .replace(GAME_NOISE_RE, ' ').replace(FORMAT_NOISE_RE, ' ').replace(MARKET_NOISE_RE, ' ').replace(CATALOG_NOISE_RE, ' ')
    .replace(/(?:US\$|R\$|\$|€|£)\s*\d+(?:[.,]\d{1,2})?/gi, ' ').replace(/\b(?:IE[- ]?)?\d{1,3}%\b/gi, ' ')
    .replace(/[|_]+/g, ' ').replace(/\s+/g, ' ').trim()
  value = value.replace(YEAR_RE, ' ').replace(/\s+/g, ' ').trim()
  if (brand) {
    const lower = value.toLowerCase(), index = lower.indexOf(brand.toLowerCase())
    if (index >= 0) {
      const suffix = value.slice(index + brand.length).trim()
      const modelTokens = suffix.split(/\s+/).filter(token => !/^\d{5,}$/.test(token)).filter(token => !/^(?:car|cars|vehicle|vehicles|automobile|render|scene)$/i.test(token)).slice(0, 7)
      value = [brand, ...modelTokens].join(' ').trim()
    } else if (value && !value.toLowerCase().startsWith(brand.toLowerCase())) value = `${brand} ${value}`.trim()
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, 110)
}

function simplifiedVehicleTitle(value: string) {
  return value
    .replace(DECIMAL_GENERATION_RE, ' ')
    .replace(/\b(?:mk\s*(?:i{1,4}|v|vi{0,3}|\d+)|jza\d{2,3}|a\d{2,3}|r\d{2,3}|e\d{2,3}|f\d{2,3}|g\d{2,3}|w\d{2,3}|fd3s|na\d+)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function referenceCandidates(result: GlobalSearchResult) {
  const raw = stripAuthorNoise(String(result.title || '').trim(), result)
  const cleaned = cleanVehicleReferenceTitle(result)
  const simplified = simplifiedVehicleTitle(cleaned)
  const noYearRaw = raw.replace(YEAR_RE, ' ').replace(LISTING_SUFFIX_RE, ' ').replace(/\s*\|\s*[^|]{1,40}$/g, ' ').replace(/\s+/g, ' ').trim()
  const seen = new Set<string>()
  return [cleaned, simplified, noYearRaw, raw]
    .map(title => title.trim())
    .filter(title => title.length >= 2)
    .filter(title => { const key = title.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true })
}
function hasTrustedYear(result: GlobalSearchResult) { return Boolean(result.year && new RegExp(`\\b${String(result.year)}\\b`).test(String(result.title || ''))) }

async function requestReferencePack(result: GlobalSearchResult, title: string, includeYear: boolean, signal?: AbortSignal): Promise<ReferencePack> {
  const url = new URL(`${API_BASE}/api/references`)
  url.searchParams.set('title', title)
  if (result.brand) url.searchParams.set('brand', result.brand)
  if (result.vehicleClass) url.searchParams.set('vehicleClass', result.vehicleClass)
  if (includeYear && hasTrustedYear(result)) url.searchParams.set('year', String(result.year))
  url.searchParams.set('perAngle', '5')
  const response = await fetch(url.href, { signal, cache: 'no-store', headers: { 'cache-control': 'no-cache', pragma: 'no-cache' } })
  if (!response.ok) throw new Error(`Reference API ${response.status}`)
  return response.json()
}

export async function getReferencePack(result: GlobalSearchResult, signal?: AbortSignal): Promise<ReferencePack> {
  const candidates = referenceCandidates(result)
  let lastPack: ReferencePack | null = null
  let bestPack: ReferencePack | null = null
  for (let index = 0; index < candidates.length; index += 1) {
    const pack = await requestReferencePack(result, candidates[index], index === 0, signal)
    lastPack = pack
    if (!bestPack || pack.images.length > bestPack.images.length || (pack.images.length === bestPack.images.length && pack.angleCoverage.length > bestPack.angleCoverage.length)) bestPack = pack
    if (pack.images.length >= 6 && pack.angleCoverage.length >= 3) return pack
  }
  return bestPack || lastPack || requestReferencePack(result, result.title, false, signal)
}

export function referencePackDownloadUrl(packId: string, imageIds: string[]) {
  const url = new URL(`${API_BASE}/api/reference-pack.zip`)
  url.searchParams.set('packId', packId)
  if (imageIds.length) url.searchParams.set('ids', imageIds.join(','))
  return url.href
}
