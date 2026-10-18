import * as THREE from 'three'
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js'
import { zip } from 'fflate'
import { VIEWER_LIMITS } from './files'

export type PieceExport = { blob: Blob; name: string }
const maxBytes = 256 * 1024 ** 2
const pause = () => new Promise<void>(resolve => setTimeout(resolve, 0))
const safeName = (name: string) => name.normalize('NFKC').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 80) || 'peca'

/** Snapshot only the selected geometry; helpers, other pieces and rigs never enter the export. */
export async function exportPieces(pieces: THREE.Mesh[], separate: boolean, renderer: THREE.WebGLRenderer, signal: AbortSignal, progress: (message: string) => void): Promise<PieceExport> {
  signal.throwIfAborted()
  if (!pieces.length) throw new Error('Selecione pelo menos uma peça para baixar.')
  const geometryCopies = new Set<THREE.BufferGeometry>(), materialCopies = new Map<THREE.Material, THREE.Material>(), textureCopies = new Map<string, THREE.Texture>(), ownedCanvases = new Set<HTMLCanvasElement>()
  let triangles = 0, geometryBytes = 0, pixels = 0
  const targetScene = new THREE.Scene(), camera = new THREE.Camera()
  const plane = new THREE.PlaneGeometry(2, 2)
  const blit = new THREE.ShaderMaterial({
    uniforms: { source: { value: null }, opacityMap: { value: null }, useAlpha: { value: false }, useColor: { value: true }, alphaTransform: { value: new THREE.Matrix3() } }, depthTest: false, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=vec4(position.xy,0.,1.);}',
    fragmentShader: 'uniform sampler2D source; uniform sampler2D opacityMap; uniform bool useAlpha; uniform bool useColor; uniform mat3 alphaTransform; varying vec2 vUv; void main(){gl_FragColor=useColor?texture2D(source,vUv):vec4(1.); if(useAlpha)gl_FragColor.a*=texture2D(opacityMap,(alphaTransform*vec3(vUv,1.)).xy).g;\n#include <colorspace_fragment>\n}',
  })
  const quad = new THREE.Mesh(plane, blit); quad.frustumCulled = false; targetScene.add(quad)
  function readableTexture(source: THREE.Texture, alpha?: THREE.Texture, useColor = true) {
    const key = source.uuid + (alpha ? ':' + alpha.uuid + ':' + useColor : '')
    const cached = textureCopies.get(key)
    if (cached) return cached
    signal.throwIfAborted()
    const image = (source.image || source.mipmaps?.[0]) as { width?: number; height?: number } | undefined
    const width = image?.width, height = image?.height
    if (!width || !height || width > renderer.capabilities.maxTextureSize || height > renderer.capabilities.maxTextureSize) throw new Error('Uma textura não pode ser exportada neste dispositivo. Use uma imagem menor.')
    pixels += width * height
    if (pixels > VIEWER_LIMITS.pixels) throw new Error('As texturas da seleção excedem a memória disponível. Exporte menos peças por vez.')
    if (!alpha && (source.image instanceof HTMLImageElement || source.image instanceof HTMLCanvasElement || source.image instanceof ImageBitmap || typeof OffscreenCanvas !== 'undefined' && source.image instanceof OffscreenCanvas)) {
      // Ordinary images already have exportable pixels; avoid GPU readback and preserve flipY.
      const copy = new THREE.Texture().copy(source); textureCopies.set(key, copy); return copy
    }
    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false, stencilBuffer: false, colorSpace: source.colorSpace === THREE.SRGBColorSpace ? THREE.SRGBColorSpace : THREE.NoColorSpace })
    const previousTarget = renderer.getRenderTarget(), viewport = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), scissorTest = renderer.getScissorTest()
    try {
      blit.uniforms.source.value = source
      blit.uniforms.opacityMap.value = alpha || source; blit.uniforms.useAlpha.value = Boolean(alpha); blit.uniforms.useColor.value = useColor
      if (alpha) {
        if (source.channel !== alpha.channel) throw new Error('O mapa de transparência usa outra coordenada UV. Prepare esse material no editor antes de exportar.')
        if (source.matrixAutoUpdate) source.updateMatrix()
        if (alpha.matrixAutoUpdate) alpha.updateMatrix()
        if (!source.matrix.determinant()) throw new Error('O mapa de transparência possui uma transformação UV inválida.')
        blit.uniforms.alphaTransform.value.copy(alpha.matrix).multiply(source.matrix.clone().invert())
      }
      renderer.setRenderTarget(target); renderer.setViewport(0, 0, width, height); renderer.setScissorTest(false)
      renderer.render(targetScene, camera)
      const bytes = new Uint8Array(width * height * 4)
      renderer.readRenderTargetPixels(target, 0, 0, width, height, bytes)
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height
      ownedCanvases.add(canvas)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('O navegador não conseguiu preparar as texturas para download.')
      const data = new Uint8ClampedArray(bytes.length), stride = width * 4
      for (let row = 0; row < height; row++) data.set(bytes.subarray(row * stride, (row + 1) * stride), (height - row - 1) * stride)
      context.putImageData(new ImageData(data, width, height), 0, 0)
      // The canvas records what UVs sample, including the source's upload orientation.
      const copy = new THREE.CanvasTexture(canvas)
      copy.name = source.name; copy.colorSpace = source.colorSpace; copy.flipY = true
      copy.wrapS = source.wrapS; copy.wrapT = source.wrapT; copy.magFilter = source.magFilter; copy.minFilter = source.minFilter
      copy.offset.copy(source.offset); copy.repeat.copy(source.repeat); copy.center.copy(source.center); copy.rotation = source.rotation; copy.channel = source.channel
      textureCopies.set(key, copy)
      return copy
    } finally {
      renderer.setRenderTarget(previousTarget); renderer.setViewport(viewport); renderer.setScissor(scissor); renderer.setScissorTest(scissorTest); target.dispose()
    }
  }
  async function copyMaterial(source: THREE.Material) {
    const cached = materialCopies.get(source)
    if (cached) return cached
    const copy = source.clone(); copy.userData = {}; materialCopies.set(source, copy)
    if ('wireframe' in copy) copy.wireframe = false
    const standard = source as THREE.MeshStandardMaterial
    for (const [key, value] of Object.entries(source)) if (value instanceof THREE.Texture && key !== 'envMap' && key !== 'alphaMap' && !(key === 'map' && standard.alphaMap)) {
      await pause(); signal.throwIfAborted()
      ;(copy as unknown as Record<string, unknown>)[key] = readableTexture(value)
    }
    if (standard.alphaMap) {
      await pause(); signal.throwIfAborted()
      const material = copy as THREE.MeshStandardMaterial
      material.map = readableTexture(standard.map || standard.alphaMap, standard.alphaMap, Boolean(standard.map)); material.alphaMap = null
    }
    if ('envMap' in copy) copy.envMap = null
    return copy
  }
  try {
    // Bound work before allocating snapshots (instances also count toward the limit).
    for (const piece of pieces) {
      const count = (piece as THREE.InstancedMesh).isInstancedMesh ? (piece as THREE.InstancedMesh).count : 1
      triangles += (piece.geometry.index?.count || piece.geometry.attributes.position.count) / 3 * count
      geometryBytes += (Object.values(piece.geometry.attributes).reduce((sum, attribute) => sum + attribute.count * attribute.itemSize * 4, 0) + (piece.geometry.index?.count || 0) * 4) * count
    }
    if (triangles > VIEWER_LIMITS.triangles || geometryBytes > 192 * 1024 ** 2) throw new Error('A seleção é grande demais para exportar de uma vez. Selecione menos peças.')
    const snapshots: THREE.Group[] = []
    for (let index = 0; index < pieces.length; index++) {
      await pause(); signal.throwIfAborted(); progress(`Preparando peça ${index + 1} de ${pieces.length}…`)
      const piece = pieces[index], group = new THREE.Group(); group.name = piece.name || `Peça ${index + 1}`
      piece.updateWorldMatrix(true, true)
      const instance = piece as THREE.InstancedMesh, skinned = piece as THREE.SkinnedMesh
      const count = instance.isInstancedMesh ? instance.count : 1
      if (skinned.isSkinnedMesh) skinned.skeleton.update()
      const material = await Promise.all((Array.isArray(piece.material) ? piece.material : [piece.material]).map(copyMaterial))
      for (let i = 0; i < count; i++) {
        const geometry = piece.geometry.clone(); geometryCopies.add(geometry)
        const deformed = skinned.isSkinnedMesh || Boolean(piece.morphTargetInfluences?.some(value => value !== 0))
        if (instance.isInstancedMesh && instance.morphTexture) throw new Error('Esta peça tem instâncias com deformações. Exporte uma versão estática do modelo.')
        if (deformed) {
          const position = geometry.attributes.position, vertex = new THREE.Vector3()
          for (let j = 0; j < position.count; j++) {
            if (j % 65536 === 0) { await pause(); signal.throwIfAborted() }
            piece.getVertexPosition(j, vertex); position.setXYZ(j, vertex.x, vertex.y, vertex.z)
          }
          geometry.computeVertexNormals(); geometry.deleteAttribute('tangent')
        }
        geometry.morphAttributes = {}; geometry.deleteAttribute('skinIndex'); geometry.deleteAttribute('skinWeight')
        const transform = piece.matrixWorld.clone()
        if (instance.isInstancedMesh) { const local = new THREE.Matrix4(); instance.getMatrixAt(i, local); transform.multiply(local) }
        geometry.applyMatrix4(transform)
        // Baking a mirrored world transform requires reversed winding to preserve front faces.
        if (transform.determinant() < 0) {
          if (!geometry.index) geometry.setIndex(Array.from({ length: geometry.attributes.position.count }, (_, j) => j))
          const indices = geometry.index!
          for (let j = 0; j + 2 < indices.count; j += 3) { const a = indices.getX(j); indices.setX(j, indices.getX(j + 2)); indices.setX(j + 2, a) }
          const tangent = geometry.attributes.tangent
          if (tangent) for (let j = 0; j < tangent.count; j++) tangent.setW(j, -tangent.getW(j))
        }
        const mesh = new THREE.Mesh(geometry, Array.isArray(piece.material) ? material : material[0]); mesh.name = group.name
        if (instance.isInstancedMesh && instance.instanceColor) {
          const color = new THREE.Color(); instance.getColorAt(i, color)
          const tinted = material.map(source => { const copy = source.clone() as THREE.MeshStandardMaterial; copy.color.multiply(color); materialCopies.set(copy, copy); return copy })
          mesh.material = Array.isArray(piece.material) ? tinted : tinted[0]
        }
        group.add(mesh)
      }
      snapshots.push(group)
    }
    const exporter = new GLTFExporter()
    const encode = async (input: THREE.Object3D) => {
      await pause(); signal.throwIfAborted()
      const data = await exporter.parseAsync(input, { binary: true, onlyVisible: false, animations: [], maxTextureSize: 8192 })
      signal.throwIfAborted()
      if (!(data instanceof ArrayBuffer) || data.byteLength > maxBytes) throw new Error('O download excede 256 MB. Exporte menos peças por vez.')
      return data
    }
    if (!separate || snapshots.length === 1) {
      progress('Gerando GLB com materiais e texturas…')
      const group = new THREE.Group(); snapshots.forEach(snapshot => group.add(snapshot))
      const data = await encode(group)
      return { blob: new Blob([data], { type: 'model/gltf-binary' }), name: snapshots.length === 1 ? `${safeName(snapshots[0].name)}.glb` : `selecao-${snapshots.length}-pecas.glb` }
    }
    const files: Record<string, Uint8Array> = {}; let total = 0
    for (let i = 0; i < snapshots.length; i++) {
      progress(`Gerando GLB ${i + 1} de ${snapshots.length}…`)
      const data = await encode(snapshots[i]); total += data.byteLength
      if (total > maxBytes) throw new Error('As peças separadas excedem 256 MB. Baixe grupos menores para evitar repetir muitas texturas.')
      files[`${String(i + 1).padStart(3, '0')}_${safeName(snapshots[i].name)}.glb`] = new Uint8Array(data)
    }
    progress('Empacotando as peças…')
    const packed = await new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
      const cancel = zip(files, { level: 0 }, (error, data) => { signal.removeEventListener('abort', abort); if (error) reject(error); else resolve(data as Uint8Array<ArrayBuffer>) })
      const abort = () => { cancel(); reject(signal.reason) }
      signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
    })
    signal.throwIfAborted()
    if (packed.byteLength > maxBytes) throw new Error('O ZIP excede 256 MB. Exporte menos peças por vez.')
    return { blob: new Blob([packed], { type: 'application/zip' }), name: `pecas-separadas-${snapshots.length}.zip` }
  } finally {
    geometryCopies.forEach(geometry => geometry.dispose()); materialCopies.forEach(material => material.dispose())
    textureCopies.forEach(texture => texture.dispose()); ownedCanvases.forEach(canvas => { canvas.width = 0; canvas.height = 0 })
    plane.dispose(); blit.dispose()
  }
}
