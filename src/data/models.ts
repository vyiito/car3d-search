export interface Model3D {
  id: string
  title: string
  source: string
  sourceUrl: string
  price: number | null
  currency: 'USD' | 'BRL'
  isFree: boolean
  formats: string[]
  brand: string
  vehicle: string
  year?: number
  use: ('game' | 'print' | 'render')[]
  quality: 'Low Poly' | 'Mid Poly' | 'High Poly'
}

export const models: Model3D[] = [
  { id: '1', title: 'Subaru Forester STI SG9 2005', source: 'CGTrader', sourceUrl: 'https://www.cgtrader.com', price: 29, currency: 'USD', isFree: false, formats: ['FBX', 'OBJ', 'MAX'], brand: 'Subaru', vehicle: 'Forester STI SG9', year: 2005, use: ['game', 'render'], quality: 'High Poly' },
  { id: '2', title: 'BMW M3 E36 Coupe', source: 'Sketchfab', sourceUrl: 'https://sketchfab.com', price: null, currency: 'USD', isFree: true, formats: ['GLB', 'FBX'], brand: 'BMW', vehicle: 'M3 E36', year: 1997, use: ['game'], quality: 'Mid Poly' },
  { id: '3', title: 'Mitsubishi Lancer Evolution IX', source: 'TurboSquid', sourceUrl: 'https://www.turbosquid.com', price: 42, currency: 'USD', isFree: false, formats: ['OBJ', 'FBX', 'BLEND'], brand: 'Mitsubishi', vehicle: 'Lancer Evolution IX', year: 2006, use: ['render', 'game'], quality: 'High Poly' },
  { id: '4', title: 'Honda Civic EK9 Type R Printable', source: 'Printables', sourceUrl: 'https://www.printables.com', price: null, currency: 'USD', isFree: true, formats: ['STL', '3MF'], brand: 'Honda', vehicle: 'Civic EK9 Type R', year: 1998, use: ['print'], quality: 'High Poly' },
  { id: '5', title: 'Nissan Skyline GT-R R34', source: 'Cults3D', sourceUrl: 'https://cults3d.com', price: 7, currency: 'USD', isFree: false, formats: ['STL'], brand: 'Nissan', vehicle: 'Skyline GT-R R34', year: 1999, use: ['print'], quality: 'High Poly' },
  { id: '6', title: 'Volkswagen Golf GTI MK4', source: 'Thingiverse', sourceUrl: 'https://www.thingiverse.com', price: null, currency: 'USD', isFree: true, formats: ['STL'], brand: 'Volkswagen', vehicle: 'Golf GTI MK4', year: 2002, use: ['print'], quality: 'Mid Poly' }
]
