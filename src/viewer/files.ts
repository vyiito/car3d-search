import { unzip, type UnzipFileInfo } from 'fflate'

export const VIEWER_LIMITS = { bytes: 256 * 1024 ** 2, expanded: 384 * 1024 ** 2, model: 128 * 1024 ** 2, files: 512, pixels: 96 * 1024 ** 2, triangles: 2_000_000 }
const supported = /\.(obj|mtl|glb|gltf|bin|png|jpe?g|webp|bmp|dds|tga|ktx2)$/i
export const isModel = (name: string) => /\.(obj|glb|gltf)$/i.test(name)
export type ViewerSource = { files: File[]; label?: string }
export type ModelBundle = { files: Map<string, File>; models: string[]; label: string }
export const aborted = () => new DOMException('Abertura cancelada.', 'AbortError')

export function cleanPath(value: string): string {
  let decoded = value
  try { decoded = decodeURIComponent(value) } catch { /* Some filenames contain a literal %. */ }
  const segments: string[] = []
  for (const part of decoded.replace(/\\/g, '/').split('/')) {
    if (!part || part === '.') continue
    if (part === '..') { if (!segments.length) throw new Error('O pacote contém um caminho fora da pasta do modelo.'); segments.pop() }
    else segments.push(part)
  }
  return segments.join('/')
}

export function findFile(bundle: ModelBundle, request: string, parent = ''): [string, File] | undefined {
  if (/^(?:https?:|\/\/|data:|blob:)/i.test(request)) return undefined
  const wanted = cleanPath(`${parent}${request}`).toLowerCase()
  const exact = [...bundle.files].find(([path]) => path.toLowerCase() === wanted)
  if (exact) return exact
  const suffix = cleanPath(request).toLowerCase()
  const candidates = [...bundle.files].filter(([path]) => path.toLowerCase().endsWith('/' + suffix) || path.toLowerCase() === suffix)
  if (candidates.length === 1) return candidates[0]
  const basename = suffix.split('/').pop()
  const matches = [...bundle.files].filter(([path]) => path.split('/').pop()?.toLowerCase() === basename)
  return matches.length === 1 ? matches[0] : undefined
}

function archiveEntries(data: Uint8Array, signal: AbortSignal): Promise<Map<string, File>> {
  return new Promise((resolve, reject) => {
    let total = 0, count = 0
    const paths = new Map<string, string>()
    let cancel: (() => void) | undefined
    const abort = () => { cancel?.(); reject(aborted()) }
    signal.addEventListener('abort', abort, { once: true })
    const finish = () => signal.removeEventListener('abort', abort)
    const validate = (entry: UnzipFileInfo) => {
      if (++count > VIEWER_LIMITS.files * 2) throw new Error('Este ZIP contém arquivos demais. Selecione somente a pasta do modelo.')
      total += entry.originalSize
      if (total > VIEWER_LIMITS.expanded) throw new Error('O ZIP descompactado excede 384 MB. Abra um modelo menor.')
      if (/^(?:[a-z]:|[\\/])/i.test(entry.name) || entry.name.split(/[\\/]/).includes('..')) throw new Error('O ZIP contém um caminho inválido.')
      if (entry.name.endsWith('/') || !supported.test(entry.name)) return false
      const path = cleanPath(entry.name)
      if (paths.has(path.toLowerCase())) throw new Error('O ZIP tem nomes de arquivos duplicados ou ambíguos.')
      if (paths.size >= VIEWER_LIMITS.files || entry.originalSize > (isModel(path) || /\.bin$/i.test(path) ? VIEWER_LIMITS.model : 32 * 1024 ** 2)) throw new Error('Um arquivo do ZIP excede os limites do visualizador.')
      paths.set(path.toLowerCase(), path)
      return false
    }
    try {
      // First pass validates central-directory sizes and names without inflating any entry.
      unzip(data, { filter: validate }, error => {
        if (signal.aborted) { finish(); reject(aborted()); return }
        if (error) { finish(); reject(error); return }
        try {
          cancel = unzip(data, { filter: entry => paths.has(cleanPath(entry.name).toLowerCase()) && !entry.name.endsWith('/') }, (failure, entries) => {
            finish()
            if (signal.aborted) { reject(aborted()); return }
            if (failure) { reject(new Error('Não foi possível ler este ZIP. Confira se o arquivo está completo.')); return }
            const files = new Map<string, File>()
            for (const [name, bytes] of Object.entries(entries)) {
              const path = paths.get(cleanPath(name).toLowerCase())!
              files.set(path, new File([bytes as Uint8Array<ArrayBuffer>], path.split('/').pop()!))
            }
            resolve(files)
          })
        } catch (failure) { finish(); reject(failure) }
      })
      if (signal.aborted) abort()
    } catch (failure) { finish(); reject(failure) }
  })
}

export async function prepareBundle(source: ViewerSource, signal: AbortSignal): Promise<ModelBundle> {
  signal.throwIfAborted()
  if (!source.files.length) throw new Error('Selecione um modelo ou a pasta com seus arquivos.')
  if (source.files.length > VIEWER_LIMITS.files) throw new Error('Selecione até 512 arquivos da mesma pasta.')
  if (source.files.reduce((sum, file) => sum + file.size, 0) > VIEWER_LIMITS.bytes) throw new Error('A seleção excede 256 MB. Abra um modelo menor.')
  const archives = source.files.filter(file => /\.zip$/i.test(file.name))
  let files: Map<string, File>
  if (archives.length) {
    if (source.files.length !== 1) throw new Error('Abra um ZIP por vez, sem misturá-lo com outros arquivos.')
    const data = new Uint8Array(await archives[0].arrayBuffer())
    signal.throwIfAborted()
    files = await archiveEntries(data, signal)
  } else {
    files = new Map()
    const used = new Set<string>()
    for (const file of source.files.filter(file => supported.test(file.name))) {
      const path = cleanPath(file.webkitRelativePath || file.name)
      if (used.has(path.toLowerCase())) throw new Error('Há arquivos com o mesmo nome. Selecione a pasta para preservar seus caminhos.')
      if (file.size > (isModel(path) || /\.bin$/i.test(path) ? VIEWER_LIMITS.model : 32 * 1024 ** 2)) throw new Error(`O arquivo ${file.name} é grande demais para a prévia.`)
      used.add(path.toLowerCase()); files.set(path, file)
    }
  }
  signal.throwIfAborted()
  const models = [...files.keys()].filter(isModel).sort((a, b) => a.localeCompare(b))
  if (!models.length) throw new Error('Nenhum modelo encontrado. Abra GLB, glTF ou OBJ com seus materiais e texturas; o KN5 deve ser convertido primeiro.')
  return { files, models, label: source.label || archives[0]?.name || source.files[0].webkitRelativePath?.split('/')[0] || source.files[0].name }
}
