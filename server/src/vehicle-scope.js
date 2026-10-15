// Catalog provenance and game names do not establish what an asset depicts.
const words = value => String(value || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\bcarpacks?\b/gi, 'car pack').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
const phrase = value => new RegExp(`\\b${words(value).replace(/ /g, '\\s+')}\\b`)

export const VEHICLE_BRANDS = [
  'Duesenberg','Shelby','Equus','Dallara','HSV','FPV','Vector','Donkervoort','Dome','Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','Buick','BYD','Cadillac','Caterham','Chery','Chevrolet','Chrysler','Citroen','Cupra','Dacia','Daihatsu','Dodge','Ferrari','Fiat','Ford','Funco Motorsports','Genesis','Geely','GMC','Honda','Holden','Hummer','Hyundai','Infiniti','Isuzu','Jaguar','Jeep','Kia','Koenigsegg','Lada','Lamborghini','Lancia','Land Rover','Lexus','Lincoln','Lotus','Lucid','Mahindra','Maserati','Mazda','McLaren','Mercedes','Mercedes-Benz','Mercury','MG','Mini','Mitsubishi','Nio','Nissan','Oldsmobile','Opel','Pagani','Peugeot','Plymouth','Polestar','Pontiac','Porsche','Proton','Ram','Renault','Rimac','Rivian','Rolls-Royce','Rover','Saab','Saturn','Scion','Seat','Skoda','Smart','Subaru','Suzuki','Tata','Tesla','Toyota','Vauxhall','Volkswagen','Volvo','Wuling','Zeekr',
  'DAF','Freightliner','International','Iveco','Kamaz','Kenworth','Mack','MAN','Peterbilt','Scania','Western Star','ZIL','GAZ','UAZ',
  'Aprilia','BMW Motorrad','Can-Am','Ducati','Harley-Davidson','Husqvarna','Indian','Kawasaki','KTM','Royal Enfield','Suzuki','Triumph','Vespa','Yamaha',
  'Caterpillar','John Deere','Kirovets','Kubota','Massey Ferguson','New Holland'
]

const ambiguousBrands = new Set(['Caterpillar', 'Jaguar', 'Alpine', 'Genesis', 'International', 'Indian', 'Lotus', 'Mercury', 'MG', 'Mini', 'Ram', 'Rover', 'Saturn', 'Seat', 'Smart', 'Triumph', 'MAN'])
const brandPatterns = VEHICLE_BRANDS.filter(brand => !ambiguousBrands.has(brand)).map(phrase)
const vehicleWords = /\b(?:cars?|carros?|speedsters?|estate|4wd|f1|rovers?|automobiles?|automoveis|veiculos?|vehicles?|sedan|saloon|coupes?|hatchback|roadster|convertible|cabriolet|cabrio|supercar|hypercar|racecar|suv|crossovers?|pickups?|trucks?|caminhoes|lorry|buses|bus|onibus|minibus|vans?|minivan|camper|motorhome|trailers?|reboque|motorcycles?|motorbikes?|motos?|scooters?|moped|bicycle|bike|quad|atv|karts?|buggy|sandcar|tractors?|tratores?|harvester|excavator|bulldozer|forklift|aircraft|airplanes?|aeroplanes?|avioes|aviao|helicopters?|helicopteros?|boats?|barcos?|ships?|yachts?|submarines?|trains?|locomotives?|tram|spacecraft|spaceships?|drones?|tanks?|abrams|humvee)\b/
const modelNames = /\b(?:supra|miata|mustang|corvette|camaro|civic|silvia|fairlady|skyline (?:gtr|gt r|r3[234])|impreza|evo [ivx0-9]+|huracan|aventador|countach|chiron|veyron|viper|golf (?:gti|r|mk[1-8])|atcc|s1[345]a?|ae86|gt86|gr86|brz|e(?:30|36|39|46|60|90|92)|r3[2345]|jzx\d{2,3}|jza80|fd3s|fc3s|gc8|fk[278])\b/
const ambiguousVehicles = /\b(?:(?:jaguar (?:f type|e type|d type|c type|i pace|f pace|x[efjk]|xk[a-z0-9]*|ss ?100))|(?:ram (?:1500|2500|3500|trx))|(?:man (?:tgx|tgs|tgm|tgl|truck))|(?:caterpillar [a-z]{0,3}\d+[a-z0-9]*)|(?:mini (?:cooper|countryman|clubman|cabrio))|(?:seat (?:ibiza|leon|ateca|arona|toledo))|(?:smart (?:fortwo|forfour))|(?:lotus (?:elise|exige|evora|emira|evija|esprit))|(?:(?:mg|genesis|alpine|mercury|saturn|rover|triumph|indian|international) (?:[a-z]{0,4}\d+[a-z0-9]*|truck|scout|challenger|thunderbird|bonneville|spitfire|defender|discovery)))\b/
const weapon = /\b(?:weapons?|armas?|firearms?|guns?|pistols?|pistolas?|rifles?|fuzil|fuzis|shotguns?|sniper|grenades?|granadas?|swords?|espadas?|knives|knife|katanas?|ammunition|bullets?|silencer|ak ?(?:47|74)|carbines?|aks ?74u?|mg ?(?:34|42)|glocks?|desert eagle|m16|mp5|rocket launcher)\b/
const environment = /\b(?:maps?|mapas?|pistas?|circuitos?|circuits?|racetracks?|raceways?|speedways?|tracks?|terrains?|terrenos?|landscapes?|paisagens?|cityscape|city block|downtown|cities|city|town|village|buildings?|edificios?|houses?|casas?|apartments?|furniture|chairs?|sofas?|tables?|rooms?|showrooms?|garages?|environments?|scenery|roads?|highways?|streets|parking lot|car park|skybox|hdri|trees?|rocks?)\b/
const parts = /\b(?:wheels?|rims?|tyres?|tires?|pneus?|rodas?|engines?|motores?|helmets?|capacetes?|steering wheel|gear selector|gear shift|headlights?|tail lights?|brake discs?|body ?kit|bumpers?|grille|panel set|chassis|chassi|car seats?|fuel tank|water tank|storage tank|septic tank|gas tank|oxygen tank)\b/
const otherAssets = /\b(?:skins?|liveries|livery|textures?|texturas?|shaders?|sound ?(?:mods?|packs?)|sons?|weather|clima|graphics ?mods?|reshade|presets?|logos?|emblems?|keychains?|keyrings?|posters?|cookie cutters?|animals?|animais|horses?|worms?|characters?|personagens?|avatars?|soldiers?|soldados?|zombies?|props?|traffic packs?|trafego|navigation|setup guide|tutorials?|templates?)\b/
const spam = /\b(?:full version|for pc|pc download|pc game|switch nsp|nsp for pc|game over|wallpapers?|screensavers?|menu screen)\b/
const nonVehiclePath = /\/(?:maps?|tracks?|circuits?|weapons?|guns?|firearms?|characters?|scenery|environments?|furniture|buildings?|skins?|liveries|textures?|shaders?|sounds?)(?:[/.]|$)/i
const sceneSubject = /\b(?:(?:car|vehicle) (?:parking|stage|display|wash|workshop|dealership)|parking (?:spaces?|lot)|tunnels?|tunel|(?:boy|girl|woman|man|person|people|child) (?:with|holding|driving|sitting|and))\b/

