import fs from 'node:fs'

function replaceOnce(text, before, after, label) {
  const count = text.split(before).length - 1
  if (count !== 1) throw new Error(`${label}: expected 1 match, found ${count}`)
  return text.replace(before, after)
}

const path = 'server/src/reference-adapter.js'
let text = fs.readFileSync(path, 'utf8')

text = replaceOnce(
  text,
  `const GENERATION_RE = /\\b(?:mk\\s?(?:i{1,4}|v|vi{0,3}|\\d+)|a\\d{2,3}|jza\\d{2,3}|e\\d{2,3}|r\\d{2,3}|s\\d{2,3}|sg\\d|gc\\d|gd\\d|w\\d{2,3})\\b/gi`,
  `const GENERATION_RE = /\\b(?:mk\\s?(?:i{1,4}|v|vi{0,3}|\\d+)|a\\d{2,3}|jza\\d{2,3}|e\\d{2,3}|r\\d{2,3}|s\\d{2,3}|sg\\d|gc\\d|gd\\d|w\\d{2,3})\\b/gi\nconst GAME_NOISE_RE = /\\b(?:forza(?: horizon)?\\s*\\d*|forza motorsport|assetto corsa(?: competizione)?|gran turismo(?: sport|\\s*\\d+)?|csr racing\\s*\\d*|real racing\\s*\\d*|carx(?: drift racing| street)?|beamng(?:\\.drive)?|need for speed(?: heat| unbound| no limits| mobile)?|gta\\s*(?:iv|v|4|5)|euro truck simulator\\s*2|american truck simulator)\\b/gi\nconst ASSET_NOISE_RE = /\\b(?:converted|conversion|ripped|rip|addon|add-on|extract(?:ed)?|port(?:ed)?|hq|uhd|4k|8k|pbr|lod\\s*\\d*|v\\d+(?:\\.\\d+)*)\\b/gi\nconst FORMAT_NOISE_RE = /\\b(?:fbx|obj|blend|blender|stl|3ds|max|c4d|dae|gltf|glb|3mf|skp|ma|mb|kn5|dds|textures?)\\b/gi\n\nconst ALIAS_RULES = [\n  { test: /\\b(?:toyota\\s+)?supra\\b.*\\b(?:mk\\s*4|mk\\s*iv|a80|jza80)\\b/i, values: ['Toyota Supra MK4','Toyota Supra A80','Toyota Supra JZA80'] },\n  { test: /\\b(?:nissan\\s+)?(?:skyline\\s+)?(?:gt-?r\\s+)?r34\\b/i, values: ['Nissan Skyline GT-R R34','Nissan Skyline R34'] },\n  { test: /\\bbmw\\s+m3\\s+e46\\b/i, values: ['BMW M3 E46'] },\n  { test: /\\bmazda\\s+rx-?7\\b.*\\b(?:fd|fd3s)\\b/i, values: ['Mazda RX-7 FD','Mazda RX-7 FD3S'] },\n  { test: /\\bhonda\\s+nsx\\b.*\\b(?:na1|na2)\\b/i, values: ['Honda NSX NA1','Honda NSX'] },\n  { test: /\\bporsche\\s+911\\b.*\\b992\\b/i, values: ['Porsche 911 992'] },\n  { test: /\\bsubaru\\s+impreza\\b.*\\b(?:gc8|gd)\\b/i, values: ['Subaru Impreza WRX STI GC8','Subaru Impreza WRX STI'] },\n]`,
  'reference aliases',
)

