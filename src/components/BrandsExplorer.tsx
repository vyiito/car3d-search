import { ArrowUpRight, CarFront, Search, Sparkles } from 'lucide-react'
import '../brands.css'

const brands = [
  'BMW','Porsche','Nissan','Toyota','Honda','Subaru','Mitsubishi','Mercedes-Benz','Audi','Volkswagen',
  'Ferrari','Lamborghini','McLaren','Ford','Chevrolet','Mazda','Lexus','Volvo','Hyundai','Kia',
  'Renault','Peugeot','Fiat','Alfa Romeo','Aston Martin','Bentley','Bugatti','Jeep','Land Rover','Tesla',
  'Scania','MAN','Iveco','DAF','Ducati','Yamaha','Kawasaki','Suzuki','KTM','Harley-Davidson',
]

interface BrandsExplorerProps {
  onSearch: (brand: string) => void
  recent?: string[]
}

export default function BrandsExplorer({ onSearch, recent = [] }: BrandsExplorerProps) {
  const visible = brands

  return (
    <section className="brandsSection" id="brands">
      <div className="brandsHeader">
        <div>
          <span className="brandsEyebrow"><Sparkles size={13}/> BRAND MATRIX / 02</span>
          <h2>EXPLORE POR <em>MARCA.</em></h2>
          <p>Clique em uma fabricante para procurar todos os veículos gratuitos encontrados dessa marca nas bases indexadas.</p>
        </div>
        <div className="brandsStat"><strong>{visible.length}</strong><span>MARCAS RÁPIDAS</span></div>
      </div>

      {recent.length > 0 && <div className="recentBrands"><span>RECENTES</span>{recent.slice(0,6).map(brand => <button key={brand} onClick={() => onSearch(brand)}>{brand}<ArrowUpRight size={12}/></button>)}</div>}

      <div className="brandGrid">
        {visible.map((brand, index) => (
          <button key={brand} className="brandTile" onClick={() => onSearch(brand)}>
            <span className="brandNumber">{String(index + 1).padStart(2,'0')}</span>
            <span className="brandGlyph"><CarFront size={17}/></span>
            <span className="brandName">{brand}</span>
            <span className="brandAction"><Search size={13}/><ArrowUpRight size={13}/></span>
          </button>
        ))}
      </div>
    </section>
  )
}
