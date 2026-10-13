export function parsePerSource(value, fallback = 60, maximum = 80) {
  const number = Number(value ?? fallback)
  return Number.isFinite(number) ? Math.max(1, Math.min(Math.floor(number), maximum)) : fallback
}
export function searchOptions(query) {
  const q = String(query.q || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  const expanded = query.depth === 'expanded'
  const sourceIds = [...new Set(String(query.source || '').split(',').map(value => value.trim()).filter(Boolean))]
  return { q, perSource: parsePerSource(query.perSource, expanded ? 200 : 60, expanded ? 200 : 80), expanded, sourceIds }
}
