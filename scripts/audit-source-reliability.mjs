import { writeFile } from 'node:fs/promises'
import { progressiveSearch } from '../server/src/progressive-search.js'

const output = process.argv[2] || '.qa/source-reliability-results.json'
const checks = [
  { query: 'Ford Bronco DR' },
  { query: 'Ford Bronco', sourceIds: ['3d-baza','zifir3d','3dexport','renderhub','gta5-mods'] },
  { query: 'Ford', sourceIds: ['wire-wheels-club'] },
]
const audits = []
for (const check of checks) {
  const payload = await progressiveSearch(check.query, { sourceIds: check.sourceIds, perSource: 20, refresh: true })
  const sources = payload.sources.map(source => ({ ...source, examples: payload.results.filter(row => row.sourceId === source.provider).slice(0, 2).map(({ title, sourceUrl, imageUrl, priceLabel }) => ({ title, sourceUrl, imageUrl, priceLabel })) }))
  audits.push({ query: check.query, sourceCount: payload.providerCount, total: payload.total, sources })
  console.log(JSON.stringify({ query: check.query, total: payload.total, sources: sources.map(({ provider, status, count, failureKind, durationMs }) => ({ provider, status, count, failureKind, durationMs })) }))
}
await writeFile(output, JSON.stringify({ generatedAt: new Date().toISOString(), perSource: 20, audits }, null, 2) + '\n')
