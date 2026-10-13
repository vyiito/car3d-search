import type { GlobalSearchResult } from '../../src/api/search'
export interface FilterState {
  priceMode: string; kind: string; vehicleClass: string; selectedFormats: string[];
  selectedSources: string[]; selectedGames: string[]; downloadMode: string;
  imageMode: string; yearFrom: string; yearTo: string;
}
export function filterResults(items: GlobalSearchResult[], filters: FilterState, skip?: string | null): GlobalSearchResult[]
export function sortResults(items: GlobalSearchResult[], mode: string): GlobalSearchResult[]
