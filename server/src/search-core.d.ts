import type { GlobalSearchResult } from '../../src/api/search'
export function normalizeText(value: unknown): string
export function canonicalGame(value: unknown): string
export function matchesGame(actual: unknown, selected: unknown): boolean
export function normalizeFormats(values: unknown): string[]
export function marketKind(result: Partial<GlobalSearchResult>): 'free' | 'paid' | 'unknown'
export function formatPrice(result: Partial<GlobalSearchResult>): string
export function resultKey(result: Pick<GlobalSearchResult, 'sourceId' | 'sourceUrl'>): string
export function relevanceScore(result: Partial<GlobalSearchResult>, query: string): number
export function normalizeSearchResult(result: GlobalSearchResult, provider?: Record<string, unknown>): GlobalSearchResult | null
export function prepareResults(items: GlobalSearchResult[], query: string, provider?: Record<string, unknown>, limit?: number): GlobalSearchResult[]
