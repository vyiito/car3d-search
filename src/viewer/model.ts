import { findFile, VIEWER_LIMITS, type ModelBundle } from './files'

export type PreparedModel = { data: ArrayBuffer; document?: Record<string, any>; binary?: Uint8Array<ArrayBuffer> }

/** Validate the file and local dependencies before importing Three.js or creating a GPU context. */
export async function prepareModel(bundle: ModelBundle, path: string, signal: AbortSignal): Promise<PreparedModel> {
  signal.throwIfAborted()
  const file = bundle.files.get(path)
  if (!file) throw new Error('O arquivo principal não está neste pacote.')
  const data = await file.arrayBuffer()
  signal.throwIfAborted()
  if (/\.obj$/i.test(path)) return { data }
  let document: Record<string, any>, binary: Uint8Array<ArrayBuffer> | undefined
  if (/\.glb$/i.test(path)) {
    if (data.byteLength < 20) throw new Error('Este GLB está incompleto.')
    const header = new DataView(data)
    if (header.getUint32(0, true) !== 0x46546c67 || header.getUint32(4, true) !== 2 || header.getUint32(8, true) !== data.byteLength) throw new Error('Este GLB está incompleto ou não é glTF 2.0.')
    const jsonLength = header.getUint32(12, true)
    if (jsonLength > data.byteLength - 20 || header.getUint32(16, true) !== 0x4e4f534a) throw new Error('O GLB contém uma estrutura inválida.')
    document = JSON.parse(new TextDecoder().decode(new Uint8Array(data, 20, jsonLength)))
    if (28 + jsonLength <= data.byteLength) binary = new Uint8Array(data, 28 + jsonLength)
  } else document = JSON.parse(new TextDecoder().decode(data))
  if (!document || document.asset?.version !== '2.0') throw new Error('Este visualizador aceita glTF 2.0.')
  if ((document.nodes?.length || 0) > 10000 || (document.materials?.length || 0) > 512 || (document.images?.length || 0) > 512) throw new Error('O modelo contém peças, materiais ou imagens demais para a prévia.')
  const parent = path.slice(0, path.lastIndexOf('/') + 1)
  for (const value of [...(document.buffers || []), ...(document.images || [])]) if (value.uri && !/^data:/i.test(value.uri)) {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value.uri)) throw new Error('O modelo referencia um endereço externo. Selecione uma cópia local com seus arquivos e texturas.')
    if (!findFile(bundle, value.uri, parent)) throw new Error(`Falta o arquivo ${value.uri}. Abra a pasta completa do modelo.`)
  }
  for (const accessor of document.accessors || []) if (accessor.count > 6_000_000) throw new Error('O modelo excede os limites de geometria do visualizador.')
  const geometrySize = (document.meshes || []).flatMap((mesh: any) => mesh.primitives || []).reduce((sum: number, primitive: any) => sum + (document.accessors?.[primitive.indices ?? primitive.attributes?.POSITION]?.count || 0), 0)
  if (geometrySize > VIEWER_LIMITS.triangles * 3) throw new Error('A malha excede 2 milhões de triângulos. Use uma versão com menos polígonos.')
  for (const buffer of document.buffers || []) if (buffer.byteLength > VIEWER_LIMITS.model) throw new Error('Um buffer do modelo excede 128 MB.')
  for (const buffer of document.bufferViews || []) if (buffer.byteLength > VIEWER_LIMITS.model || (buffer.extensions?.EXT_meshopt_compression?.count || 0) * (buffer.extensions?.EXT_meshopt_compression?.byteStride || 0) > VIEWER_LIMITS.model) throw new Error('A geometria descomprimida excede os limites da prévia.')
  return { data, document, binary }
}
