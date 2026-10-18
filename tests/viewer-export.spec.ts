import { test, expect, type Page, type Download } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { zipSync, strToU8, unzipSync } from 'fflate'

test.use({ launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } })
const file = (name: string, buffer: Buffer | string) => ({ name, mimeType: 'application/octet-stream', buffer: typeof buffer === 'string' ? Buffer.from(buffer) : buffer })
const obj = 'mtllib car.mtl\no Carroceria\nv -1 0 0\nv 1 0 0\nv 0 2 0\nvt 0 0\nvt 1 0\nvt .5 1\nusemtl Pintura\nf 1/1 2/2 3/3\no Roda\nv -1 -1 0\nv 0 -1 0\nv -.5 0 0\nusemtl Borracha\nf 4/1 5/2 6/3\no Interior\nv 2 0 0\nv 3 0 0\nv 2.5 1 0\nusemtl Bancos\nf 7/1 8/2 9/3\n'
const mtl = 'newmtl Pintura\nKd 1 1 1\nmap_Kd color.png\nnewmtl Borracha\nKd .05 .05 .05\nnewmtl Bancos\nKd .3 .1 .1\n'
async function setup(page: Page) {
  await page.route('**/api/conversions/capabilities', route => route.fulfill({ json: { enabled: true, online: false } }))
  await page.goto('/tools.html#viewer')
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 2; canvas.height = 2
    const context = canvas.getContext('2d')!
    context.putImageData(new ImageData(new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 128, 64, 32, 255]), 2, 2), 0, 0)
    return canvas.toDataURL().split(',')[1]
  })
  const packed = Buffer.from(zipSync({ 'car/car.obj': strToU8(obj), 'car/car.mtl': strToU8(mtl), 'car/color.png': Buffer.from(png, 'base64') }))
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('car.zip', packed))
  await expect(page.locator('.viewerStats')).toContainText('3 peças', { timeout: 20000 })
}
function glb(data: Buffer) {
  expect(data.readUInt32LE(0)).toBe(0x46546c67)
  const length = data.readUInt32LE(12)
  return { json: JSON.parse(data.subarray(20, 20 + length).toString()), bin: data.subarray(28 + length) }
}
async function bytes(download: Download) { return readFile((await download.path())!) }

