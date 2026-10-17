import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const MB = 1024 * 1024
const terminal = new Set(['completed', 'failed', 'cancelled'])
const stages = { queued: 10, decrypting: 25, converting: 50, packaging: 75, uploading: 90, completed: 100 }
const messages = {
  conversion_failed: 'Não foi possível converter este KN5.',
  protected_file: 'A descriptografia deste arquivo não pôde ser concluída com as chaves disponíveis.',
  folder_required: 'Não foi possível abrir este mod. Selecione a pasta original do carro ou informe seu nome; algumas proteções dependem desse nome e das chaves disponíveis.',
  missing_textures: 'O modelo referencia texturas que não foram fornecidas. Envie um KN5 com as texturas incorporadas.',
  invalid_file: 'O arquivo KN5 está inválido ou usa uma estrutura ainda não suportada.',
  limit_exceeded: 'O modelo excedeu os limites de processamento.',
  timed_out: 'A conversão excedeu o tempo máximo. Tente um modelo menor.',
  interrupted: 'O processamento foi interrompido. Envie o arquivo novamente.',
}
function problem(status, message) { return Object.assign(new Error(message), { status }) }
function hash(value) { return createHash('sha256').update(String(value || '')).digest() }
function equal(a, b) { return timingSafeEqual(hash(a), hash(b)) }
function bearer(req) { return /^Bearer (\S+)$/i.exec(req.headers.authorization || '')?.[1] || '' }
function cleanName(value) {
  let name
  try { name = decodeURIComponent(String(value || '')) } catch { throw problem(400, 'Nome de arquivo inválido.') }
  if (!/\.kn5$/i.test(name) || /[<>:"\\/|?*\x00-\x1f]/.test(name) || name.length > 180 || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])\./i.test(name)) throw problem(400, 'Envie um arquivo .kn5 com nome válido.')
  return name
}
function cleanCarFolder(value) {
  const name = String(value || '').trim()
  if (name && (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,95}$/.test(name) || name.endsWith('.') || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name))) throw problem(400, 'Use apenas letras, números, ponto, hífen e sublinhado no nome da pasta.')
  return name || null
}
async function exists(path) { return stat(path).catch(() => null) }
const safe = fn => async (req, res) => {
  try { await fn(req, res) } catch (error) {
    if (!res.headersSent && !res.destroyed) res.status(error.status || 500).json({ error: error.status ? error.message : 'Não foi possível concluir esta operação.' })
  }
}

