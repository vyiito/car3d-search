import { VIEWER_LIMITS } from './files'

export type TextureKind = 'dds' | 'tga' | 'image' | 'ktx2'
export async function inspectTexture(file: Blob, name: string): Promise<{ kind: TextureKind; pixels: number }> {
  const bytes = new Uint8Array(await file.slice(0, 1024 * 1024).arrayBuffer())
  const data = new DataView(bytes.buffer)
  let width = 0, height = 0, kind: TextureKind = 'image'
  if (bytes.length < 18) throw new Error(`Textura vazia ou incompleta: ${name}`)
  if (data.getUint32(0, true) === 0x20534444) {
    if (bytes.length < 128) throw new Error(`DDS incompleto: ${name}`)
    kind = 'dds'; height = data.getUint32(12, true); width = data.getUint32(16, true)
  } else if (data.getUint32(0) === 0x89504e47) { width = data.getUint32(16); height = data.getUint32(20) }
  else if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let offset = 2; offset + 9 < bytes.length;) {
      if (bytes[offset++] !== 0xff) continue
      const marker = bytes[offset++]
      if (marker === 0xff || marker === 0x00 || marker === 0xd8) continue
      if (marker === 0xd9 || marker === 0xda) break
      const size = data.getUint16(offset)
      if (size < 2) break
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)) { height = data.getUint16(offset + 3); width = data.getUint16(offset + 5); break }
      offset += size
    }
  } else if (String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF') {
    const format = String.fromCharCode(...bytes.subarray(12, 16))
    if (format === 'VP8X') { width = 1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16); height = 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16) }
    else if (format === 'VP8L') { width = 1 + bytes[21] + ((bytes[22] & 63) << 8); height = 1 + (bytes[22] >> 6) + (bytes[23] << 2) + ((bytes[24] & 15) << 10) }
    else if (format === 'VP8 ') { width = data.getUint16(26, true) & 0x3fff; height = data.getUint16(28, true) & 0x3fff }
  } else if (bytes[0] === 0x42 && bytes[1] === 0x4d) { width = Math.abs(data.getInt32(18, true)); height = Math.abs(data.getInt32(22, true)) }
  else if (bytes[0] === 0xab && bytes[1] === 0x4b && bytes[5] === 0x32) { kind = 'ktx2'; width = data.getUint32(20, true); height = data.getUint32(24, true) }
  else if (/\.tga$/i.test(name)) { kind = 'tga'; width = data.getUint16(12, true); height = data.getUint16(14, true) }
  else throw new Error(`Formato de textura não reconhecido: ${name}`)
  if (!width || !height || width > 8192 || height > 8192 || width * height > VIEWER_LIMITS.pixels) throw new Error(`A textura ${name} excede 8192 × 8192 ou está inválida.`)
  return { kind, pixels: width * height }
}

