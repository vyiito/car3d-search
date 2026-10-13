import { normalizeText, isKnownGameQuery } from './search-core.js'

export function vehicleQueryVariants(query) {
  const normalized = normalizeText(query), variants = [String(query).trim()]
  if (/\bsupra\b/.test(normalized)) {
    if (/\bmk4\b/.test(normalized)) variants.push(query.replace(/mk[\s-]*(?:4|iv)\b/i, 'A80'))
    if (/\b(?:a80|jza80)\b/.test(normalized)) variants.push(query.replace(/\b(?:a80|jza80)\b/i, 'MK4'))
  }
  const modelToken = normalized.split(' ').find(token => /^(?:e\d{2}|w\d{3}|r\d{2}|a\d{2}|jza\d{2}|fd3s|fc3s|gc8|fk[278]|mk[2-6])$/.test(token))
  if (modelToken && normalized.split(' ').length > 1) variants.push(modelToken)
  return [...new Set(variants)].slice(0, 3)
}

export function isGameQuery(query) {
  return isKnownGameQuery(query)
}
