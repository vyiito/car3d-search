import { providers } from './providers.js'
import { searchProvider } from './search.js'
import { createSearchEngine } from './search-engine.js'
import { searchBrasilSimulatorMods } from './brasil-adapter.js'
import { search3DSky } from './3dsky-adapter.js'
import { searchVosan } from './vosan-adapter.js'
import { searchOvertake } from './overtake-adapter.js'
import { searchVertexNative } from './vertex-adapter.js'
import { nativeMarketAdapters } from './market-adapters.js'
import { search3DBaza, searchWireWheels } from './catalog-adapters.js'
import { searchCGMoodV2, searchZifir, search3ddd } from './remaining-adapters.js'
import { searchRenderHubClean, search3dCarClean } from './commerce-adapters.js'
import { searchCGTraderMarketV2 } from './cgtrader-adapter.js'

const explicitAdapters = new Map([
  ['brasil-simulator-mods', searchBrasilSimulatorMods],
  ['3dsky', search3DSky],
  ['vosan', searchVosan],
  ['overtake', searchOvertake],
  ['vertex-warehouse', searchVertexNative],
  ['3d-baza', search3DBaza],
  ['wire-wheels-club', searchWireWheels],
  ['cgmood', searchCGMoodV2],
  ['zifir3d', searchZifir],
  ['renderhub', searchRenderHubClean],
  ['3ddd-ru', search3ddd],
  ['3dcar-ru', search3dCarClean],
  ['cgtrader', searchCGTraderMarketV2],
])

const nativeAdapterEntries = Object.entries(nativeMarketAdapters).filter(([id]) => !explicitAdapters.has(id))
export const progressiveNativeIds = [...new Set([...explicitAdapters.keys(), ...nativeAdapterEntries.map(([id]) => id)])]

const adapterMap = new Map([...nativeAdapterEntries, ...explicitAdapters])
export const progressiveSearch = createSearchEngine({ providerList: providers, adapterMap, genericSearch: searchProvider })