/** DXT fallback for devices without S3TC support, including mobile GPUs. */
export function decodeDxt(buffer: ArrayBuffer): { data: Uint8Array<ArrayBuffer>; width: number; height: number } {
  const view = new DataView(buffer)
  const width = view.getUint32(16, true), height = view.getUint32(12, true)
  const format = String.fromCharCode(...new Uint8Array(buffer, 84, 4))
  if (!['DXT1', 'DXT3', 'DXT5'].includes(format)) throw new Error(`DDS ${format} não suportado neste dispositivo.`)
  const stride = format === 'DXT1' ? 8 : 16
  if (128 + Math.ceil(width / 4) * Math.ceil(height / 4) * stride > buffer.byteLength) throw new Error('DDS incompleto.')
  const output = new Uint8Array(width * height * 4)
  const color = (word: number) => [Math.round((word >> 11) * 255 / 31), Math.round(((word >> 5) & 63) * 255 / 63), Math.round((word & 31) * 255 / 31), 255]
  let offset = 128
  for (let y = 0; y < height; y += 4) for (let x = 0; x < width; x += 4, offset += stride) {
    const colorsAt = offset + (stride === 16 ? 8 : 0)
    const c0 = view.getUint16(colorsAt, true), c1 = view.getUint16(colorsAt + 2, true)
    const palette = [color(c0), color(c1), [0, 0, 0, 255], [0, 0, 0, 255]]
    for (let channel = 0; channel < 3; channel++) {
      if (c0 > c1 || format !== 'DXT1') { palette[2][channel] = Math.round((2 * palette[0][channel] + palette[1][channel]) / 3); palette[3][channel] = Math.round((palette[0][channel] + 2 * palette[1][channel]) / 3) }
      else { palette[2][channel] = Math.round((palette[0][channel] + palette[1][channel]) / 2); palette[3][3] = 0 }
    }
    const indices = view.getUint32(colorsAt + 4, true)
    const alpha = [view.getUint8(offset), view.getUint8(offset + 1)]
    if (format === 'DXT5') {
      if (alpha[0] > alpha[1]) for (let i = 1; i <= 6; i++) alpha.push(((7 - i) * alpha[0] + i * alpha[1]) / 7)
      else { for (let i = 1; i <= 4; i++) alpha.push(((5 - i) * alpha[0] + i * alpha[1]) / 5); alpha.push(0, 255) }
    }
    let alphaIndices = 0
    if (format === 'DXT5') for (let i = 0; i < 6; i++) alphaIndices += view.getUint8(offset + 2 + i) * 2 ** (8 * i)
    for (let pixel = 0; pixel < 16; pixel++) {
      const px = x + pixel % 4, py = y + Math.floor(pixel / 4)
      if (px >= width || py >= height) continue
      const rgba = [...palette[(indices >>> (pixel * 2)) & 3]]
      if (format === 'DXT3') rgba[3] = ((view.getUint8(offset + Math.floor(pixel / 2)) >> ((pixel % 2) * 4)) & 15) * 17
      if (format === 'DXT5') rgba[3] = Math.round(alpha[Math.floor(alphaIndices / 2 ** (pixel * 3)) % 8])
      output.set(rgba, (py * width + px) * 4)
    }
  }
  return { data: output, width, height }
}

/** Decode RGB/alpha/luminance DDS using its channel masks and row pitch. */
export function decodeRawDds(buffer: ArrayBuffer): { data: Uint8Array<ArrayBuffer>; width: number; height: number } {
  const view = new DataView(buffer)
  const width = view.getUint32(16, true), height = view.getUint32(12, true), flags = view.getUint32(80, true), bits = view.getUint32(88, true)
  if (![8, 16, 24, 32].includes(bits) || view.getUint32(84, true)) throw new Error('Formato DDS não suportado.')
  const bytesPerPixel = bits / 8, minimumPitch = width * bytesPerPixel
  const pitch = view.getUint32(8, true) & 8 ? Math.max(view.getUint32(20, true), minimumPitch) : minimumPitch
  if (128 + (height - 1) * pitch + minimumPitch > buffer.byteLength) throw new Error('DDS incompleto.')
  const masks = [92, 96, 100, 104].map(offset => view.getUint32(offset, true))
  const channels = masks.map(mask => {
    let shift = 0
    while (shift < 31 && !((mask >>> shift) & 1)) shift++
    return { mask, shift, scale: mask ? 255 / (mask >>> shift) : 0 }
  })
  const channel = (value: number, index: number, fallback: number) => channels[index].mask ? Math.round(((value & channels[index].mask) >>> channels[index].shift) * channels[index].scale) : fallback
  const output = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const offset = 128 + y * pitch + x * bytesPerPixel
    let value = 0
    for (let i = 0; i < bytesPerPixel; i++) value += view.getUint8(offset + i) * 2 ** (i * 8)
    const luminance = Boolean(flags & 0x20000), alphaOnly = !(flags & (0x40 | 0x20000)) && Boolean(flags & 2)
    const red = channel(value, 0, alphaOnly ? 255 : 0), out = (y * width + x) * 4
    output[out] = red; output[out + 1] = luminance ? red : channel(value, 1, alphaOnly ? 255 : 0); output[out + 2] = luminance ? red : channel(value, 2, alphaOnly ? 255 : 0)
    output[out + 3] = alphaOnly && !masks[3] ? value & 255 : channel(value, 3, 255)
  }
  return { data: output, width, height }
}
