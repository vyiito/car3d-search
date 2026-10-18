import { test, expect, type Page } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'
import { readFile } from 'node:fs/promises'
import { createDefaultContainer, write, VK_FORMAT_R8G8B8A8_SRGB } from 'three/addons/libs/ktx-parse.module.js'

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/mXPo5QAAAABJRU5ErkJggg==', 'base64')
const obj = 'mtllib car.mtl\no Carroceria\nv -1 0 0\nv 1 0 0\nv 0 2 0\nvt 0 0\nvt 1 0\nvt 0.5 1\nusemtl Pintura\nf 1/1 2/2 3/3\no Roda\nv -1 -1 0\nv 0 -1 0\nv -0.5 0 0\nusemtl Borracha\nf 4/1 5/2 6/3\n'
const mtl = 'newmtl Pintura\nKd 0.6 0.3 0.8\nNs 50\nmap_Kd texture/color.png\nnewmtl Borracha\nKd 0.05 0.05 0.05\n'
const archive = () => Buffer.from(zipSync({ 'car/car.obj': strToU8(obj), 'car/car.mtl': strToU8(mtl), 'car/texture/color.png': png }))
const file = (name: string, buffer: Buffer | string, mimeType = 'application/octet-stream') => ({ name, mimeType, buffer: typeof buffer === 'string' ? Buffer.from(buffer) : buffer })

async function setup(page: Page) {
  await page.route('**/api/conversions/capabilities', route => route.fulfill({ json: { enabled: true, online: false, maxInputBytes: 134217728, maxOutputBytes: 268435456, retentionMinutes: 60 } }))
  await page.goto('/tools.html#viewer')
  await expect(page.getByRole('heading', { name: /Seu modelo/ })).toBeVisible()
}
async function openZip(page: Page) {
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('car.zip', archive(), 'application/zip'))
  await expect(page.locator('.viewerStats')).toContainText('2 triângulos', { timeout: 20000 })
}

function makeGlb() {
  const geometry = Buffer.alloc(36)
  ;[-1, 0, 0, 1, 0, 0, 0, 2, 0].forEach((value, index) => geometry.writeFloatLE(value, index * 4))
  const image = Buffer.concat([png, Buffer.alloc((4 - png.length % 4) % 4)])
  const bin = Buffer.concat([geometry, image])
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ name: 'Carro GLB', mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ name: 'Material GLB', pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metalnessFactor: 0.2, roughnessFactor: 0.6 }, doubleSided: true }], textures: [{ source: 0 }], images: [{ bufferView: 1, mimeType: 'image/png' }], buffers: [{ byteLength: bin.length }], bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: geometry.length }, { buffer: 0, byteOffset: geometry.length, byteLength: png.length }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }] }
  const raw = Buffer.from(JSON.stringify(doc)), json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)])
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4)
  return Buffer.concat([header, json, binHeader, bin])
}

