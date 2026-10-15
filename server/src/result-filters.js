import { marketKind, matchesGame, normalizeFormats, isVehicleResult } from './search-core.js'

export function filterResults(items, filters, skip = null) {
  const from = Number(filters.yearFrom) || null, to = Number(filters.yearTo) || null
  return items.filter(result => {
    if (!isVehicleResult(result)) return false
    const price = marketKind(result)
    const formats = normalizeFormats(result.formats)
    return (skip === 'price' || filters.priceMode === 'Todos' || price === ({ 'Grátis': 'free', Pago: 'paid', 'Não informado': 'unknown' })[filters.priceMode])
      && (filters.kind === 'Todos' || result.sourceType === (filters.kind === '3D Model' ? '3d-models' : 'game-mods'))
      && (skip === 'vehicle' || filters.vehicleClass === 'Todos' || result.vehicleClass === filters.vehicleClass)
      && (skip === 'format' || !filters.selectedFormats.length || normalizeFormats(filters.selectedFormats).some(format => formats.includes(format)))
      && (skip === 'source' || !filters.selectedSources.length || filters.selectedSources.includes(result.sourceId) || filters.selectedSources.includes(result.source))
      && (skip === 'game' || !filters.selectedGames.length || filters.selectedGames.some(game => matchesGame(result.game, game)))
      && (filters.downloadMode === 'Todos' || (filters.downloadMode === 'Direto' ? Boolean(result.downloadUrl) : result.downloadStatus !== 'unavailable' && result.downloadable !== false && !result.downloadUrl))
      && (filters.imageMode === 'Todos' || (filters.imageMode === 'Com imagem' ? Boolean(result.imageUrl) : !result.imageUrl))
      && ((!from && !to) || (Number.isInteger(result.year) && (!from || result.year >= from) && (!to || result.year <= to)))
  })
}

export function sortResults(items, mode) {
  const relevance = (a, b) => b.score - a.score || a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
  if (mode === 'Mix de fontes') {
    const groups = new Map()
    for (const item of [...items].sort(relevance)) { const group = groups.get(item.sourceId) || []; group.push(item); groups.set(item.sourceId, group) }
    const ordered = [...groups.values()].sort((a, b) => relevance(a[0], b[0]))
    const mixed = []
    for (let index = 0; mixed.length < items.length; index++) for (const group of ordered) if (group[index]) mixed.push(group[index])
    return mixed
  }
  return [...items].sort((a, b) => {
    if (mode === 'Ano do veículo ↓') return (b.year || 0) - (a.year || 0) || relevance(a, b)
    if (mode === 'Menor preço' || mode === 'Maior preço') {
      const aKnown = typeof a.price === 'number', bKnown = typeof b.price === 'number'
      if (aKnown !== bKnown) return aKnown ? -1 : 1
      if (aKnown && bKnown) return (mode === 'Menor preço' ? a.price - b.price : b.price - a.price) || relevance(a, b)
    }
    if (mode === 'Nome A-Z') return a.title.localeCompare(b.title) || relevance(a, b)
    if (mode === 'Fonte') return a.source.localeCompare(b.source) || relevance(a, b)
    return relevance(a, b)
  })
}