function hasVehicleIdentity(title) {
  return vehicleWords.test(title) || modelNames.test(title) || ambiguousVehicles.test(title) || brandPatterns.some(pattern => pattern.test(title))
}

export function isVehicleResult(result) {
  const title = words(result?.title)
  if (!title) return false
  let path = ''
  try { path = decodeURIComponent(new URL(result.sourceUrl).pathname) } catch {}
  if (nonVehiclePath.test(path)) return false

  // Preserve real vehicle names and modifiers that overlap with scene words.
  let subject = title.replace(/\b(?:ford mustang dark horse|honda city|lincoln town car|488 pista|bumper car|mars rover|street machine|city (?:car|bus)|street (?:car|racing car)|(?:off )?road (?:car|vehicle)|track (?:car|edition|version|spec|rbms)|(?:track|race) ready|models textures|model with textures)\b/g, ' car ')
  // A publisher may use Circuit as a trim name for an actual typed car listing.
  if (result.vehicleEvidence === 'catalog' && /\d/.test(subject.split(' circuit')[0]) && hasVehicleIdentity(subject.split(' circuit')[0])) subject = subject.replace(/\bcircuit\b/g, '')
  if (environment.test(subject) || otherAssets.test(subject) || spam.test(subject) || sceneSubject.test(subject)) return false
  if (weapon.test(subject)) {
    // An armed vehicle is still a vehicle; a gun listed for one is not.
    const armedVehicle = /\b(?:tank|abrams|humvee|armored (?:car|vehicle|truck)|armoured (?:car|vehicle|truck))\b/.exec(subject)
    const weaponMatch = weapon.exec(subject)
    if (!armedVehicle || !/\bwith\b/.test(subject.slice(armedVehicle.index, weaponMatch.index))) return false
  }
  if (parts.test(subject)) return false
  if (/\b(?:pack|collection)\b/.test(title) && Array.isArray(result.includedVehicles) && result.includedVehicles.length && result.vehicleEvidence !== 'catalog') {
    return result.includedVehicles.some(member => isVehicleResult({ title: member }))
  }
  if (hasVehicleIdentity(subject)) return true
  if (result.vehicleEvidence === 'catalog') return true
  // Only a confirmed list of pack members may establish a vehicle pack.
  return /\b(?:pack|collection)\b/.test(title) && Array.isArray(result.includedVehicles)
    && result.includedVehicles.some(member => isVehicleResult({ title: member }))
}