test('checkboxes and additive selection support group visibility, isolation and clearing', async ({ page }) => {
  await setup(page)
  await page.getByRole('checkbox', { name: 'Selecionar Carroceria', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Selecionar Roda', exact: true }).check()
  await expect(page.locator('.viewerPartRow.selected')).toHaveCount(2)
  await expect(page.locator('.viewerSelectedPart')).toContainText('2 peças selecionadas')
  await page.getByRole('button', { name: 'Ocultar selecionadas', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('1/3 visíveis')
  await page.getByRole('button', { name: 'Mostrar selecionadas', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('3/3 visíveis')
  await page.getByRole('button', { name: 'Isolar selecionadas', exact: true }).click()
  await expect(page.locator('.viewerParts')).toContainText('2/3 visíveis')
  await expect(page.locator('.viewerPartRow.selected')).toHaveCount(2)
  await page.getByRole('button', { name: 'Mostrar todas', exact: true }).click()
  await page.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await page.getByRole('button', { name: 'Carroceria 1 triângulos', exact: true }).click()
  await page.getByRole('button', { name: 'Roda 1 triângulos', exact: true }).click({ modifiers: ['Control'] })
  await expect(page.locator('.viewerPartRow.selected')).toHaveCount(2)
  await page.getByRole('button', { name: 'Seleção múltipla', exact: true }).click()
  await page.getByRole('button', { name: 'Interior 1 triângulos', exact: true }).click()
  await expect(page.locator('.viewerPartRow.selected')).toHaveCount(3)
  await page.getByRole('checkbox', { name: 'Selecionar Roda', exact: true }).uncheck()
  await expect(page.locator('.viewerPartRow.selected')).toHaveCount(2)
  await page.getByRole('button', { name: 'Limpar seleção', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Baixar peça (GLB)', exact: true })).toBeDisabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false)
})

test('single and combined GLBs include only chosen meshes, current materials and correctly oriented embedded textures', async ({ page }) => {
  const errors: string[] = [], writes: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
  page.on('request', request => { if (request.method() !== 'GET') writes.push(request.url()) })
  await setup(page)
  await page.getByRole('checkbox', { name: 'Selecionar Carroceria', exact: true }).check()
  await page.getByLabel('Cor do material', { exact: true }).fill('#2345ab')
  await page.getByLabel('Metalização', { exact: true }).fill('0.75')
  const singleDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar peça (GLB)', exact: true }).click()
  const single = await singleDownload, singleBytes = await bytes(single), parsed = glb(singleBytes)
  expect(single.suggestedFilename()).toBe('Carroceria.glb')
  expect(parsed.json.meshes).toHaveLength(1); expect(parsed.json.materials).toHaveLength(1); expect(parsed.json.images).toHaveLength(1)
  expect(parsed.json.materials[0].name).toBe('Pintura')
  expect(parsed.json.materials[0].pbrMetallicRoughness.metallicFactor).toBe(0.75)
  const imageView = parsed.json.bufferViews[parsed.json.images[0].bufferView]
  const image = parsed.bin.subarray(imageView.byteOffset || 0, (imageView.byteOffset || 0) + imageView.byteLength)
  const pixels = await page.evaluate(async encoded => {
    const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob())
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return [...context.getImageData(0, 0, image.width, image.height).data]
  }, image.toString('base64'))
  const expectedPixels = [0, 0, 255, 255, 128, 64, 32, 255, 255, 0, 0, 255, 0, 255, 0, 255]
  pixels.forEach((value, index) => expect(Math.abs(value - expectedPixels[index])).toBeLessThanOrEqual(1))
  // A row download must neither replace nor expand the current selection.
  const rowDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar peça Roda', exact: true }).click()
  const wheel = glb(await bytes(await rowDownload))
  expect(wheel.json.meshes).toHaveLength(1); expect(wheel.json.images).toBeUndefined()
  expect(wheel.json.materials[0].name).toBe('Borracha')
  await expect(page.getByRole('checkbox', { name: 'Selecionar Carroceria', exact: true })).toBeChecked()
  await expect(page.getByRole('checkbox', { name: 'Selecionar Roda', exact: true })).not.toBeChecked()
  await page.getByRole('checkbox', { name: 'Selecionar Roda', exact: true }).check()
  await page.getByRole('button', { name: 'Ocultar selecionadas', exact: true }).click()
  const combinedDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar selecionadas (GLB)', exact: true }).click()
  const combinedBytes = await bytes(await combinedDownload), combined = glb(combinedBytes)
  expect(combined.json.meshes).toHaveLength(2); expect(combined.json.materials).toHaveLength(2)
  expect(combined.json.nodes.some((node: { name?: string }) => node.name === 'Interior')).toBe(false)
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('selection.glb', combinedBytes))
  await expect(page.locator('.viewerStats')).toContainText('2 peças', { timeout: 20000 })
  await expect(page.locator('.viewerStats')).toContainText('1 texturas')
  await expect(page.getByLabel('Cor do material', { exact: true })).toHaveValue('#2345ab')
  await expect(page.locator('.viewerWarnings')).toHaveCount(0)
  expect(errors).toEqual([]); expect(writes).toEqual([])
})

test('GLB parent transforms and mirrored pieces are baked once with correct face winding', async ({ page }) => {
  await setup(page)
  const bin = Buffer.alloc(36); [-1, 0, 0, 1, 0, 0, 0, 2, 0].forEach((value, i) => bin.writeFloatLE(value, i * 4))
  const doc = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ translation: [10, 0, 0], children: [1, 2, 3] }, { name: 'Reflexo', mesh: 0, scale: [-1, 1, 1] }, { name: 'Roda', mesh: 0, translation: [4, 0, 0] }, { name: 'Extra', mesh: 0, translation: [8, 0, 0] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }], materials: [{ name: 'Pintura', pbrMetallicRoughness: { metallicFactor: 0 } }], buffers: [{ byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [-1, 0, 0], max: [1, 2, 0] }] }
  const raw = Buffer.from(JSON.stringify(doc)), json = Buffer.concat([raw, Buffer.alloc((4 - raw.length % 4) % 4, 0x20)])
  const header = Buffer.alloc(20); header.writeUInt32LE(0x46546c67); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + json.length + bin.length, 8); header.writeUInt32LE(json.length, 12); header.writeUInt32LE(0x4e4f534a, 16)
  const binHeader = Buffer.alloc(8); binHeader.writeUInt32LE(bin.length); binHeader.writeUInt32LE(0x004e4942, 4)
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('transforms.glb', Buffer.concat([header, json, binHeader, bin])))
  await expect(page.locator('.viewerStats')).toContainText('3 peças', { timeout: 20000 })
  await page.getByRole('checkbox', { name: 'Selecionar Reflexo', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Selecionar Roda', exact: true }).check()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar selecionadas (GLB)', exact: true }).click()
  const { json: result, bin: buffer } = glb(await bytes(await download))
  expect(result.meshes).toHaveLength(2)
  const positions = result.meshes.map((mesh: any) => {
    const accessor = result.accessors[mesh.primitives[0].attributes.POSITION], view = result.bufferViews[accessor.bufferView], start = (view.byteOffset || 0) + (accessor.byteOffset || 0)
    return [0, 1, 2].map(i => buffer.readFloatLE(start + i * 12))
  })
  expect(positions).toEqual([[-3, -5, -4], [-1, 1, 0]])
  const indices = result.accessors[result.meshes[0].primitives[0].indices], view = result.bufferViews[indices.bufferView], start = (view.byteOffset || 0) + (indices.byteOffset || 0)
  const stride = indices.componentType === 5125 ? 4 : 2
  expect([0, 1, 2].map(i => stride === 4 ? buffer.readUInt32LE(start + i * stride) : buffer.readUInt16LE(start + i * stride))).toEqual([2, 1, 0])
})

test('cancelling an export before the exporter loads prevents a download and allows retrying', async ({ page }) => {
  await setup(page)
  await page.getByRole('checkbox', { name: 'Selecionar Carroceria', exact: true }).check()
  let release!: () => void, requested!: () => void
  const gate = new Promise<void>(resolve => { release = resolve }), intercepted = new Promise<void>(resolve => { requested = resolve })
  await page.route('**/src/viewer/export.ts*', async route => { requested(); await gate; await route.continue() })
  const downloads: Download[] = []; page.on('download', download => downloads.push(download))
  await page.getByRole('button', { name: 'Baixar peça (GLB)', exact: true }).click()
  await intercepted
  await page.getByRole('button', { name: 'Cancelar download', exact: true }).click()
  release()
  await expect(page.getByRole('button', { name: 'Baixar peça (GLB)', exact: true })).toBeEnabled()
  await expect(page.locator('.toolsError')).toHaveCount(0)
  expect(downloads).toHaveLength(0)
  const retry = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar peça (GLB)', exact: true }).click()
  expect(glb(await bytes(await retry)).json.meshes).toHaveLength(1)
  expect(downloads).toHaveLength(1)
})

test('a separate OBJ opacity map is baked into the exported base-color alpha', async ({ page }) => {
  await setup(page)
  const images = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = '#ff0000'; context.fillRect(0, 0, 1, 1); const color = canvas.toDataURL().split(',')[1]
    context.fillStyle = '#808080'; context.fillRect(0, 0, 1, 1); return { color, opacity: canvas.toDataURL().split(',')[1] }
  })
  const packed = Buffer.from(zipSync({ 'car.obj': strToU8(obj), 'car.mtl': strToU8(mtl.replace('map_Kd color.png', 'map_Kd color.png\nmap_d opacity.png')), 'color.png': Buffer.from(images.color, 'base64'), 'opacity.png': Buffer.from(images.opacity, 'base64') }))
  await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file('alpha.zip', packed))
  await expect(page.locator('.viewerStats')).toContainText('3 peças', { timeout: 20000 })
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Baixar peça Carroceria', exact: true }).click()
  const { json, bin } = glb(await bytes(await download)), view = json.bufferViews[json.images[0].bufferView]
  expect(json.materials[0].alphaMode).toBe('BLEND')
  const image = bin.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)
  const pixel = await page.evaluate(async encoded => {
    const image = await createImageBitmap(await (await fetch('data:image/png;base64,' + encoded)).blob())
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1
    const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0)
    return [...context.getImageData(0, 0, 1, 1).data]
  }, image.toString('base64'))
  expect(pixel).toEqual([255, 0, 0, 128])
})

