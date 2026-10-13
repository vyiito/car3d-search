import { canonicalGame, normalizeFormats } from '../server/src/search-core.js'

export function readSearchState(search: string) {
  const params = new URLSearchParams(search)
  const option = (key: string, values: string[], fallback = 'Todos') => values.includes(params.get(key) || '') ? params.get(key)! : fallback
  const values = (key: string) => [...new Set(params.getAll(key).map(value => value.trim()).filter(Boolean))]
  const year = (key: string) => { const value = Number(params.get(key)); return Number.isInteger(value) && value >= 1886 && value <= new Date().getFullYear() + 2 ? String(value) : '' }
  return {
    query: (params.get('q') || params.get('brand') || '').replace(/\s+/g, ' ').trim().slice(0, 120),
    brand: params.get('brand') || null, asset: params.get('asset') || null,
    priceMode: option('price', ['Todos', 'Grátis', 'Pago', 'Não informado']),
    kind: option('kind', ['Todos', '3D Model', 'Game Mod']),
    vehicleClass: option('vehicle', ['Todos', 'Car', 'SUV', 'Race Car', 'Motorcycle', 'Truck / Pickup', 'Van', 'Bus', 'Utility / Tractor']),
    selectedSources: values('source'), selectedFormats: normalizeFormats(values('format')),
    selectedGames: values('game').map(canonicalGame),
    downloadMode: option('download', ['Todos', 'Direto', 'Via fonte']),
    imageMode: option('image', ['Todos', 'Com imagem', 'Sem imagem']),
    yearFrom: year('from'), yearTo: year('to'),
    sortMode: option('sort', ['Mix de fontes', 'Relevância', 'Ano do veículo ↓', 'Menor preço', 'Maior preço', 'Nome A-Z', 'Fonte'], 'Relevância'),
    groupDuplicates: params.get('group') === '1',
  }
}

export function writeSearchState(state: ReturnType<typeof readSearchState>) {
  const params = new URLSearchParams()
  if (state.query) params.set('q', state.query)
  if (state.brand) params.set('brand', state.brand)
  if (state.asset) params.set('asset', state.asset)
  for (const [key, value] of Object.entries({ price: state.priceMode, kind: state.kind, vehicle: state.vehicleClass, download: state.downloadMode, image: state.imageMode })) {
    if (value !== 'Todos') params.set(key, value)
  }
  for (const [key, values] of [['source', state.selectedSources], ['format', state.selectedFormats], ['game', state.selectedGames]] as const) for (const value of values) params.append(key, value)
  if (state.yearFrom) params.set('from', state.yearFrom)
  if (state.yearTo) params.set('to', state.yearTo)
  if (state.sortMode !== 'Relevância') params.set('sort', state.sortMode)
  if (state.groupDuplicates) params.set('group', '1')
  return params.toString()
}
