import { providers } from './data/providers'
import './nav-hub.css'

type HubMode = 'brands' | 'games' | 'sources'

const brands = [
  'Abarth','Acura','Alfa Romeo','Alpine','Aston Martin','Audi','Bentley','BMW','Bugatti','BYD','Cadillac','Chevrolet','Dodge','Ferrari','Fiat','Ford','Funco Motorsports','Genesis','Honda','Hyundai','Infiniti','Jaguar','Jeep','Kia','Koenigsegg','Lamborghini','Lancia','Land Rover','Lexus','Lotus','Maserati','Mazda','McLaren','Mercedes-Benz','Mini','Mitsubishi','Nissan','Pagani','Peugeot','Polestar','Pontiac','Porsche','Renault','Rimac','Rolls-Royce','Subaru','Suzuki','Tesla','Toyota','Volkswagen','Volvo','Scania','MAN','Iveco','DAF','Ducati','Yamaha','Kawasaki','KTM','Harley-Davidson'
]

const games = [
  'Forza Horizon 5','Forza Horizon 4','Forza Horizon 6','Forza Motorsport','Gran Turismo 7','Gran Turismo Sport','Assetto Corsa','Assetto Corsa Competizione','CarX Drift Racing 2','CarX Street','CSR Racing 2','CSR Racing 3','Real Racing 3','Need for Speed','Need for Speed Heat','Need for Speed Unbound','Need for Speed No Limits','Need for Speed Mobile','BeamNG.drive','Euro Truck Simulator 2','American Truck Simulator','Automobilista 2','rFactor 2','GTA V','GTA IV'
]

let root: HTMLDivElement | null = null
let activeMode: HubMode | null = null
let previousOverflow = ''

function currentQuery() {
  const params = new URLSearchParams(window.location.search)
  return params.get('q') || params.get('brand') || ''
}

function navigate(params: Record<string,string>) {
  const search = new URLSearchParams(params)
  window.location.assign(`${window.location.pathname}?${search.toString()}`)
}

function goHome() {
  window.history.pushState({}, '', window.location.pathname)
  window.location.reload()
}

function closeHub() {
  if (!root) return
  root.remove()
  root = null
  activeMode = null
  document.body.style.overflow = previousOverflow
}

function sourceAction(name: string, url: string) {
  const facet = [...document.querySelectorAll<HTMLButtonElement>('.sourceFacets button')].find(button => button.textContent?.includes(name))
  if (facet && currentQuery()) {
    facet.click()
    closeHub()
    document.getElementById('results')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    return
  }
  window.open(url, '_blank', 'noopener,noreferrer')
}

function card(label: string, meta: string, action: () => void, index: number) {
  const button = document.createElement('button')
  button.className = 'vjHubCard'
  button.dataset.search = `${label} ${meta}`.toLowerCase()
  button.innerHTML = `<span class="vjHubIndex">${String(index + 1).padStart(2,'0')}</span><span class="vjHubCardText"><strong>${label}</strong><small>${meta}</small></span><span class="vjHubArrow">↗</span>`
  button.addEventListener('click', action)
  return button
}

function openHub(mode: HubMode) {
  if (root && activeMode === mode) { closeHub(); return }
  closeHub()
  activeMode = mode
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  const overlay = document.createElement('div')
  overlay.className = 'vjNavHub'
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  overlay.innerHTML = `
    <div class="vjHubBackdrop"></div>
    <section class="vjHubPanel">
      <header class="vjHubHeader">
        <div><span>VJ / NAVIGATION HUB</span><h2>${mode === 'brands' ? 'ESCOLHA UMA MARCA' : mode === 'games' ? 'ESCOLHA UM JOGO' : 'ESCOLHA UMA FONTE'}</h2></div>
        <button class="vjHubClose" aria-label="Fechar">×</button>
      </header>
      <div class="vjHubSearch"><span>⌕</span><input autocomplete="off" placeholder="Filtrar ${mode === 'brands' ? 'marcas' : mode === 'games' ? 'jogos' : 'fontes'}..." /></div>
      <div class="vjHubMeta">${mode === 'brands' ? 'A busca será feita em todas as bases compatíveis.' : mode === 'games' ? 'O jogo será aplicado como origem/filtro da pesquisa.' : currentQuery() ? 'Clique para filtrar a pesquisa atual quando a fonte estiver disponível.' : 'Abra diretamente uma das bases indexadas.'}</div>
      <div class="vjHubGrid"></div>
      <footer class="vjHubFooter"><span>ESC fecha · digite para filtrar</span><b>VJ 3D SEARCH</b></footer>
    </section>`

  document.body.appendChild(overlay)
  root = overlay

  const grid = overlay.querySelector<HTMLDivElement>('.vjHubGrid')!
  if (mode === 'brands') {
    brands.forEach((brand, index) => grid.appendChild(card(brand, 'todos os veículos gratuitos', () => navigate({ brand }), index)))
  } else if (mode === 'games') {
    games.forEach((game, index) => grid.appendChild(card(game, 'jogo de origem', () => navigate({ q: game, game }), index)))
  } else {
    providers.forEach((provider, index) => grid.appendChild(card(provider.name, provider.categories.slice(0,3).join(' · '), () => sourceAction(provider.name, provider.searchUrl || provider.url), index)))
  }

  const input = overlay.querySelector<HTMLInputElement>('input')!
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase()
    overlay.querySelectorAll<HTMLElement>('.vjHubCard').forEach(item => { item.hidden = Boolean(q && !item.dataset.search?.includes(q)) })
  })
  overlay.querySelector('.vjHubClose')?.addEventListener('click', closeHub)
  overlay.querySelector('.vjHubBackdrop')?.addEventListener('click', closeHub)
  window.setTimeout(() => input.focus(), 30)
}

function install() {
  const header = document.querySelector('.topbar')
  if (!header || header.getAttribute('data-vj-nav-ready') === '1') return false
  header.setAttribute('data-vj-nav-ready', '1')

  const brand = header.querySelector<HTMLAnchorElement>('.brand')
  brand?.addEventListener('click', event => { event.preventDefault(); goHome() })
  brand?.setAttribute('title', 'Voltar para a tela inicial')

  header.querySelectorAll<HTMLAnchorElement>('nav a').forEach(link => {
    const label = link.textContent?.trim().toUpperCase() || ''
    if (label.startsWith('GITHUB')) return
    link.addEventListener('click', event => {
      event.preventDefault()
      if (label === 'MARCAS') openHub('brands')
      else if (label === 'JOGOS') openHub('games')
      else if (label === 'FONTES') openHub('sources')
      else if (label === 'BUSCAR') {
        closeHub()
        document.getElementById('search')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        window.setTimeout(() => document.getElementById('vj-search-input')?.focus(), 350)
      } else if (label === 'CATÁLOGO') {
        closeHub()
        const hasSearch = Boolean(currentQuery())
        ;(hasSearch ? document.getElementById('results') : document.getElementById('search'))?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  })
  return true
}

document.addEventListener('keydown', event => { if (event.key === 'Escape' && root) closeHub() })
if (!install()) {
  const observer = new MutationObserver(() => { if (install()) observer.disconnect() })
  observer.observe(document.documentElement, { childList: true, subtree: true })
}