/** Single-instance queue; bounded disk uploads, capability access and fenced worker leases. */
export function createConversionService(options = {}) {
  const directory = options.directory || process.env.CONVERSION_STORAGE_DIR || join(tmpdir(), 'vj3d-conversions')
  const workerSecret = options.workerSecret ?? process.env.CONVERTER_WORKER_TOKEN ?? ''
  const now = options.now || Date.now
  const maxInputBytes = options.maxInputBytes || 128 * MB
  const maxOutputBytes = options.maxOutputBytes || 256 * MB
  const maxStorageBytes = options.maxStorageBytes || 768 * MB
  const retentionMs = options.retentionMs || 60 * 60_000
  const leaseMs = options.leaseMs || 120_000
  const workerTtlMs = options.workerTtlMs || 45_000
  const jobs = new Map(), tickets = new Map(), rates = new Map()
  let worker = null, cleaning = false
  const path = (job, file) => join(directory, job.id, file)
  const persist = async job => {
    await mkdir(join(directory, job.id), { recursive: true, mode: 0o700 })
    // Serialize first: a later state transition cannot be overwritten by an older write.
    const serialized = JSON.stringify(job, (key, value) => key === '_write' ? undefined : value)
    job._write = (job._write || Promise.resolve()).catch(() => {}).then(async () => {
      await writeFile(path(job, 'state.tmp'), serialized, { mode: 0o600 })
      await rename(path(job, 'state.tmp'), path(job, 'state.json'))
    })
    await job._write
  }
  const ready = (async () => {
    await mkdir(directory, { recursive: true, mode: 0o700 })
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[\da-f-]{36}$/.test(entry.name)) continue
      try {
        const job = JSON.parse(await readFile(join(directory, entry.name, 'state.json'), 'utf8'))
        if (job.id !== entry.name || !/^[\da-f]{64}$/.test(job.tokenHash)) continue
        delete job._write
        if (job.expiresAt <= now()) { await rm(join(directory, job.id), { recursive: true, force: true }); continue }
        if (!terminal.has(job.status) && job.status !== 'queued') {
          job.status = 'failed'; job.error = messages.interrupted; job.updatedAt = now(); job.leaseToken = null
          await rm(path(job, 'input.kn5'), { force: true }); await rm(path(job, 'result.zip'), { force: true })
        }
        jobs.set(job.id, job)
      } catch { await rm(join(directory, entry.name), { recursive: true, force: true }) }
    }
  })()
  function publicJob(job) {
    const queued = [...jobs.values()].filter(item => item.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)
    return { id: job.id, filename: job.filename, status: job.status, progress: stages[job.status] || 0,
      createdAt: job.createdAt, updatedAt: job.updatedAt, expiresAt: job.expiresAt,
      queuePosition: job.status === 'queued' ? queued.findIndex(item => item.id === job.id) + 1 : null,
      error: job.error || null, report: job.report || null, outputBytes: job.outputBytes || 0 }
  }
  function online() { return Boolean(workerSecret && worker && now() - worker.lastSeen < workerTtlMs) }
  function authWorker(req) {
    if (!workerSecret || !equal(bearer(req), workerSecret)) throw problem(401, 'Agente não autorizado.')
  }
  function ownJob(req) {
    const job = jobs.get(req.params.id)
    if (!job || !bearer(req) || !equal(hash(bearer(req)).toString('hex'), job.tokenHash)) throw problem(404, 'Conversão indisponível ou expirada. Envie o arquivo novamente.')
    if (job.expiresAt <= now()) throw problem(410, 'Esta conversão expirou. Envie o arquivo novamente.')
    return job
  }
  function leaseJob(req) {
    authWorker(req)
    const job = jobs.get(req.params.id)
    if (!job || terminal.has(job.status) || !job.leaseToken || !equal(req.headers['x-lease-token'], job.leaseToken) || job.leaseUntil <= now()) throw problem(409, 'A tarefa não está mais disponível para este agente.')
    return job
  }
  async function clean() {
    await ready
    if (cleaning) return
    cleaning = true
    try {
      for (const [id, job] of jobs) {
        if (job.expiresAt <= now()) {
          jobs.delete(id); await job._write?.catch(() => {}); await rm(join(directory, id), { recursive: true, force: true })
        } else if (!terminal.has(job.status) && job.status !== 'queued' && job.status !== 'receiving' && job.leaseUntil <= now()) {
          job.status = 'failed'; job.error = messages.interrupted; job.updatedAt = now(); job.leaseToken = null
          await persist(job); await rm(path(job, 'input.kn5'), { force: true }); await rm(path(job, 'result.zip'), { force: true })
        } else if (job.status === 'queued' && now() - job.createdAt > 15 * 60_000) {
          job.status = 'failed'; job.error = 'O agente não iniciou esta conversão a tempo. Envie o arquivo novamente.'; job.updatedAt = now()
          await persist(job); await rm(path(job, 'input.kn5'), { force: true })
        }
      }
      for (const [ticket, value] of tickets) if (value.expiresAt <= now()) tickets.delete(ticket)
      for (const [ip, value] of rates) if (value.until <= now()) rates.delete(ip)
    } finally { cleaning = false }
  }
  const timer = setInterval(() => clean().catch(() => {}), 15_000); timer.unref()
  async function receive(req, destination, limit, signature) {
    if (!/^application\/(octet-stream|zip)(?:;|$)/i.test(req.headers['content-type'] || '')) throw problem(415, 'Tipo de arquivo inválido.')
    const declared = Number(req.headers['content-length'])
    if (Number.isFinite(declared) && declared > limit) throw problem(413, 'O arquivo excede o limite permitido.')
    let bytes = 0, prefix = Buffer.alloc(0)
    const limiter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length
      if (bytes > limit) return callback(problem(413, 'O arquivo excede o limite permitido.'))
      if (prefix.length < signature.length) prefix = Buffer.concat([prefix, chunk.subarray(0, signature.length - prefix.length)])
      if (prefix.length >= signature.length && !prefix.equals(signature)) return callback(problem(415, 'O conteúdo do arquivo não é válido para este formato.'))
      callback(null, chunk)
    } })
    // Do not pipeline the request itself: on a size error the HTTP socket must remain usable for the error response.
    req.pipe(limiter)
    const disconnected = () => limiter.destroy(problem(400, 'Envio interrompido. Tente novamente.'))
    req.once('aborted', disconnected)
    const slow = setTimeout(() => limiter.destroy(problem(408, 'O envio excedeu o tempo permitido.')), 5 * 60_000); slow.unref()
    try {
      await pipeline(limiter, createWriteStream(destination, { flags: 'wx', mode: 0o600 }))
      if (prefix.length !== signature.length) throw problem(415, 'Arquivo vazio ou incompleto.')
      return bytes
    } catch (error) {
      req.unpipe(limiter); req.resume(); await rm(destination, { force: true }); throw error
    } finally { clearTimeout(slow); req.removeListener('aborted', disconnected) }
  }
  function register(app) {
    app.get('/api/conversions/capabilities', safe(async (_req, res) => {
      await clean()
      res.set('Cache-Control', 'no-store').json({ version: 1, enabled: Boolean(workerSecret), online: online(), maxInputBytes, maxOutputBytes,
        retentionMinutes: retentionMs / 60_000, inputFormats: ['KN5'], outputFormats: ['OBJ', 'MTL', 'TEXTURES'],
        waiting: [...jobs.values()].filter(job => job.status === 'queued').length })
    }))
    app.post('/api/conversions', safe(async (req, res) => {
      await clean()
      if (!online()) throw problem(503, 'O conversor está offline. Tente quando o agente estiver conectado.')
      const filename = cleanName(req.headers['x-file-name'])
      const carFolder = cleanCarFolder(req.headers['x-car-folder'])
      if (Number(req.headers['content-length']) > maxInputBytes) throw problem(413, 'O arquivo excede o limite permitido.')
      const ip = req.ip || req.socket.remoteAddress || 'unknown'
      const rate = rates.get(ip) || { count: 0, until: now() + 60 * 60_000 }
      if (rate.count >= (options.rateLimit || 6)) throw problem(429, 'Limite de envios por hora atingido. Tente mais tarde.')
      if (rates.size >= 2000 && !rates.has(ip)) throw problem(503, 'O conversor está ocupado. Tente mais tarde.')
      const active = [...jobs.values()].filter(job => !terminal.has(job.status))
      const stored = [...jobs.values()].reduce((total, job) => total + (terminal.has(job.status) ? job.outputBytes || 0 : maxInputBytes + maxOutputBytes), 0)
      if (active.length >= 2 || jobs.size >= 20 || stored + maxInputBytes + maxOutputBytes > maxStorageBytes) throw problem(503, 'A fila está cheia. Aguarde uma conversão terminar.')
      rate.count++; rates.set(ip, rate)
      const token = randomBytes(32).toString('hex')
      const job = { id: randomUUID(), tokenHash: hash(token).toString('hex'), filename, carFolder, status: 'receiving', createdAt: now(), updatedAt: now(), expiresAt: now() + retentionMs, inputBytes: 0, outputBytes: 0 }
      jobs.set(job.id, job)
      try {
        await persist(job)
        job.inputBytes = await receive(req, path(job, 'input.kn5'), maxInputBytes, Buffer.from('sc6969'))
        job.status = 'queued'; job.updatedAt = now(); await persist(job)
        res.status(201).set('Cache-Control', 'no-store').json({ job: publicJob(job), accessToken: token })
      } catch (error) {
        jobs.delete(job.id); await job._write?.catch(() => {}); await rm(join(directory, job.id), { recursive: true, force: true }); throw error
      }
    }))
    app.get('/api/conversions/:id', safe(async (req, res) => { await clean(); res.set('Cache-Control', 'no-store').json(publicJob(ownJob(req))) }))
    app.delete('/api/conversions/:id', safe(async (req, res) => {
      await clean(); const job = ownJob(req)
      if (!terminal.has(job.status)) {
        job.status = 'cancelled'; job.updatedAt = now(); job.leaseToken = null; await persist(job)
        await rm(path(job, 'input.kn5'), { force: true }); await rm(path(job, 'result.zip'), { force: true })
      }
      res.json(publicJob(job))
    }))
    app.post('/api/conversions/:id/download-ticket', safe(async (req, res) => {
      await clean(); const job = ownJob(req)
      if (job.status !== 'completed' || !(await exists(path(job, 'result.zip')))) throw problem(409, 'O arquivo convertido ainda não está disponível.')
      if (tickets.size >= 200) throw problem(429, 'Aguarde um momento antes de baixar novamente.')
      const ticket = randomBytes(32).toString('hex')
      tickets.set(ticket, { jobId: job.id, expiresAt: now() + 60_000 })
      res.set('Cache-Control', 'no-store').json({ url: `/api/conversion-download/${ticket}` })
    }))
    app.get('/api/conversion-download/:ticket', safe(async (req, res) => {
      await clean(); const access = tickets.get(req.params.ticket), job = access && jobs.get(access.jobId)
      if (!access || access.expiresAt <= now() || job?.status !== 'completed') throw problem(410, 'Este link expirou. Solicite o download novamente.')
      tickets.delete(req.params.ticket)
      res.set('Cache-Control', 'no-store').set('Referrer-Policy', 'no-referrer')
      const name = job.filename.replace(/\.kn5$/i, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100) || 'modelo'
      await new Promise(resolve => res.download(path(job, 'result.zip'), `${name}-OBJ.zip`, error => {
        if (error && !res.headersSent) res.status(410).json({ error: 'O download não está disponível. Tente novamente.' })
        resolve()
      }))
    }))
    app.post('/api/converter-worker/heartbeat', safe(async (req, res) => {
      await clean(); authWorker(req)
      const workerId = String(req.body?.workerId || '').slice(0, 80)
      if (!/^[a-zA-Z0-9_-]{8,80}$/.test(workerId)) throw problem(400, 'Identificador de agente inválido.')
      if (online() && worker.id !== workerId) throw problem(409, 'Já existe um agente conectado.')
      worker = { id: workerId, lastSeen: now() }
      if (req.body.jobId) {
        const job = jobs.get(req.body.jobId)
        if (!job || terminal.has(job.status) || job.workerId !== workerId || !equal(req.body.leaseToken, job.leaseToken) || job.leaseUntil <= now()) throw problem(409, 'A tarefa foi cancelada ou expirou.')
        job.leaseUntil = now() + leaseMs
        // The active lease need not be persisted on every heartbeat: restart fails active jobs safely.
      }
      res.json({ ok: true })
    }))
    app.post('/api/converter-worker/claim', safe(async (req, res) => {
      await clean(); authWorker(req)
      if (!online() || worker.id !== req.body?.workerId) throw problem(409, 'Conecte o agente antes de consultar a fila.')
      if ([...jobs.values()].some(job => job.leaseToken && !terminal.has(job.status))) return res.status(204).end()
      const job = [...jobs.values()].filter(item => item.status === 'queued').sort((a, b) => a.createdAt - b.createdAt)[0]
      if (!job) return res.status(204).end()
      job.status = 'decrypting'; job.workerId = worker.id; job.leaseToken = randomBytes(24).toString('hex'); job.leaseUntil = now() + leaseMs; job.updatedAt = now()
      await persist(job)
      res.json({ id: job.id, filename: job.filename, carFolder: job.carFolder, inputBytes: job.inputBytes, leaseToken: job.leaseToken, maxOutputBytes })
    }))
    app.get('/api/converter-worker/jobs/:id/input', safe(async (req, res) => {
      await clean(); const job = leaseJob(req)
      const file = await exists(path(job, 'input.kn5'))
      if (!file) throw problem(410, 'Arquivo de entrada indisponível.')
      res.set('Content-Type', 'application/octet-stream').set('Content-Length', String(file.size)).set('Cache-Control', 'no-store')
      await pipeline(createReadStream(path(job, 'input.kn5')), res)
    }))
    app.post('/api/converter-worker/jobs/:id/progress', safe(async (req, res) => {
      await clean(); const job = leaseJob(req), stage = req.body?.stage
      if (!['decrypting', 'converting', 'packaging', 'uploading'].includes(stage) || stages[stage] < stages[job.status]) throw problem(400, 'Etapa de conversão inválida.')
      job.status = stage; job.updatedAt = now(); await persist(job); res.json({ ok: true })
    }))
    app.post('/api/converter-worker/jobs/:id/result', safe(async (req, res) => {
      await clean(); const job = leaseJob(req)
      if (job.status !== 'uploading') throw problem(409, 'Etapa de envio não iniciada.')
      const bytes = await receive(req, path(job, 'result.upload'), maxOutputBytes, Buffer.from([0x50, 0x4b, 0x03, 0x04]))
      try { leaseJob(req) } catch (error) { await rm(path(job, 'result.upload'), { force: true }); throw error }
      await rename(path(job, 'result.upload'), path(job, 'result.zip'))
      job.outputBytes = bytes; job.status = 'completed'; job.updatedAt = now(); job.expiresAt = now() + retentionMs; job.leaseToken = null
      await persist(job); await rm(path(job, 'input.kn5'), { force: true }); res.json(publicJob(job))
    }))
    app.post('/api/converter-worker/jobs/:id/report', safe(async (req, res) => {
      await clean(); const job = leaseJob(req), report = {}
      for (const key of ['vertices', 'triangles', 'meshes', 'materials', 'textures', 'placeholderTextures']) {
        const value = req.body?.[key]
        if (!Number.isSafeInteger(value) || value < 0 || value > 10_000_000) throw problem(400, 'Relatório inválido.')
        report[key] = value
      }
      job.report = report; await persist(job); res.json({ ok: true })
    }))
    app.post('/api/converter-worker/jobs/:id/fail', safe(async (req, res) => {
      await clean(); const job = leaseJob(req)
      job.status = 'failed'; job.error = messages[req.body?.code] || messages.conversion_failed; job.leaseToken = null; job.updatedAt = now()
      await persist(job); await rm(path(job, 'input.kn5'), { force: true }); await rm(path(job, 'result.upload'), { force: true }); res.json({ ok: true })
    }))
  }
  return { register, close: () => clearInterval(timer), ready, clean }
}
