export function parsePerSource(value, fallback = 60) {
  const number = Number(value ?? fallback)
  return Number.isFinite(number) ? Math.max(1, Math.min(Math.floor(number), 80)) : fallback
}
export function searchOptions(query) {
  const q = String(query.q || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  return { q, perSource: parsePerSource(query.perSource) }
}
