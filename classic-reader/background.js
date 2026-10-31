const jobs = new Map()
const readyTabs = new Set()
let queue = Promise.resolve()

function allowedSender(sender) {
  if (sender.id !== chrome.runtime.id) return false
  try {
    const url = new URL(sender.url)
    return (url.origin === 'https://vyiito.github.io' && url.pathname.startsWith('/car3d-search/')) || ['http://127.0.0.1:5173', 'http://localhost:5173'].includes(url.origin)
  } catch { return false }
}
function sourceUrl(value, action) {
  const url = new URL(value)
  const validPath = action === 'search' ? /^\/search\/?$/.test(url.pathname) : /^\/veh\/[^/]+\/?$|^\/a\/[^/]+\/lots\/[^/]+\/?$/.test(url.pathname)
  if (url.protocol !== 'https:' || url.hostname !== 'www.classic.com' || url.port || url.username || url.password || !validPath) throw new Error('O leitor aceita somente páginas públicas de busca e exemplares do CLASSIC.COM.')
  return url.href
}
async function read(job, action, url) {
  if (job.cancelled) throw new Error('Consulta cancelada.')
  const tab = await chrome.tabs.create({ url, active: true, openerTabId: job.openerTabId }); job.tabId = tab.id
  if (readyTabs.delete(tab.id)) job.contentReady = true
  try {
    if (job.cancelled) throw new Error('Consulta cancelada.')
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('O CLASSIC.COM demorou para abrir. Confira a página no navegador.')), 20000)
      job.resolveReady = () => { clearTimeout(timer); resolve() }
      job.stopReady = () => { clearTimeout(timer); reject(new Error('Consulta cancelada.')) }
      if (job.contentReady) job.resolveReady()
    })
    await ready
    if (job.cancelled) throw new Error('Consulta cancelada.')
    return await chrome.tabs.sendMessage(tab.id, { action: 'vj-classic-read', kind: action })
  } finally { readyTabs.delete(tab.id); if (job.tabId) await chrome.tabs.remove(job.tabId).catch(() => {}) }
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message.action === 'vj-classic-ready' && sender.id === chrome.runtime.id) {
    const job = [...jobs.values()].find(item => item.tabId === sender.tab?.id)
    if (job) { job.contentReady = true; job.resolveReady?.() }
    else if (sender.tab?.id && [...jobs.values()].some(item => !item.tabId) && readyTabs.size < 4) readyTabs.add(sender.tab.id)
    respond({ ready: true }); return
  }
  if (!allowedSender(sender) || typeof message.requestId !== 'string' || message.requestId.length > 80) return
  const key = `${sender.tab?.id}:${message.requestId}`
  if (message.action === 'cancel') {
    const job = jobs.get(key)
    if (job) { job.cancelled = true; job.stopReady?.(); if (job.tabId) chrome.tabs.remove(job.tabId).catch(() => {}) }
    respond({ cancelled: true }); return
  }
  if (!['search', 'gallery'].includes(message.action)) return
  let url
  try { url = sourceUrl(message.url, message.action) } catch (error) { respond({ error: error.message }); return }
  if (jobs.size >= 4) { respond({ error: 'O leitor está ocupado. Aguarde a consulta atual.' }); return }
  const job = { cancelled: false, openerTabId: sender.tab?.id }; jobs.set(key, job)
  const task = queue.then(() => read(job, message.action, url))
  queue = task.catch(() => {})
  task.then(data => respond(data), error => respond({ error: error.message })).finally(() => jobs.delete(key))
  return true
})
