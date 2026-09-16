import { useEffect, useRef, useState } from 'react'
import { Box, LoaderCircle, Maximize2, MousePointer2, Rotate3D } from 'lucide-react'
import '../viewer.css'

interface Props {
  url: string
  title: string
}

type ViewerState = 'loading' | 'ready' | 'error'

export default function ModelViewer({ url, title }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<ViewerState>('loading')
  const [message, setMessage] = useState('Preparando visualização 3D...')

  useEffect(() => {
    let disposed = false
    let disposeViewer = () => {}
    setState('loading')
    setMessage('Carregando arquivo 3D da fonte...')

    async function start() {
      const container = host.current
      if (!container) return
      try {
        const THREE = await import('three')
        const [{ OrbitControls }, { GLTFLoader }, { OBJLoader }] = await Promise.all([
          import('three/addons/controls/OrbitControls.js'),
          import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/loaders/OBJLoader.js'),
        ])
        if (disposed) return

        const scene = new THREE.Scene()
        const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 10000)
        camera.position.set(4, 2.2, 5)
        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
        renderer.outputColorSpace = THREE.SRGBColorSpace
        renderer.toneMapping = THREE.ACESFilmicToneMapping
        renderer.toneMappingExposure = 1.1
        container.innerHTML = ''
        container.appendChild(renderer.domElement)

        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.07
        controls.autoRotate = true
        controls.autoRotateSpeed = 0.75
        controls.minDistance = 0.2
        controls.maxDistance = 500

        scene.add(new THREE.HemisphereLight(0xffffff, 0x28202f, 2.25))
        const key = new THREE.DirectionalLight(0xffffff, 3.5)
        key.position.set(5, 8, 5)
        scene.add(key)
        const fill = new THREE.DirectionalLight(0xb794f6, 2)
        fill.position.set(-5, 2, -3)
        scene.add(fill)

        const grid = new THREE.GridHelper(20, 20, 0x5c3b7d, 0x211828)
        grid.material.opacity = 0.28
        grid.material.transparent = true
        scene.add(grid)

        const ext = (() => {
          try { return new URL(url, window.location.href).pathname.split('.').pop()?.toLowerCase() || '' }
          catch { return '' }
        })()

        const fit = (object: import('three').Object3D) => {
          scene.add(object)
          const box = new THREE.Box3().setFromObject(object)
          if (box.isEmpty()) throw new Error('Modelo vazio')
          const size = box.getSize(new THREE.Vector3())
          const center = box.getCenter(new THREE.Vector3())
          object.position.sub(center)
          const maxDim = Math.max(size.x, size.y, size.z)
          const distance = Math.max(maxDim * 1.45, 1.5)
          camera.near = Math.max(distance / 1000, 0.01)
          camera.far = Math.max(distance * 100, 100)
          camera.position.set(distance, distance * 0.48, distance)
          camera.updateProjectionMatrix()
          controls.target.set(0, 0, 0)
          controls.minDistance = Math.max(maxDim * 0.25, 0.1)
          controls.maxDistance = Math.max(maxDim * 12, 10)
          controls.update()
          grid.scale.setScalar(Math.max(maxDim / 8, 0.25))
        }

        if (ext === 'glb' || ext === 'gltf') {
          const loaded = await new Promise<import('three/addons/loaders/GLTFLoader.js').GLTF>((resolve, reject) => new GLTFLoader().load(url, resolve, undefined, reject))
          if (disposed) return
          fit(loaded.scene)
        } else if (ext === 'obj') {
          const object = await new Promise<import('three').Group>((resolve, reject) => new OBJLoader().load(url, resolve, undefined, reject))
          if (disposed) return
          object.traverse(child => {
            const mesh = child as import('three').Mesh
            if (mesh.isMesh && !mesh.material) mesh.material = new THREE.MeshStandardMaterial({ color: 0xb9b4c2, roughness: 0.72, metalness: 0.18 })
          })
          fit(object)
        } else {
          throw new Error('Formato não suportado pelo viewer')
        }

        const resize = () => {
          if (!container.clientWidth || !container.clientHeight) return
          renderer.setSize(container.clientWidth, container.clientHeight, false)
          camera.aspect = container.clientWidth / container.clientHeight
          camera.updateProjectionMatrix()
        }
        const observer = new ResizeObserver(resize)
        observer.observe(container)
        resize()

        let frame = 0
        const animate = () => {
          if (disposed) return
          controls.update()
          renderer.render(scene, camera)
          frame = requestAnimationFrame(animate)
        }
        animate()
        setState('ready')
        setMessage('Arraste para girar · scroll para zoom')

        disposeViewer = () => {
          observer.disconnect()
          cancelAnimationFrame(frame)
          controls.dispose()
          scene.traverse(obj => {
            const mesh = obj as import('three').Mesh
            mesh.geometry?.dispose?.()
            const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
            materials.forEach(material => material.dispose?.())
          })
          renderer.dispose()
          renderer.domElement.remove()
        }
      } catch (error) {
        if (disposed) return
        console.warn('VJ viewer:', error)
        setState('error')
        setMessage('A fonte bloqueou a prévia 3D ou o arquivo não pôde ser interpretado. O download original continua disponível.')
      }
    }

    start()
    return () => { disposed = true; disposeViewer() }
  }, [url])

  const fullscreen = () => host.current?.requestFullscreen?.().catch(() => {})

  return <section className={`modelViewer modelViewer-${state}`}>
    <div className="viewerTopline"><span><Box size={14}/> VJ / LIVE 3D PREVIEW</span><div><small>{message}</small>{state === 'ready' && <button onClick={fullscreen} title="Tela cheia"><Maximize2 size={14}/></button>}</div></div>
    <div className="viewerCanvas" ref={host} aria-label={`Visualização 3D de ${title}`}>
      {state === 'loading' && <div className="viewerState"><LoaderCircle className="spin" size={28}/><strong>CARREGANDO MODELO</strong><span>arquivo servido pela fonte original</span></div>}
      {state === 'error' && <div className="viewerState"><Box size={31}/><strong>PREVIEW 3D INDISPONÍVEL</strong><span>{message}</span></div>}
    </div>
    {state === 'ready' && <div className="viewerHints"><span><MousePointer2 size={12}/> ARRASTAR / ORBITAR</span><span><Rotate3D size={12}/> AUTO ROTATE</span><span>SCROLL / ZOOM</span></div>}
  </section>
}