test('local OBJ ZIP loads materials and textures, selects and isolates pieces, edits and restores materials', async ({ page }) => {
  const failures: string[] = [], requests: string[] = []
  page.on('pageerror', error => failures.push(error.message))
  page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()) })
  await setup(page); await openZip(page)
  await expect(page.locator('.viewerStats')).toContainText('2 materiais')
  await expect(page.locator('.viewerTexture')).toContainText('color.png')
  await page.getByRole('button', { name: /Carroceria 1 triângulos/ }).click()
  const original = await page.getByLabel('Cor do material', { exact: true }).inputValue()
  await page.getByLabel('Cor do material', { exact: true }).fill('#2345ab')
  await expect(page.getByLabel('Cor do material', { exact: true })).toHaveValue('#2345ab')
  await page.getByLabel('Metalização', { exact: true }).fill('0.75')
  await page.getByRole('button', { name: 'Isolar peça', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('1/2 visíveis')
  await page.getByRole('button', { name: 'Mostrar todas', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('2/2 visíveis')
  await page.getByRole('button', { name: 'Ocultar peça', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('1/2 visíveis')
  await expect(page.getByRole('button', { name: 'Mostrar Carroceria', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Ocultar Roda', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Mostrar peça', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('2/2 visíveis')
  await page.getByRole('button', { name: 'Ocultar Roda', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('1/2 visíveis')
  await page.getByLabel('Substituir textura difusa', { exact: true }).setInputFiles(file('nova.png', png, 'image/png'))
  await expect(page.locator('.viewerTexture')).toContainText('nova.png')
  await page.getByRole('button', { name: 'Restaurar material original', exact: true }).click()
  await expect(page.getByLabel('Cor do material', { exact: true })).toHaveValue(original)
  await expect(page.locator('.viewerTexture')).toContainText('color.png')
  expect(failures).toEqual([]); expect(requests).toEqual([])
})

test('embedded GLB works and the exported PNG has transparency', async ({ page }, testInfo) => {
  await setup(page)
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('car.glb', makeGlb()))
  await expect(page.locator('.viewerStats')).toContainText('1 triângulos', { timeout: 20000 })
  await expect(page.locator('.viewerTexture')).toContainText('Textura incorporada')
  await expect(page.locator('.viewerWarnings')).toHaveCount(0)
  await page.getByRole('button', { name: 'Malha', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Malha', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar PNG', exact: true }).click()
  const saved = await download, path = testInfo.outputPath('preview.png')
  await saved.saveAs(path)
  const bytes = await readFile(path)
  expect(bytes.subarray(1, 4).toString()).toBe('PNG')
  const alpha = await page.evaluate(async encoded => {
    const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob())
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return context.getImageData(0, 0, 1, 1).data[3]
  }, bytes.toString('base64'))
  expect(alpha).toBe(0)
})

test('the private conversion result opens with its textures and keeps the access token out of URLs', async ({ page }) => {
  const id = '12345678-1234-1234-1234-000000000001', accessToken = 'a'.repeat(64), ticket = 'b'.repeat(64)
  const job = { id, filename: 'Carro.kn5', status: 'completed', progress: 100, createdAt: Date.now(), updatedAt: Date.now(), expiresAt: Date.now() + 3600000, outputBytes: archive().length, report: { triangles: 2, materials: 2, textures: 1 } }
  await page.addInitScript(saved => localStorage.setItem('vj:conversions:v1', JSON.stringify([saved])), { job, accessToken })
  const requested: string[] = []
  await page.route('**/api/conversions**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    requested.push(route.request().url())
    if (path.endsWith('capabilities')) return route.fulfill({ json: { enabled: true, online: false } })
    expect(route.request().headers().authorization).toBe('Bearer ' + accessToken)
    if (path.endsWith('download-ticket')) return route.fulfill({ json: { url: '/api/conversion-download/' + ticket } })
    return route.fulfill({ json: job })
  })
  await page.route('**/api/conversion-download/*', route => route.fulfill({ contentType: 'application/zip', body: archive() }))
  await page.goto('/tools.html')
  await page.getByRole('button', { name: 'VISUALIZAR RESULTADO', exact: true }).click()
  await expect(page).toHaveURL(/#viewer$/)
  await expect(page.locator('.viewerStats')).toContainText('2 triângulos', { timeout: 20000 })
  await expect(page.getByRole('tabpanel', { name: /Visualizador 3D/ })).toBeFocused()
  await expect(page.locator('.viewerTexture')).toContainText('color.png')
  expect(requested.some(url => url.includes(accessToken))).toBe(false)
})

test('bad archives and external glTF dependencies are rejected without external requests; missing textures are explained', async ({ page }) => {
  const rendererImports: string[] = []
  page.on('request', request => { if (request.url().includes('/src/viewer/runtime.ts')) rendererImports.push(request.url()) })
  await setup(page)
  const malicious = Buffer.from(zipSync({ '../car.obj': strToU8(obj) }))
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('bad.zip', malicious))
  await expect(page.getByRole('alert')).toContainText('caminho inválido')
  const session = await page.context().newCDPSession(page)
  await session.send('Emulation.setCPUThrottlingRate', { rate: 6 })
  const external: string[] = []
  page.on('request', request => { if (request.url().includes('untrusted.example')) external.push(request.url()) })
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('bad.gltf', JSON.stringify({ asset: { version: '2.0' }, buffers: [{ uri: 'https://untrusted.example/secret.bin', byteLength: 36 }] })))
  await expect(page.getByRole('alert')).toContainText('endereço externo')
  expect(external).toEqual([])
  expect(rendererImports).toEqual([])
  await session.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await session.detach()
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles([file('car.obj', obj), file('car.mtl', mtl)])
  await expect(page.locator('.viewerStats')).toContainText('2 triângulos', { timeout: 20000 })
  await expect(page.locator('.viewerWarnings')).toContainText('Textura ausente')
})

test('mobile tabs support keyboard navigation and switching or closing models releases the canvas', async ({ page }) => {
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL), resources = new Set<string>()
    URL.createObjectURL = value => { const url = create(value); if (value instanceof File) resources.add(url); return url }
    URL.revokeObjectURL = url => { resources.delete(url); revoke(url) }
    Object.assign(window, { viewerResources: resources })
  })
  await setup(page); await openZip(page)
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await expect(page.getByRole('main')).toHaveCount(1)
  await page.getByRole('tab', { name: /Visualizador 3D/ }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('tab', { name: /Minhas conversões/ })).toBeFocused()
  await expect(page.locator('.workshopCanvas canvas')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).viewerResources.size)).toBe(0)
  await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.viewerStats')).toContainText('2 triângulos', { timeout: 20000 })
  await page.getByRole('button', { name: 'Fechar modelo', exact: true }).click()
  await expect(page.locator('.workshopCanvas canvas')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).viewerResources.size)).toBe(0)
  await expect(page.getByRole('heading', { name: 'Traga seu próximo projeto.' })).toBeVisible()
})

