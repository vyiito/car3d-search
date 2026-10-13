# VJ 3D Search

Metabuscador automotivo de modelos 3D e mods, com frontend React/Vite e API Node/Express. O catálogo consulta 32 fontes; a disponibilidade de cada uma é informada em cada busca.

## Desenvolvimento local

Requer Node.js 22.18 ou mais recente.

```bash
npm ci
npm ci --prefix server
```

Inicie a API em um terminal e o frontend em outro:

```bash
npm start --prefix server
npm run dev
```

O Vite encaminha `/api` para `http://127.0.0.1:10000`. Em produção, o frontend usa `https://car3d-search-api.onrender.com`. Defina `VITE_SEARCH_API_URL` no build para usar outra API.

## Pesquisa e filtros

- REST (`/api/search`) e streaming (`/api/search/stream`) usam o mesmo motor, adapters, normalização e cache. Cada fonte é consultada uma vez.
- Marca, modelo e geração precisam corresponder à identidade do resultado. Descrições que mencionam outros carros não estabelecem correspondência. Aliases como `E 36`/`E36`, `MK IV`/`MK4`, `GT-R`/`GTR` e `VW`/`Volkswagen` são normalizados.
- Páginas de categoria e peças/acessórios avulsos são excluídos da pesquisa de veículos completos.
- Identificadores usam a URL completa da fonte, eliminando colisões entre cartões e favoritos. URLs com parâmetros de rastreamento são deduplicadas.
- Filtros combinam AND entre categorias e OR dentro de uma categoria. As contagens ignoram a própria faceta, permitindo combinar suas opções.
- Jogos e formatos são normalizados. Famílias como Need for Speed incluem seus títulos específicos; Assetto Corsa e Competizione continuam distintos.
- Preço desconhecido tem uma opção própria e não é considerado grátis. Rótulos publicados pelas fontes são preservados; o adapter 3DSky usa `price_usd` quando disponível, sem tratar seu preço local como dólares. Não há conversão cambial entre fontes.
- O ano é o ano do veículo, não a data de publicação. Aplicar intervalo exclui resultados sem ano informado.
- Novas pesquisas limpam os filtros por padrão. Marque **Manter filtros na próxima pesquisa** para preservá-los. Repetir a mesma consulta executa uma nova busca.
- Pesquisa, filtros e asset selecionado ficam no link. Recarregar e Voltar/Avançar restauram o estado. Links de assets abrem detalhes mesmo quando o item não está entre os resultados atuais.
- A vitrine inicial exibe resultados progressivamente. Uma interrupção preserva os itens recebidos e oferece nova tentativa; indisponibilidade de streaming tem fallback para REST.

As fontes podem bloquear consultas (403/429), estar offline ou não expor dados ao agregador. Isso aparece como falha de fonte, com o motivo e link para consulta manual. Resultados vazios por filtros têm uma mensagem diferente de pesquisas sem correspondências.

## API

```text
GET /health
GET /api/providers
GET /api/search?q=BMW%20E36&perSource=20
GET /api/search/stream?q=BMW%20E36&perSource=20
GET /api/details?sourceId=sketchfab&url=...
```

`perSource` aceita de 1 a 80; valores inválidos usam 60. `refresh=1` ignora o cache de busca. Respostas sem falhas ficam em cache por até dez minutos; respostas com falhas por até trinta segundos.

As consultas têm prazo de 20 segundos por fonte e 55 segundos para a busca completa. Cancelar a busca interrompe também as requisições externas dos adapters. `SEARCH_CONCURRENCY` controla a concorrência (padrão 8), e `CACHE_TTL_MS` controla o cache. O Blueprint existente em `render.yaml` configura a API no Render.

## Validação

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Os testes da API usam fixtures e dependências controladas para verificar correspondência, preço, filtros, IDs, cache, cancelamento, prazos e entrega SSE. Os testes de navegador verificam filtros combinados, paginação, favoritos, navegação, preservação de filtros, links compartilhados, celular, fallback REST e respostas atrasadas. A CI executa esses testes sem depender da disponibilidade dos sites externos.
