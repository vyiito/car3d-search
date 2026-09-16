import { Gamepad2, ArrowUpRight, Sparkles } from 'lucide-react'
import '../games.css'

const games = [
  { name: 'Forza Horizon 5', code: 'FH5', note: 'rips / vehicles' },
  { name: 'Forza Motorsport', code: 'FM', note: 'race / production' },
  { name: 'Assetto Corsa', code: 'AC', note: 'mods / drift / race' },
  { name: 'CarX Drift Racing 2', code: 'CX2', note: 'drift / mobile' },
  { name: 'CSR Racing 2', code: 'CSR2', note: 'street / supercars' },
  { name: 'Real Racing 3', code: 'RR3', note: 'mobile / extracted' },
  { name: 'Need for Speed', code: 'NFS', note: 'multiple titles' },
  { name: 'BeamNG.drive', code: 'BNG', note: 'mods / vehicles' },
  { name: 'Euro Truck Simulator 2', code: 'ETS2', note: 'trucks / cars / buses' },
  { name: 'Automobilista 2', code: 'AMS2', note: 'sim racing' },
  { name: 'rFactor 2', code: 'RF2', note: 'sim racing' },
  { name: 'GTA', code: 'GTA', note: 'vehicle assets' },
]

export default function GamesExplorer({ onSearch }: { onSearch: (game: string) => void }) {
  return <section className="gamesSection" id="games">
    <div className="gamesHeader">
      <div>
        <span className="gamesEyebrow"><Gamepad2 size={14}/> GAME INDEX / 03</span>
        <h2>EXPLORE POR <em>JOGO.</em></h2>
        <p>Procure veículos extraídos ou mods pelo jogo de origem. O filtro se refina automaticamente conforme cada busca.</p>
      </div>
      <div className="gamesHeaderBadge"><Sparkles size={15}/><span>GAME SOURCE<br/><b>DISCOVERY</b></span></div>
    </div>
    <div className="gameGrid">
      {games.map((game, index) => <button key={game.name} className="gameTile" onClick={() => onSearch(game.name)}>
        <span className="gameIndex">{String(index + 1).padStart(2,'0')}</span>
        <span className="gameCode">{game.code}</span>
        <strong>{game.name}</strong>
        <small>{game.note}</small>
        <span className="gameArrow">BUSCAR <ArrowUpRight size={13}/></span>
      </button>)}
    </div>
  </section>
}
