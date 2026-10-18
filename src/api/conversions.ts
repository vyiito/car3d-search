import { API_BASE, requestSignal, responseError } from './config'

export type ConversionStatus = 'queued' | 'decrypting' | 'converting' | 'packaging' | 'uploading' | 'completed' | 'failed' | 'cancelled' | 'expired'
export type ConversionJob = {
  id: string; filename: string; status: ConversionStatus; progress: number; createdAt: number; updatedAt: number; expiresAt: number;
  queuePosition: number | null; error: string | null; outputBytes: number;
  report: null | { vertices: number; triangles: number; meshes: number; materials: number; textures: number; placeholderTextures: number }
}
export type SavedConversion = { job: ConversionJob; accessToken: string }
export type ConversionCapabilities = { enabled: boolean; online: boolean; maxInputBytes: number; maxOutputBytes: number; retentionMinutes: number; waiting: number }

export const terminalConversion = (job: ConversionJob) => ['completed', 'failed', 'cancelled', 'expired'].includes(job.status)
export async function converterCapabilities(signal?: AbortSignal): Promise<ConversionCapabilities> {
  const response = await fetch(`${API_BASE}/api/conversions/capabilities`, { signal: requestSignal(signal, 20000), cache: 'no-store' })
  if (!response.ok) throw await responseError(response)
  return response.json()
}
export async function getConversion(saved: SavedConversion, signal?: AbortSignal): Promise<ConversionJob> {
  const response = await fetch(`${API_BASE}/api/conversions/${saved.job.id}`, { headers: { Authorization: `Bearer ${saved.accessToken}` }, signal: requestSignal(signal, 15000), cache: 'no-store' })
  if (response.status === 404 || response.status === 410) return { ...saved.job, status: 'expired', error: 'Esta conversão expirou ou foi interrompida. Envie o arquivo novamente.' }
  if (!response.ok) throw await responseError(response)
  return response.json()
}
export async function cancelConversion(saved: SavedConversion): Promise<ConversionJob> {
  const response = await fetch(`${API_BASE}/api/conversions/${saved.job.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${saved.accessToken}` }, signal: requestSignal(undefined, 15000) })
  if (!response.ok) throw await responseError(response)
  return response.json()
}
export async function conversionDownload(saved: SavedConversion, signal?: AbortSignal): Promise<string> {
  const response = await fetch(`${API_BASE}/api/conversions/${saved.job.id}/download-ticket`, { method: 'POST', headers: { Authorization: `Bearer ${saved.accessToken}` }, signal: requestSignal(signal, 15000) })
  if (!response.ok) throw await responseError(response)
  const payload = await response.json()
  if (!/^\/api\/conversion-download\/[a-f0-9]{64}$/.test(payload.url)) throw new Error('Link de download inválido.')
  return API_BASE + payload.url
}
export async function conversionArchive(saved: SavedConversion, signal: AbortSignal): Promise<File> {
  const limit = 256 * 1024 ** 2
  if (saved.job.outputBytes > limit) throw new Error('Este ZIP excede 256 MB. Baixe-o e abra uma parte do modelo no visualizador.')
  const url = await conversionDownload(saved, signal)
  const response = await fetch(url, { signal: requestSignal(signal, 120000), cache: 'no-store' })
  if (!response.ok) throw await responseError(response)
  if (!response.body || Number(response.headers.get('content-length')) > limit) { await response.body?.cancel(); throw new Error('O arquivo excede o limite da prévia ou não está disponível.') }
  const reader = response.body.getReader(), chunks: Uint8Array<ArrayBuffer>[] = []
  let size = 0
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('O ZIP excede 256 MB. Baixe-o para selecionar um modelo menor.')
      chunks.push(value as Uint8Array<ArrayBuffer>)
    }
    signal.throwIfAborted()
    return new File(chunks, saved.job.filename.replace(/\.kn5$/i, '') + '-convertido.zip', { type: 'application/zip' })
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export function uploadConversion(file: File, progress: (percent: number) => void, signal: AbortSignal, carFolder = ''): Promise<SavedConversion> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', `${API_BASE}/api/conversions`)
    request.setRequestHeader('Content-Type', 'application/octet-stream')
    request.setRequestHeader('X-File-Name', encodeURIComponent(file.name))
    if (carFolder.trim()) request.setRequestHeader('X-Car-Folder', carFolder.trim())
    request.timeout = 5 * 60_000
    request.upload.onprogress = event => { if (event.lengthComputable) progress(Math.round(event.loaded / event.total * 100)) }
    const abort = () => request.abort()
    const finish = () => signal.removeEventListener('abort', abort)
    request.onerror = () => { finish(); reject(new Error('O envio foi interrompido. Verifique a conexão e tente novamente.')) }
    request.ontimeout = () => { finish(); reject(new Error('O envio excedeu o tempo permitido. Tente novamente.')) }
    request.onabort = () => { finish(); reject(new DOMException('Envio cancelado.', 'AbortError')) }
    request.onload = () => {
      finish()
      try {
        const payload = JSON.parse(request.responseText)
        if (request.status < 200 || request.status >= 300) reject(new Error(payload.error || 'Não foi possível enviar este arquivo.'))
        else resolve(payload)
      } catch { reject(new Error('A API não retornou uma resposta válida. Tente novamente.')) }
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) { finish(); reject(new DOMException('Envio cancelado.', 'AbortError')); return }
    request.send(file)
  })
}
