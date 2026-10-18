import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js'
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DDSLoader } from 'three/addons/loaders/DDSLoader.js'
import { TGALoader } from 'three/addons/loaders/TGALoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { aborted, cleanPath, findFile, VIEWER_LIMITS, type ModelBundle } from './files'
import { decodeDxt, decodeRawDds, inspectTexture, type TextureKind } from './textures'
import type { PreparedModel } from './model'

export type Part = { id: string; name: string; visible: boolean; triangles: number; materials: string[] }
export type Surface = { id: string; name: string; color: string; opacity: number; roughness: number; metalness: number; texture: string | null }
export type ModelInfo = { parts: Part[]; materials: Surface[]; triangles: number; vertices: number; dimensions: number[]; textures: number }
export type View = 'perspective' | 'front' | 'side' | 'top'
export type ViewerRuntime = {
  dispose: () => void; select: (id: string | null) => void; visibility: (id: string) => void; isolate: (id: string) => void; showAll: () => void;
  fit: (id?: string) => void; view: (view: View) => void; wireframe: (enabled: boolean) => void; rotate: (enabled: boolean) => void; grid: (enabled: boolean) => void;
  surface: (id: string, patch: Partial<Pick<Surface, 'color' | 'opacity' | 'roughness' | 'metalness'>>) => void;
  resetSurface: (id: string) => void; replaceTexture: (id: string, file: File) => Promise<void>; screenshot: () => Promise<Blob>;
}
type Hooks = { select: (id: string | null) => void; change: (info: ModelInfo) => void; warning: (message: string) => void }
const texturePattern = /\.(png|jpe?g|webp|bmp|dds|tga|ktx2)(?:[?#].*)?$/i
const FALLBACK_IMAGE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGOYPWXZfwAGeALV6MNEnwAAAABJRU5ErkJggg=='

export async function createViewer(host: HTMLElement, bundle: ModelBundle, modelPath: string, signal: AbortSignal, hooks: Hooks, prepared: PreparedModel): Promise<ViewerRuntime> {
  signal.throwIfAborted()
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2))
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1
  renderer.domElement.setAttribute('aria-label', 'Modelo 3D: arraste para girar, role para aproximar. Use a lista Peças para selecionar pelo teclado.')
  renderer.domElement.setAttribute('role', 'img')
  host.appendChild(renderer.domElement)
  const scene = new THREE.Scene()
  scene.background = new THREE.Color('#100d17')
  const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 1000)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.autoRotate = false
  controls.autoRotateSpeed = 0.65
  const environment = new RoomEnvironment()
  const pmrem = new THREE.PMREMGenerator(renderer)
  const environmentTarget = pmrem.fromScene(environment, 0.04)
  scene.environment = environmentTarget.texture
  environment.dispose(); pmrem.dispose()
  scene.add(new THREE.HemisphereLight(0xe9e4ff, 0x29212e, 1.8))
  const key = new THREE.DirectionalLight(0xfff8f0, 2.6); key.position.set(5, 8, 5); scene.add(key)
  const fill = new THREE.DirectionalLight(0xc7b5ff, 1.3); fill.position.set(-4, 3, -5); scene.add(fill)
  const grid = new THREE.GridHelper(20, 20, 0x685181, 0x30243e)
  scene.add(grid)
  const selection = new THREE.Box3Helper(new THREE.Box3(), 0xb98bff); selection.visible = false; scene.add(selection)
  const manager = new THREE.LoadingManager()
  const urls = new Map<string, string>(), generated = new Set<string>(), textures = new Set<THREE.Texture>(), materials = new Set<THREE.Material>(), geometries = new Set<THREE.BufferGeometry>()
  const decoderUrls = new Set(['basis/basis_transcoder.js', 'basis/basis_transcoder.wasm', 'draco/draco_wasm_wrapper.js', 'draco/draco_decoder.wasm'].map(path => new URL(`${import.meta.env.BASE_URL}vendor/three/${path}`, location.href).href))
  const kinds = new Map<string, TextureKind>(), rawDds = new Set<string>(), cpuDxt = new Set<string>(), badTextures = new Set<string>()
  const meshes = new Map<string, THREE.Mesh>(), surfaces = new Map<string, { live: THREE.MeshStandardMaterial; original: THREE.MeshStandardMaterial }>()
  const replacementPixels = new Map<string, number>()
  const draco = new DRACOLoader().setDecoderPath({ js: `${import.meta.env.BASE_URL}vendor/three/draco/draco_wasm_wrapper.js`, wasm: `${import.meta.env.BASE_URL}vendor/three/draco/draco_decoder.wasm` })
  const ktx = new KTX2Loader(manager).setTranscoderPath(`${import.meta.env.BASE_URL}vendor/three/basis/`).detectSupport(renderer)
  const modelParent = modelPath.slice(0, modelPath.lastIndexOf('/') + 1)
  let disposed = false, root: THREE.Object3D | null = null, selected: string | null = null, wireframe = false, inView = true, pixelCount = 0
  let loadedTextures = 0, pending = 0
  const waiters: (() => void)[] = []
  const originalStart = manager.itemStart.bind(manager), originalEnd = manager.itemEnd.bind(manager)
  manager.itemStart = url => { pending++; originalStart(url) }
  manager.itemEnd = url => { pending--; originalEnd(url); if (!pending) waiters.splice(0).forEach(resolve => resolve()) }
  const warning = (message: string) => { if (!disposed) hooks.warning(message) }
  manager.onError = url => warning(`Uma textura não pôde ser aberta: ${url.startsWith('blob:') ? 'arquivo de imagem' : url.replace(/^vjlocal:\/\//, '')}.`)
  const lookup = (url: string) => findFile(bundle, url.replace(/^vjlocal:\/\//, ''))
  function localUrl(path: string, file: File) {
    let url = urls.get(path)
    if (!url) { url = URL.createObjectURL(file); urls.set(path, url); generated.add(url) }
    return url
  }
  manager.setURLModifier(url => {
    if (disposed || signal.aborted) throw aborted()
    if (url.startsWith('blob:') || url.startsWith('data:')) return url
    if (decoderUrls.has(new URL(url, location.href).href)) return new URL(url, location.href).href
    const match = lookup(url)
    if (match) return localUrl(...match)
    if (texturePattern.test(url)) { warning(`Textura ausente: ${url.replace(/^vjlocal:\/\//, '')}. Selecione também a pasta de texturas.`); return FALLBACK_IMAGE }
    throw new Error('Um arquivo necessário não está na seleção. Abra a pasta completa do modelo.')
  })
  const rememberTexture = <T extends THREE.Texture>(texture: T) => { textures.add(texture); return texture }
  class LocalTextureLoader extends THREE.Loader<THREE.Texture> {
    load(url: string, onLoad?: (texture: THREE.Texture) => void, onProgress?: (event: ProgressEvent) => void, onError?: (error: unknown) => void): THREE.Texture {
      const found = lookup(url), kind = found ? kinds.get(found[0]) : 'image'
      const done = (texture: THREE.Texture) => {
        rememberTexture(texture)
        texture.name = found?.[0].split('/').pop() || 'Textura ausente'
        if (disposed) texture.dispose()
        else onLoad?.(texture)
      }
      const fail = (error: unknown) => { warning(`Não foi possível carregar ${found?.[0] || 'uma textura'}.`); onError?.(error) }
      if (found && (badTextures.has(found[0]) || rawDds.has(found[0]) || cpuDxt.has(found[0]) || (kind === 'dds' && !renderer.extensions.has('WEBGL_compressed_texture_s3tc')))) {
        const texture = rememberTexture(new THREE.DataTexture(new Uint8Array([155, 148, 166, 255]), 1, 1))
        texture.needsUpdate = true
        manager.itemStart(url)
        void (async () => {
          try {
            if (!badTextures.has(found[0])) {
              const buffer = await found[1].arrayBuffer()
              const decoded = rawDds.has(found[0]) ? decodeRawDds(buffer) : decodeDxt(buffer)
              if (disposed) return
              texture.image = { data: decoded.data, width: decoded.width, height: decoded.height }
              texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.needsUpdate = true
            }
            done(texture)
          } catch (error) { warning(error instanceof Error ? error.message : 'DDS não suportado.'); done(texture) }
          finally { manager.itemEnd(url) }
        })()
        return texture
      }
      if (kind === 'ktx2') {
        const texture = rememberTexture(new THREE.Texture())
        const task = url + '#decode'
        manager.itemStart(task)
        ktx.load(url, loaded => {
          texture.copy(loaded)
          Object.assign(texture, { isCompressedTexture: Boolean(loaded.isCompressedTexture), isDataTexture: Boolean('isDataTexture' in loaded && loaded.isDataTexture) })
          loaded.dispose(); done(texture); manager.itemEnd(task)
        }, onProgress, error => { fail(error); manager.itemEnd(task) })
        return texture
      }
      const loader = kind === 'dds' ? new DDSLoader(manager) : kind === 'tga' ? new TGALoader(manager) : new THREE.TextureLoader(manager)
      return rememberTexture(loader.load(url, done, onProgress, fail))
    }
  }
  const textureHandler = new LocalTextureLoader(manager)
  manager.addHandler(texturePattern, textureHandler)
  let resize: ResizeObserver | undefined, intersection: IntersectionObserver | undefined
  const track = (object: THREE.Object3D) => object.traverse(node => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value)
    }
  })
  function dispose() {
    if (disposed) return
    disposed = true
    signal.removeEventListener('abort', dispose)
    manager.abort()
    resize?.disconnect(); intersection?.disconnect(); renderer.setAnimationLoop(null)
    renderer.domElement.removeEventListener('pointerdown', pointerDown)
    renderer.domElement.removeEventListener('pointerup', pointerUp)
    controls.dispose(); draco.dispose(); ktx.dispose()
    track(scene)
    geometries.forEach(value => value.dispose()); materials.forEach(value => value.dispose()); textures.forEach(value => { value.dispose(); (value.source.data as ImageBitmap)?.close?.() })
    environmentTarget.dispose(); selection.geometry.dispose(); (selection.material as THREE.Material).dispose()
    renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove()
    generated.forEach(url => URL.revokeObjectURL(url)); generated.clear(); urls.clear()
    waiters.splice(0).forEach(resolve => resolve())
  }
  signal.addEventListener('abort', dispose, { once: true })
  const parts = (): Part[] => [...meshes].map(([id, mesh], index) => ({ id, name: mesh.name || `Peça ${index + 1}`, visible: mesh.visible, triangles: Math.floor((mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3), materials: (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).map(material => material.uuid) }))
  const materialInfo = (): Surface[] => [...surfaces].map(([id, { live }], index) => ({ id, name: live.name || `Material ${index + 1}`, color: '#' + live.color.getHexString(), opacity: live.opacity, metalness: live.metalness, roughness: live.roughness, texture: live.map ? live.map.name || 'Textura incorporada' : null }))
  const bounds = () => root ? new THREE.Box3().setFromObject(root) : new THREE.Box3()
  function update() {
    if (disposed) return
    const piece = selected ? meshes.get(selected) : null
    selection.visible = Boolean(piece?.visible)
    if (piece) selection.box.setFromObject(piece)
    const list = parts()
    hooks.change({ parts: list, materials: materialInfo(), triangles: list.reduce((sum, part) => sum + part.triangles, 0), vertices: [...meshes.values()].reduce((sum, mesh) => sum + mesh.geometry.attributes.position.count, 0), dimensions: bounds().getSize(new THREE.Vector3()).toArray(), textures: loadedTextures })
  }
  function select(id: string | null) { selected = id && meshes.has(id) ? id : null; update(); hooks.select(selected) }
  function fit(id?: string, direction?: THREE.Vector3) {
    const object = id ? meshes.get(id) : root
    if (!object || disposed) return
    const box = new THREE.Box3().setFromObject(object), size = box.getSize(new THREE.Vector3()), center = box.getCenter(new THREE.Vector3())
    const aspect = Math.min(camera.aspect, 1)
    const distance = Math.max(size.length() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / aspect * 1.15, 0.01)
    const axis = direction || camera.position.clone().sub(controls.target).normalize()
    if (axis.lengthSq() < 0.1) axis.set(1, 0.5, 1).normalize()
    camera.position.copy(center).addScaledVector(axis.normalize(), distance)
    camera.near = distance / 1000; camera.far = distance * 1000; camera.updateProjectionMatrix()
    controls.target.copy(center); controls.minDistance = distance / 100; controls.maxDistance = distance * 30; controls.update()
  }
  let down = { x: 0, y: 0 }
  function pointerDown(event: PointerEvent) { down = { x: event.clientX, y: event.clientY } }
  function pointerUp(event: PointerEvent) {
    if (event.button || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 6) return
    const rect = renderer.domElement.getBoundingClientRect(), point = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1)
    const ray = new THREE.Raycaster(); ray.setFromCamera(point, camera)
    const hit = ray.intersectObjects([...meshes.values()].filter(mesh => mesh.visible), false)[0]
    select(hit?.object.uuid || null)
  }
  try {
    for (const [name, file] of bundle.files) if (texturePattern.test(name)) {
      signal.throwIfAborted()
      try {
        const result = await inspectTexture(file, name)
        pixelCount += result.pixels; loadedTextures++; kinds.set(name, result.kind)
        if (result.kind === 'dds') {
          const header = new DataView(await file.slice(0, 128).arrayBuffer())
          const code = header.getUint32(84, true)
          if (!code) rawDds.add(name)
          else if (![0x31545844, 0x33545844, 0x35545844].includes(code) || header.getUint32(112, true) & 0x200) { badTextures.add(name); warning(`DDS não suportado nesta prévia: ${name}. Use PNG, DDS RGB, DXT1, DXT3 ou DXT5.`) }
          else if (header.getUint32(16, true) % 4 || header.getUint32(12, true) % 4) cpuDxt.add(name)
        }
        if (pixelCount > VIEWER_LIMITS.pixels) throw new Error('As texturas excedem 96 milhões de pixels. Reduza suas resoluções para visualizar este modelo.')
      } catch (error) {
        if (pixelCount > VIEWER_LIMITS.pixels) throw error
        badTextures.add(name); warning(error instanceof Error ? error.message : `Textura inválida: ${name}`)
      }
    }
    const { data } = prepared
    signal.throwIfAborted()
    if (/\.obj$/i.test(modelPath)) {
      const text = new TextDecoder().decode(data)
      let triangles = 0, vertices = 0
      for (const match of text.matchAll(/^(v|f)\s+([^\r\n]+)/gm)) {
        if (match[1] === 'v') vertices++
        else triangles += Math.max(0, match[2].trim().split(/\s+/).length - 2)
        if (triangles > VIEWER_LIMITS.triangles || vertices > 6_000_000) throw new Error('A malha excede 2 milhões de triângulos. Use uma versão com menos polígonos.')
      }
      const loader = new OBJLoader(manager)
      const declared = [...text.matchAll(/^mtllib\s+([^\r\n]+)/gm)].map(match => match[1].trim())
      const available = declared.flatMap(name => {
        const whole = findFile(bundle, name, modelParent)
        return whole ? [whole] : name.split(/\s+/).flatMap(part => { const file = findFile(bundle, part, modelParent); return file ? [file] : [] })
      })
      if (!available.length) { const fallback = findFile(bundle, modelPath.replace(/\.obj$/i, '.mtl')); if (fallback) available.push(fallback) }
      if (available.length) {
        const library = new MTLLoader(manager).parse('', '')
        for (const [path, file] of available) {
          const parsed = new MTLLoader(manager).parse(await file.text(), 'vjlocal://' + path.slice(0, path.lastIndexOf('/') + 1))
          // A shared diffuse/opacity image already supplies alpha via the color map.
          for (const material of Object.values(parsed.materialsInfo)) if (material.map_d && material.map_d === material.map_kd) delete material.map_d
          library.materials = { ...library.materials, ...parsed.materials }
          // MaterialCreator creates textures lazily; preload before combining libraries.
          parsed.preload(); library.materials = { ...library.materials, ...parsed.materials }
        }
        library.create = name => library.materials[name] || new THREE.MeshPhongMaterial({ name, color: 0xb7afc2 })
        loader.setMaterials(library)
      } else warning('Nenhum MTL encontrado. A geometria será exibida com material neutro; abra também o MTL e as texturas para ver o acabamento.')
      signal.throwIfAborted()
      root = loader.parse(text)
    } else {
      const document = prepared.document!, binary = prepared.binary
      for (const image of document.images || []) {
        let blob: Blob | undefined
        if (image.uri?.startsWith('data:')) {
          if (!/^data:image\/(png|jpeg|webp|ktx2);base64,/i.test(image.uri)) throw new Error('O glTF contém uma imagem incorporada não suportada.')
          blob = await (await fetch(image.uri, { signal })).blob()
        } else if (image.bufferView !== undefined) {
          const view = document.bufferViews?.[image.bufferView], buffer = document.buffers?.[view?.buffer || 0]
          let bytes: Uint8Array | undefined = binary
          if (buffer?.uri && !buffer.uri.startsWith('data:')) bytes = new Uint8Array(await findFile(bundle, buffer.uri, modelParent)![1].arrayBuffer())
          else if (buffer?.uri?.startsWith('data:')) bytes = new Uint8Array(await (await fetch(buffer.uri, { signal })).arrayBuffer())
          if (view && bytes) blob = new Blob([bytes.slice(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength) as Uint8Array<ArrayBuffer>])
        }
        if (blob) { const result = await inspectTexture(blob, 'imagem incorporada'); pixelCount += result.pixels; loadedTextures++ }
        if (pixelCount > VIEWER_LIMITS.pixels) throw new Error('As texturas excedem 96 milhões de pixels. Use uma versão menor.')
      }
      const loader = new GLTFLoader(manager).setDRACOLoader(draco).setKTX2Loader(ktx).setMeshoptDecoder(MeshoptDecoder)
      root = (await loader.parseAsync(data, 'vjlocal://' + modelParent)).scene
    }
    track(root)
    signal.throwIfAborted()
    if (pending) await new Promise<void>(resolve => waiters.push(resolve))
    signal.throwIfAborted()
    let totalTriangles = 0
    root.traverse(object => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh || !mesh.geometry.attributes.position) return
      totalTriangles += (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3
      meshes.set(mesh.uuid, mesh)
      const convert = (material: THREE.Material) => {
        const cached = [...surfaces.values()].find(value => value.original.userData.sourceId === material.uuid)
        if (cached) return cached.live
        const source = material as THREE.MeshStandardMaterial & THREE.MeshPhongMaterial
        const live = source.isMeshStandardMaterial ? source.clone() : new THREE.MeshStandardMaterial({ name: source.name, color: source.color || 0xb7afc2, map: source.map || null, normalMap: source.normalMap || null, bumpMap: source.bumpMap || null, alphaMap: source.alphaMap || null, opacity: source.opacity, transparent: source.transparent, side: source.side, roughness: Math.sqrt(2 / ((source.shininess || 20) + 2)), metalness: 0 })
        const original = live.clone(); original.userData.sourceId = material.uuid
        surfaces.set(live.uuid, { live, original }); materials.add(live); materials.add(original)
        return live
      }
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convert) : convert(mesh.material)
    })
    if (!meshes.size || meshes.size > 4000 || surfaces.size > 512 || totalTriangles > VIEWER_LIMITS.triangles) throw new Error('Modelo vazio ou grande demais. O limite é 2 milhões de triângulos e 4.000 peças.')
    const box = new THREE.Box3().setFromObject(root), size = box.getSize(new THREE.Vector3())
    if (box.isEmpty() || !size.toArray().every(Number.isFinite) || !size.length() || size.length() > 1e9) throw new Error('O arquivo não contém uma geometria válida para visualizar.')
    root.position.sub(box.getCenter(new THREE.Vector3())); scene.add(root)
    grid.scale.setScalar(size.length() / 12); grid.position.y = -size.y / 2
    const onResize = () => { const width = host.clientWidth, height = host.clientHeight; if (!width || !height || disposed) return; renderer.setSize(width, height, false); camera.aspect = width / height; camera.updateProjectionMatrix() }
    resize = new ResizeObserver(onResize); resize.observe(host); onResize(); fit(undefined, new THREE.Vector3(1, 0.5, 1))
    intersection = new IntersectionObserver(entries => { inView = entries[0].isIntersecting }); intersection.observe(host)
    renderer.domElement.addEventListener('pointerdown', pointerDown); renderer.domElement.addEventListener('pointerup', pointerUp)
    let previous = performance.now()
    renderer.setAnimationLoop(time => { const delta = Math.min((time - previous) / 1000, 0.05); previous = time; if (disposed || document.hidden || !inView) return; controls.update(delta); renderer.render(scene, camera) })
    update()
    return {
      dispose, select, fit, visibility: id => { const mesh = meshes.get(id); if (mesh) mesh.visible = !mesh.visible; update() },
      isolate: id => { meshes.forEach((mesh, key) => { mesh.visible = key === id }); select(id); fit(id) },
      showAll: () => { meshes.forEach(mesh => { mesh.visible = true }); update(); fit() },
      view: view => { camera.up.set(0, 1, 0); const axis = { perspective: new THREE.Vector3(1, 0.5, 1), front: new THREE.Vector3(0, 0, 1), side: new THREE.Vector3(1, 0, 0), top: new THREE.Vector3(0, 1, 0.0001) }; fit(undefined, axis[view]) },
      wireframe: enabled => { wireframe = enabled; surfaces.forEach(({ live }) => { live.wireframe = enabled }) },
      rotate: enabled => { controls.autoRotate = enabled }, grid: enabled => { grid.visible = enabled },
      surface: (id, patch) => { const entry = surfaces.get(id); if (!entry) return; if (patch.color) entry.live.color.set(patch.color); for (const key of ['opacity', 'roughness', 'metalness'] as const) if (patch[key] !== undefined) entry.live[key] = THREE.MathUtils.clamp(patch[key], 0, 1); entry.live.transparent = entry.live.opacity < 1 || entry.original.transparent; entry.live.needsUpdate = true; update() },
      resetSurface: id => { const entry = surfaces.get(id); if (!entry) return; const old = entry.live.map; entry.live.copy(entry.original); entry.live.wireframe = wireframe; replacementPixels.delete(id); if (old && old !== entry.original.map && ![...surfaces.values()].some(other => other.live.map === old || other.original.map === old)) { old.dispose(); textures.delete(old) } update() },
      replaceTexture: async (id, file) => {
        const entry = surfaces.get(id)
        if (!entry) return
        if (file.size > 32 * 1024 ** 2) throw new Error('A textura deve ter até 32 MB.')
        const result = await inspectTexture(file, file.name)
        if (result.pixels + pixelCount + [...replacementPixels.values()].reduce((sum, pixels) => sum + pixels, 0) - (replacementPixels.get(id) || 0) > VIEWER_LIMITS.pixels) throw new Error('A textura excede a memória reservada para esta prévia.')
        signal.throwIfAborted()
        const name = `replacement-${crypto.randomUUID()}/${file.name}`
        bundle.files.set(name, file); kinds.set(name, result.kind)
        if (result.kind === 'dds') {
          const header = new DataView(await file.slice(0, 128).arrayBuffer()), code = header.getUint32(84, true)
          if (!code) rawDds.add(name)
          else if (![0x31545844, 0x33545844, 0x35545844].includes(code)) { bundle.files.delete(name); kinds.delete(name); throw new Error('Use DDS RGB, DXT1, DXT3 ou DXT5 nesta prévia.') }
          else if (header.getUint32(16, true) % 4 || header.getUint32(12, true) % 4) cpuDxt.add(name)
        }
        try {
          const texture = await new Promise<THREE.Texture>((resolve, reject) => textureHandler.load(name, resolve, undefined, reject))
          if (disposed) { texture.dispose(); throw aborted() }
          texture.colorSpace = THREE.SRGBColorSpace; texture.flipY = entry.original.map?.flipY ?? !/\.(glb|gltf)$/i.test(modelPath)
          const old = entry.live.map
          entry.live.map = texture; entry.live.color.set(0xffffff); entry.live.needsUpdate = true
          replacementPixels.set(id, result.pixels)
          if (old && old !== entry.original.map && ![...surfaces.values()].some(other => other.live.map === old || other.original.map === old)) { old.dispose(); textures.delete(old) }
          update()
        } finally { bundle.files.delete(name); kinds.delete(name); rawDds.delete(name); cpuDxt.delete(name); const url = urls.get(name); if (url) { URL.revokeObjectURL(url); generated.delete(url); urls.delete(name) } }
      },
      screenshot: () => new Promise((resolve, reject) => {
        const background = scene.background, visible = grid.visible, highlighted = selection.visible
        scene.background = null; grid.visible = false; selection.visible = false
        renderer.render(scene, camera)
        renderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.')), 'image/png')
        scene.background = background; grid.visible = visible; selection.visible = highlighted; renderer.render(scene, camera)
      }),
    }
  } catch (error) { if (root) track(root); dispose(); throw error }
}