test('KTX2 textures in an OBJ package retain the correct texture type', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  const container = createDefaultContainer()
  Object.assign(container, { vkFormat: VK_FORMAT_R8G8B8A8_SRGB, pixelWidth: 1, pixelHeight: 1, levelCount: 1, levels: [{ levelData: new Uint8Array([64, 128, 255, 255]), uncompressedByteLength: 4 }] })
  container.dataFormatDescriptor[0].colorModel = 1
  container.dataFormatDescriptor[0].bytesPlane[0] = 4
  const packed = Buffer.from(zipSync({ 'car.obj': strToU8(obj), 'car.mtl': strToU8(mtl.replace('texture/color.png', 'color.ktx2')), 'color.ktx2': write(container) }))
  await setup(page)
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('ktx.zip', packed))
  await expect(page.locator('.viewerStats')).toContainText('2 triângulos', { timeout: 20000 })
  await expect(page.locator('.viewerTexture')).toContainText('color.ktx2')
  await expect(page.locator('.viewerWarnings')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('DDS luminance, alpha and DXT fallback decode known pixels correctly', async ({ page }) => {
  await setup(page)
  const result = await page.evaluate(async () => {
    const { decodeRawDds, decodeDxt } = await import('/src/viewer/textures.ts')
    const raw = (alpha: boolean) => {
      const bytes = new ArrayBuffer(128 + (alpha ? 2 : 1)), view = new DataView(bytes)
      view.setUint32(0, 0x20534444, true); view.setUint32(12, 1, true); view.setUint32(16, 1, true)
      view.setUint32(80, alpha ? 0x20001 : 0x20000, true); view.setUint32(88, alpha ? 16 : 8, true); view.setUint32(92, 255, true)
      if (alpha) view.setUint32(104, 65280, true)
      view.setUint8(128, 128); if (alpha) view.setUint8(129, 64)
      return [...decodeRawDds(bytes).data]
    }
    const bytes = new ArrayBuffer(136), view = new DataView(bytes)
    view.setUint32(12, 4, true); view.setUint32(16, 4, true); view.setUint32(84, 0x31545844, true); view.setUint16(128, 0xf800, true); view.setUint16(130, 0x07e0, true)
    return { luminance: raw(false), alpha: raw(true), dxt: [...decodeDxt(bytes).data.slice(0, 4)] }
  })
  expect(result).toEqual({ luminance: [128, 128, 128, 255], alpha: [128, 128, 128, 64], dxt: [255, 0, 0, 255] })
})

test('inflation limits reject a ZIP before extraction and packages can switch between models', async ({ page }) => {
  await setup(page)
  const oversized = archive(), directory = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  oversized.writeUInt32LE(500 * 1024 ** 2, directory + 24)
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('bomb.zip', oversized))
  await expect(page.getByRole('alert')).toContainText('descompactado excede 384 MB')
  const glb = makeGlb(), jsonLength = glb.readUInt32LE(12), doc = JSON.parse(glb.subarray(20, 20 + jsonLength).toString()), bin = glb.subarray(28 + jsonLength)
  doc.buffers[0].uri = 'geometry.bin'
  const packed = Buffer.from(zipSync({ 'a/car.obj': strToU8(obj), 'a/car.mtl': strToU8(mtl), 'a/texture/color.png': png, 'b/car.gltf': strToU8(JSON.stringify(doc)), 'b/geometry.bin': bin }))
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('models.zip', packed))
  await expect(page.locator('.viewerStats')).toContainText('2 triângulos', { timeout: 20000 })
  await page.getByLabel('Modelo do pacote', { exact: true }).selectOption('b/car.gltf')
  await expect(page.locator('.viewerStats')).toContainText('1 triângulos', { timeout: 20000 })
  await expect(page.locator('.workshopCanvas canvas')).toHaveCount(1)
  await expect(page.locator('.viewerWarnings')).toHaveCount(0)
})