const oldVehicle = `function vehicleBaseQuery({ title, brand, year }) {
  const raw = clean(title)
    .replace(/\\b(?:3d\\s*model|asset|download|free|premium|mod|game[- ]?ready|low[- ]?poly|high[- ]?poly)\\b/gi, ' ')
    .replace(/\\([^)]*(?:fbx|obj|blend|stl|3ds|max|c4d|game|mod)[^)]*\\)/gi, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
  const pieces = []
  if (year && !raw.includes(String(year))) pieces.push(String(year))
  if (brand && !raw.toLowerCase().includes(String(brand).toLowerCase())) pieces.push(clean(brand))
  pieces.push(raw)
  return clean(pieces.join(' ')).slice(0, 110)
}`
const newVehicle = `function vehicleBaseQuery({ title, brand, year }) {
  const raw = clean(title)
    .replace(/\\b(?:3d\\s*model|asset|download|free|premium|mod|game[- ]?ready|low[- ]?poly|high[- ]?poly)\\b/gi, ' ')
    .replace(/\\([^)]*(?:fbx|obj|blend|stl|3ds|max|c4d|game|mod|forza|assetto|gran turismo)[^)]*\\)/gi, ' ')
    .replace(/\\[[^\\]]*(?:fbx|obj|blend|stl|game|mod|forza|assetto|gran turismo|csr|carx)[^\\]]*\\]/gi, ' ')
    .replace(GAME_NOISE_RE, ' ')
    .replace(ASSET_NOISE_RE, ' ')
    .replace(FORMAT_NOISE_RE, ' ')
    .replace(/[|_]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim()
  const pieces = []
  if (year && !raw.includes(String(year))) pieces.push(String(year))
  if (brand && !raw.toLowerCase().includes(String(brand).toLowerCase())) pieces.push(clean(brand))
  pieces.push(raw)
  return clean(pieces.join(' ')).slice(0, 110)
}`
text = replaceOnce(text, oldVehicle, newVehicle, 'vehicle query cleanup')

const oldVariants = `function queryVariants(baseQuery) {
  const exact = clean(baseQuery)
  const noYear = clean(exact.replace(YEAR_RE, ' '))
  const family = clean(noYear.replace(GENERATION_RE, ' '))
  const variants = [
    { query: exact, matchLevel: 'exact' },
    { query: noYear, matchLevel: 'generation' },
    { query: family, matchLevel: 'family' },
  ]
  const seen = new Set()
  return variants.filter(item => item.query.length > 1 && !seen.has(item.query.toLowerCase()) && seen.add(item.query.toLowerCase()))
}`
const newVariants = `function queryVariants(baseQuery) {
  const exact = clean(baseQuery)
  const noYear = clean(exact.replace(YEAR_RE, ' '))
  const family = clean(noYear.replace(GENERATION_RE, ' '))
  const variants = [
    { query: exact, matchLevel: 'exact' },
    { query: noYear, matchLevel: 'generation' },
    { query: family, matchLevel: 'family' },
  ]
  for (const rule of ALIAS_RULES) {
    if (!rule.test.test(exact)) continue
    for (const alias of rule.values) variants.push({ query: alias, matchLevel: 'alias' })
  }
  const seen = new Set()
  return variants.filter(item => item.query.length > 1 && !seen.has(item.query.toLowerCase()) && seen.add(item.query.toLowerCase()))
}`
text = replaceOnce(text, oldVariants, newVariants, 'query variants')

text = replaceOnce(
  text,
  `  let images = dedupe(batches.flat()).slice(0, 36)\n  if (!images.length) images = await searchGeneral(variants, Math.min(12, perAngle * 3))`,
  `  let images = dedupe(batches.flat()).slice(0, 36)\n  if (images.length < Math.min(12, perAngle * 3)) {\n    const general = await searchGeneral(variants, Math.min(12, perAngle * 3))\n    images = dedupe([...images, ...general]).slice(0, 36)\n  }`,
  'general name fallback',
)

text = replaceOnce(
  text,
  `    angleCoverage: [...new Set(images.map(image => image.angle))],\n    createdAt: new Date().toISOString(),`,
  `    angleCoverage: [...new Set(images.map(image => image.angle))],\n    webSearch: [\n      { id: 'google', label: 'GOOGLE IMAGES', url: \`https://www.google.com/search?tbm=isch&q=\${encodeURIComponent(variants[1]?.query || variants[0]?.query || baseQuery)}\` },\n      { id: 'bing', label: 'BING IMAGES', url: \`https://www.bing.com/images/search?q=\${encodeURIComponent(variants[1]?.query || variants[0]?.query || baseQuery)}\` },\n      { id: 'commons', label: 'WIKIMEDIA COMMONS', url: \`https://commons.wikimedia.org/w/index.php?search=\${encodeURIComponent(variants[1]?.query || variants[0]?.query || baseQuery)}&title=Special:MediaSearch&type=image\` },\n    ],\n    createdAt: new Date().toISOString(),`,
  'web fallback links',
)

fs.writeFileSync(path, text)
console.log('Reference search V2 applied successfully.')
