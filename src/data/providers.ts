export type ProviderStatus = 'planned' | 'active' | 'disabled'

export interface Provider {
  id: string
  name: string
  url: string
  freeModels: boolean
  paidModels: boolean
  categories: string[]
  status: ProviderStatus
}

export const providers: Provider[] = [
  { id: 'cgtrader', name: 'CGTrader', url: 'https://www.cgtrader.com', freeModels: true, paidModels: true, categories: ['cars', 'motorcycles', 'trucks'], status: 'planned' },
  { id: 'sketchfab', name: 'Sketchfab', url: 'https://sketchfab.com', freeModels: true, paidModels: true, categories: ['cars', 'motorcycles', 'aircraft'], status: 'planned' },
  { id: 'turbosquid', name: 'TurboSquid', url: 'https://www.turbosquid.com', freeModels: true, paidModels: true, categories: ['cars', 'trucks', 'aircraft'], status: 'planned' },
  { id: 'printables', name: 'Printables', url: 'https://www.printables.com', freeModels: true, paidModels: false, categories: ['printable', 'cars'], status: 'planned' },
  { id: 'thingiverse', name: 'Thingiverse', url: 'https://www.thingiverse.com', freeModels: true, paidModels: false, categories: ['printable', 'cars'], status: 'planned' },
  { id: 'cults3d', name: 'Cults3D', url: 'https://cults3d.com', freeModels: true, paidModels: true, categories: ['printable', 'cars'], status: 'planned' },
]
