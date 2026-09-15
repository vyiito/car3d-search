export interface Model3D {
  id: string
  title: string
  source: string
  sourceUrl: string
  imageUrl: string
  imageCreditUrl: string
  price: number | null
  currency: 'USD' | 'BRL'
  isFree: boolean
  formats: string[]
  brand: string
  vehicle: string
  year?: number
  use: ('game' | 'print' | 'render')[]
  quality: 'Low Poly' | 'Mid Poly' | 'High Poly'
  sourceType: '3D Model' | 'Game Mod'
}

const commons = (file: string) =>
  `https://commons.wikimedia.org/wiki/Special:Redirect/file/${encodeURIComponent(file)}?width=1000`

export const models: Model3D[] = [
  {
    id: '1',
    title: 'Subaru Forester STI SG9 2005',
    source: 'CGTrader',
    sourceUrl: 'https://www.cgtrader.com/3d-models?keywords=Subaru%20Forester%20STI%20SG9',
    imageUrl: commons('Forester sti.jpg'),
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Forester_sti.jpg',
    price: 29,
    currency: 'USD',
    isFree: false,
    formats: ['FBX', 'OBJ', 'MAX'],
    brand: 'Subaru',
    vehicle: 'Forester STI SG9',
    year: 2005,
    use: ['game', 'render'],
    quality: 'High Poly',
    sourceType: '3D Model',
  },
  {
    id: '2',
    title: 'BMW M3 E36 Coupe',
    source: 'Sketchfab',
    sourceUrl: 'https://sketchfab.com/search?type=models&q=BMW%20M3%20E36&features=downloadable',
    imageUrl: commons('BMW M3 Coupe E36.jpg'),
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:BMW_M3_Coupe_E36.jpg',
    price: null,
    currency: 'USD',
    isFree: true,
    formats: ['GLB', 'FBX'],
    brand: 'BMW',
    vehicle: 'M3 E36',
    year: 1997,
    use: ['game'],
    quality: 'Mid Poly',
    sourceType: '3D Model',
  },
  {
    id: '3',
    title: 'Mitsubishi Lancer Evolution IX',
    source: 'Brasil Simulator Mods',
    sourceUrl: 'https://brasilsimulatormods.com/',
    imageUrl: commons('Lancer Evo IX.jpg'),
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Lancer_Evo_IX.jpg',
    price: null,
    currency: 'BRL',
    isFree: true,
    formats: ['MOD'],
    brand: 'Mitsubishi',
    vehicle: 'Lancer Evolution IX',
    year: 2006,
    use: ['game'],
    quality: 'High Poly',
    sourceType: 'Game Mod',
  },
  {
    id: '4',
    title: 'Honda Civic EK9 Type R',
    source: 'RigModels',
    sourceUrl: 'https://rigmodels.com/index.php?searchkeyword=Honda%20Civic%20EK9',
    imageUrl: commons('Honda Civic EK9 Type R.jpg'),
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Honda_Civic_EK9_Type_R.jpg',
    price: null,
    currency: 'USD',
    isFree: true,
    formats: ['OBJ', 'FBX'],
    brand: 'Honda',
    vehicle: 'Civic EK9 Type R',
    year: 1998,
    use: ['game', 'render'],
    quality: 'High Poly',
    sourceType: '3D Model',
  },
  {
    id: '5',
    title: 'Nissan Skyline GT-R R34',
    source: 'Free3D',
    sourceUrl: 'https://free3d.com/3d-models/cars',
    imageUrl: commons('2001 Nissan Skyline GT-R V-Spec II R34.jpg'),
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:2001_Nissan_Skyline_GT-R_V-Spec_II_R34.jpg',
    price: 12,
    currency: 'USD',
    isFree: false,
    formats: ['OBJ', 'FBX', 'BLEND'],
    brand: 'Nissan',
    vehicle: 'Skyline GT-R R34',
    year: 1999,
    use: ['render', 'game'],
    quality: 'High Poly',
    sourceType: '3D Model',
  },
  {
    id: '6',
    title: 'Volkswagen Golf GTI MK4',
    source: 'Assetto Hub',
    sourceUrl: 'https://www.assettohub.com/cars/',
    imageUrl: commons('Volkswagen Golf GTi MK IV.jpg'),
    imageCreditUrl: 'https://commons.wikimedia.org/wiki/File:Volkswagen_Golf_GTi_MK_IV.jpg',
    price: null,
    currency: 'USD',
    isFree: true,
    formats: ['MOD'],
    brand: 'Volkswagen',
    vehicle: 'Golf GTI MK4',
    year: 2002,
    use: ['game'],
    quality: 'Mid Poly',
    sourceType: 'Game Mod',
  },
]
