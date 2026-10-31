(() => {
  const channel = 'vj-classic-reader-v1'
  window.addEventListener('message', event => {
    const data = event.data
    if (event.source !== window || event.origin !== location.origin || data?.channel !== channel || typeof data.id !== 'string' || data.id.length > 80) return
    const respond = result => window.postMessage({ channel, type: 'RESPONSE', id: data.id, ...result }, location.origin)
    if (data.type === 'PING') return respond({ installed: true, version: '1.0.0' })
    if (data.type === 'CANCEL') { chrome.runtime.sendMessage({ action: 'cancel', requestId: data.id }).catch(() => {}); return }
    if (data.type !== 'REQUEST' || !['search', 'gallery'].includes(data.action)) return
    chrome.runtime.sendMessage({ action: data.action, url: data.url, requestId: data.id })
      .then(result => respond(result)).catch(() => respond({ error: 'O leitor foi desconectado. Recarregue a página depois de ativar a extensão.' }))
  })
})()
