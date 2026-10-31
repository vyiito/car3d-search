const channel = 'vj-classic-reader-v1'
interface ReaderResponse { installed?: boolean; document?: unknown; error?: string }

function exchange(type: 'PING' | 'REQUEST', input: { action?: string; url?: string }, signal?: AbortSignal): Promise<ReaderResponse | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason)
    const id = crypto.randomUUID()
    const cleanup = () => { clearTimeout(timer); window.removeEventListener('message', receive); signal?.removeEventListener('abort', abort) }
    const cancel = () => window.postMessage({ channel, type: 'CANCEL', id }, location.origin)
    const abort = () => { cancel(); cleanup(); reject(signal?.reason) }
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.channel !== channel || event.data?.type !== 'RESPONSE' || event.data?.id !== id) return
      cleanup()
      if (typeof event.data.error === 'string') reject(new Error(event.data.error))
      else resolve(event.data)
    }
    const timer = window.setTimeout(() => {
      cleanup(); if (type === 'PING') resolve(null)
      else { cancel(); reject(new Error('O leitor demorou para concluir. Confira se o CLASSIC.COM abriu normalmente no navegador.')) }
    }, type === 'PING' ? 700 : 90000)
    window.addEventListener('message', receive); signal?.addEventListener('abort', abort, { once: true })
    window.postMessage({ channel, type, id, ...input }, location.origin)
  })
}
export async function classicReaderInstalled(signal?: AbortSignal) { return (await exchange('PING', {}, signal))?.installed === true }
export async function readClassicInBrowser(action: 'search' | 'gallery', url: string, signal: AbortSignal) {
  const result = await exchange('REQUEST', { action, url }, signal)
  if (!result?.document) throw new Error('O leitor não retornou os dados da página pública.')
  return result.document
}
