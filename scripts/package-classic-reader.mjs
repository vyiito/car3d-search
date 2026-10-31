import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { zipSync } from 'fflate'

const root = new URL('../', import.meta.url)
const files = ['manifest.json', 'background.js', 'vj-bridge.js', 'classic-page.js', 'LEIA-ME.txt']
const entries = Object.fromEntries(await Promise.all(files.map(async name => [`classic-reader/${name}`, await readFile(new URL(`classic-reader/${name}`, root))])))
await mkdir(new URL('public/', root), { recursive: true })
await writeFile(new URL('public/classic-reader.zip', root), zipSync(entries))
console.log(`CLASSIC Reader empacotado: ${fileURLToPath(new URL('public/classic-reader.zip', root))}`)
