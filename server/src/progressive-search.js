import { providers } from './providers.js'
import { searchProvider } from './search.js'
import { createSearchEngine } from './search-engine.js'
import { search3DSky } from './3dsky-adapter.js'
import { searchVosan } from './vosan-adapter.js'
import { searchOvertake } from './overtake-adapter.js'
import { searchVertexNative } from './vertex-adapter.js'
import { nativeMarketAdapters } from './market-adapters.js'
import { search3ddd } from './remaining-adapters.js'
import { searchCGTraderMarketV2 } from './cgtrader-adapter.js'
import { searchGta5 } from './gta5-adapter.js'
import { searchWordPress, searchBlogger, searchShopify, searchBlenderKit, searchMediaFire, search3DRush, searchWarehouse } from './structured-adapters.js'
import { searchBazaSections, searchRenderHubSections, searchWireSections, searchZifirSections, searchCGMoodSections, searchGallerySections, searchExportSections, searchCADSections } from './section-adapters.js'

const explicitAdapters = new Map([
  ['gta5-mods', searchGta5],
  ['3drush', search3DRush],
  ['3dwarehouse', searchWarehouse],
  ['3dcadbrowser', searchCADSections],
  ['brasil-simulator-mods', (query, limit) => searchWordPress('brasil-simulator-mods', query, limit)],
  ['assettohub', (query, limit) => searchWordPress('assettohub', query, limit)],
  ['assettomods', (query, limit) => searchWordPress('assettomods', query, limit)],
  ['done3d', (query, limit) => searchWordPress('done3d', query, limit)],
  ['3d-models-destination', searchBlogger], ['mediafire-rr3', searchMediaFire],
  ['roh3d', searchShopify], ['blendkit', searchBlenderKit],
  ['3dsky', search3DSky],
  ['vosan', searchVosan],
  ['overtake', searchOvertake],
  ['vertex-warehouse', searchVertexNative],
  ['3d-baza', searchBazaSections],
  ['wire-wheels-club', searchWireSections],
  ['cgmood', searchCGMoodSections],
  ['zifir3d', searchZifirSections],
  ['renderhub', searchRenderHubSections],
  ['3dexport', searchExportSections],
  ['3ddd-ru', search3ddd],
  ['3dcar-ru', searchGallerySections],
  ['cgtrader', searchCGTraderMarketV2],
])

const nativeAdapterEntries = Object.entries(nativeMarketAdapters).filter(([id]) => !explicitAdapters.has(id))
export const progressiveNativeIds = [...new Set([...explicitAdapters.keys(), ...nativeAdapterEntries.map(([id]) => id)])]

const adapterMap = new Map([...nativeAdapterEntries, ...explicitAdapters])
export const progressiveSearch = createSearchEngine({ providerList: providers, adapterMap, genericSearch: searchProvider })