test('separate ZIP exports contain one self-contained GLB per selected piece and preserve assembly coordinates', async ({ page }) => {
  await setup(page)
  await page.getByRole('checkbox', { name: 'Selecionar Carroceria', exact: true }).check()
  await page.getByRole('checkbox', { name: 'Selecionar Roda', exact: true }).check()
  const packedDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Peças separadas (ZIP)', exact: true }).click()
  const files = unzipSync(await bytes(await packedDownload)), names = Object.keys(files)
  expect(names).toEqual(['001_Carroceria.glb', '002_Roda.glb'])
  const coordinate = (data: Uint8Array) => {
    const { json, bin } = glb(Buffer.from(data)), accessor = json.accessors[json.meshes[0].primitives[0].attributes.POSITION], view = json.bufferViews[accessor.bufferView]
    return bin.readFloatLE((view.byteOffset || 0) + (accessor.byteOffset || 0))
  }
  // Both originally start at x=-1; independent files must share the same origin.
  expect(coordinate(files[names[0]])).toBe(coordinate(files[names[1]]))
  for (const name of names) {
    const parsed = glb(Buffer.from(files[name])); expect(parsed.json.meshes).toHaveLength(1)
    expect(parsed.json.materials).toHaveLength(1)
    expect(parsed.json.buffers[0].uri).toBeUndefined()
    await page.getByLabel('Abrir arquivos no visualizador', { exact: true }).setInputFiles(file(name, Buffer.from(files[name])))
    await expect(page.locator('.viewerStats')).toContainText('1 peças', { timeout: 20000 })
  }
})
