# Car3D Search

Metabuscador especializado em modelos 3D de carros e veículos.

## Arquitetura atual

- Frontend: React + Vite publicado no GitHub Pages
- Busca global: API Node/Express em `server/`
- Agregador: consulta todos os providers em paralelo, normaliza e deduplica resultados
- Providers cadastrados: RigModels, Free3D, 3D Rush, Brasil Simulator Mods, OverTake.gg, Assetto Mods, ModDB, Assetto Hub, ETS2.lt, VOSAN, Sketchfab, CGTrader, Done3D, 3DSky, Free3D.io e Vertex Warehouse
- Sketchfab usa a API pública de busca
- Outras fontes começam com extração HTML tolerante a layouts diferentes e fallback para busca direta

## Frontend

```bash
npm install
npm run dev
```

## API

```bash
cd server
npm install
npm run dev
```

Endpoints:

```text
GET /health
GET /api/providers
GET /api/search?q=BMW%20E36&perSource=20
```

## Deploy da API

O repositório inclui `render.yaml` para criar o serviço `car3d-search-api` no Render.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vyiito/car3d-search)

O frontend usa por padrão:

```text
https://car3d-search-api.onrender.com
```

Você também pode definir `VITE_SEARCH_API_URL` durante o build para usar outro backend.

## Como a busca funciona

1. O usuário digita um veículo.
2. O frontend chama `/api/search`.
3. O backend dispara a consulta para todas as fontes cadastradas em paralelo.
4. Cada resultado é convertido para um formato comum: título, imagem, fonte, URL, formatos, preço e disponibilidade.
5. Resultados duplicados são removidos e a lista é ordenada por relevância.
6. O frontend mostra também o status de cada fonte, inclusive quando uma delas bloqueia ou falha.

Algumas fontes usam JavaScript, autenticação, API própria ou mecanismos anti-bot. Esses providers precisam de adapters específicos para atingir cobertura máxima; o agregador foi estruturado para isso sem alterar o frontend.
