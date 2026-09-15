export type ProviderStatus = 'planned' | 'active' | 'disabled'
export type ProviderType = '3d-models' | 'game-mods' | 'mixed'

export interface Provider {
  id: string
  name: string
  url: string
  searchUrl?: string
  freeModels: boolean
  paidModels: boolean
  categories: string[]
  games?: string[]
  sourceType: ProviderType
  priority: 1 | 2 | 3
  notes?: string
  status: ProviderStatus
}

export const providers: Provider[] = [
  { id: 'rigmodels', name: 'RigModels', url: 'https://rigmodels.com', searchUrl: 'https://rigmodels.com/index.php?searchkeyword={query}', freeModels: true, paidModels: false, categories: ['cars','motorcycles','trucks','aircraft','other-vehicles'], sourceType: '3d-models', priority: 1, notes: 'Busca pública com resultados de veículos e formatos como OBJ, FBX, STL, DAE e GLB.', status: 'planned' },
  { id: 'free3d', name: 'Free3D', url: 'https://free3d.com', searchUrl: 'https://free3d.com/3d-models/cars', freeModels: true, paidModels: true, categories: ['cars','trucks','printable','other-vehicles'], sourceType: '3d-models', priority: 1, notes: 'Catálogo misto com modelos gratuitos e premium, vários formatos e filtros úteis.', status: 'planned' },
  { id: '3drush', name: '3D Rush', url: 'https://3drush.com', searchUrl: 'https://3drush.com/vehicle-3d-models/', freeModels: true, paidModels: false, categories: ['cars','trucks','vans','formula','other-vehicles'], sourceType: '3d-models', priority: 2, notes: 'Biblioteca de visualização com foco em OBJ, FBX e 3ds Max; possui seção de downloads gratuitos.', status: 'planned' },
  { id: 'brasil-simulator-mods', name: 'Brasil Simulator Mods', url: 'https://brasilsimulatormods.com', searchUrl: 'https://brasilsimulatormods.com/', freeModels: true, paidModels: false, categories: ['cars','mods'], games: ['Assetto Corsa','BeamNG.drive'], sourceType: 'game-mods', priority: 1, notes: 'Fonte brasileira com busca por marca/modelo e dados automotivos.', status: 'planned' },
  { id: 'overtake', name: 'OverTake.gg', url: 'https://www.overtake.gg', searchUrl: 'https://www.overtake.gg/downloads/', freeModels: true, paidModels: true, categories: ['cars','mods','tracks','sim-racing'], games: ['Assetto Corsa','Assetto Corsa Competizione','Automobilista 2','rFactor 2','BeamNG.drive'], sourceType: 'game-mods', priority: 2, notes: 'Grande comunidade de sim racing com área de downloads e busca de mods.', status: 'planned' },
  { id: 'assettomods', name: 'Assetto Mods', url: 'https://assettomods.com', searchUrl: 'https://assettomods.com/', freeModels: true, paidModels: true, categories: ['cars','mods','car-packs','tracks'], games: ['Assetto Corsa'], sourceType: 'game-mods', priority: 2, notes: 'Database de mods de Assetto Corsa.', status: 'planned' },
  { id: 'moddb', name: 'ModDB', url: 'https://www.moddb.com', searchUrl: 'https://www.moddb.com/mods', freeModels: true, paidModels: false, categories: ['cars','mods','game-assets'], games: ['Need for Speed','Various'], sourceType: 'game-mods', priority: 3, notes: 'Fonte ampla de mods de jogos.', status: 'planned' },
  { id: 'assettohub', name: 'Assetto Hub', url: 'https://www.assettohub.com', searchUrl: 'https://www.assettohub.com/cars/', freeModels: true, paidModels: false, categories: ['cars','mods','drift','race','rally','vintage'], games: ['Assetto Corsa'], sourceType: 'game-mods', priority: 1, notes: 'Catálogo focado em carros para Assetto Corsa.', status: 'planned' },
  { id: 'ets2lt', name: 'ETS2.lt', url: 'https://ets2.lt/en/', searchUrl: 'https://ets2.lt/en/?s={query}', freeModels: true, paidModels: false, categories: ['cars','trucks','buses','trailers','mods'], games: ['Euro Truck Simulator 2'], sourceType: 'game-mods', priority: 2, notes: 'Grande catálogo de veículos para ETS2.', status: 'planned' },
  { id: 'vosan', name: 'VOSAN', url: 'https://vosan.co', searchUrl: 'https://vosan.co/explore', freeModels: true, paidModels: true, categories: ['cars','car-packs','drift','mods'], games: ['Assetto Corsa'], sourceType: 'game-mods', priority: 1, notes: 'Marketplace/comunidade de drift com mods gratuitos e premium.', status: 'planned' },
  { id: 'sketchfab', name: 'Sketchfab', url: 'https://sketchfab.com', searchUrl: 'https://sketchfab.com/3d-models/categories/cars-vehicles?features=downloadable', freeModels: true, paidModels: false, categories: ['cars','motorcycles','trucks','aircraft','other-vehicles'], sourceType: '3d-models', priority: 1, notes: 'Modelos públicos marcados como downloadable.', status: 'planned' },
  { id: 'cgtrader', name: 'CGTrader', url: 'https://www.cgtrader.com', searchUrl: 'https://www.cgtrader.com/3d-models?keywords={query}', freeModels: true, paidModels: true, categories: ['cars','motorcycles','trucks','aircraft','printable','other-vehicles'], sourceType: '3d-models', priority: 1, notes: 'Marketplace 3D com busca e filtros detalhados.', status: 'planned' },
  { id: 'done3d', name: 'Done3D', url: 'https://done3d.com', searchUrl: 'https://done3d.com/category/vehicle/cars/', freeModels: true, paidModels: false, categories: ['cars','trucks','suv','car-parts','aircraft','other-vehicles'], sourceType: '3d-models', priority: 1, notes: 'Catálogo gratuito com thumbnails, polígonos, vértices, materiais, texturas e vários formatos.', status: 'planned' },
  { id: '3dsky', name: '3DSky', url: 'https://3dsky.org', searchUrl: 'https://3dsky.org/3dmodels?tag={query}', freeModels: true, paidModels: true, categories: ['cars','vehicles','render','architecture-assets'], sourceType: '3d-models', priority: 2, notes: 'Catálogo amplo com filtros FREE/PRO e formatos como OBJ e FBX.', status: 'planned' },
  { id: 'free3dio', name: 'Free3D.io', url: 'https://free3d.io', searchUrl: 'https://free3d.io/category/Cars-Trucks-Land-Transport/28', freeModels: true, paidModels: false, categories: ['cars','trucks','buses','land-transport','other-vehicles'], sourceType: '3d-models', priority: 2, notes: 'Navegação humana gratuita; integração automatizada depende das regras/API da fonte.', status: 'planned' },
  { id: 'vertex-warehouse', name: 'Vertex Warehouse', url: 'https://www.vertex-warehouse.com', searchUrl: 'https://www.vertex-warehouse.com/search', freeModels: true, paidModels: false, categories: ['cars','game-models','source-rips','other-vehicles'], sourceType: '3d-models', priority: 1, notes: 'Biblioteca de modelos extraídos de jogos, com foco forte em veículos e página própria de busca.', status: 'planned' },
]
