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
- Mapas, pistas, armas, cenários, personagens, móveis, texturas e peças avulsas são excluídos antes de ordenar e limitar a busca. Nome do jogo, classe inferida ou fonte presumidamente automotiva não comprovam que um item seja um veículo. A API, o streaming, o feed inicial e os favoritos usam a mesma regra; catálogos de veículos comprovados preservam títulos incomuns, respeitando as exclusões de outros tipos de asset.
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

## Previews

Os leitores extraem miniaturas de imagens lazy, srcset/picture, links do mesmo modelo e galerias. O catálogo tenta alternativas antes de exibir “Sem preview”. Se faltarem imagens, consulta somente os metadados da página original quando o cartão está próximo da área visível, com no máximo quatro consultas simultâneas, cancelamento e cache. Essa consulta não resolve links de download nem baixa os arquivos dos modelos. Logos, placeholders e ícones genéricos de arquivo não são usados como preview; arquivos sem imagem publicada podem continuar sem preview.

## Cobertura das fontes

A [auditoria das 32 fontes](docs/source-coverage-audit.md) documenta rotas, categorias, coleções, resultados observados e limitações de acesso. O painel **Status e cobertura das fontes** distingue paginação concluída, cobertura limitada, parcial e não confirmada. **Aprofundar nesta fonte** amplia somente a fonte selecionada e preserva os resultados já recebidos.

Cada status da API contém `coverage`, com profundidade, motivo da parada, páginas/seções pendentes, total informado pela fonte, rotas verificadas e falhas. “Paginação concluída” vale para a consulta nas entradas verificadas, sem prometer cobertura de áreas protegidas ou não expostas. Páginas sem matches não encerram a coleta quando há próximas páginas. APIs públicas, catálogos, coleções e subpastas são percorridos conforme a estrutura de cada fonte; metadados e conteúdos confirmados de packs são preservados.

Para repetir a inspeção pública das entradas: `node scripts/audit-source-coverage.mjs`. O mapa de navegação e as respostas ficam em `.qa/source-audit`, fora do Git.

## Ferramentas e conversão KN5

A página independente `tools.html`, destacada no menu, oferece upload KN5, descriptografia, conversão para OBJ/MTL/texturas, download ZIP e histórico local paginado. O processamento é feito por um agente Windows conectado por HTTPS à API; o site informa quando ele está offline. Selecione a pasta do mod para preservar automaticamente o nome original usado por algumas proteções, ou informe esse nome no campo opcional.

Resultados ficam disponíveis por 60 minutos. O serviço atual usa armazenamento temporário, que pode ser perdido em reinicializações ou deploys do Render. Modelos com chaves indisponíveis ou texturas externas ausentes geram um erro explícito.

Veja [a arquitetura e os limites](docs/converter-architecture.md) e [a configuração do agente](worker/README.md). Nenhum programa ou dado de chave de terceiros é incluído no repositório.

## API de pesquisa

```text
GET /health
GET /api/providers
GET /api/search?q=BMW%20E36&perSource=20
GET /api/search/stream?q=BMW%20E36&perSource=20
GET /api/search?q=BMW%20E36&source=3dwarehouse&depth=expanded&perSource=200
GET /api/details?sourceId=sketchfab&url=...
GET /api/preview?sourceId=rigmodels&url=...
```

`perSource` aceita de 1 a 80 na busca inicial (padrão 60). Com `depth=expanded`, aceita até 200 (padrão 200). `source` seleciona uma fonte ou IDs separados por vírgula; IDs desconhecidos retornam 400. `refresh=1` ignora o cache de busca. Respostas sem falhas ficam em cache por até dez minutos; respostas com falhas ou cobertura parcial por até trinta segundos.

As consultas têm prazo de 20 segundos por fonte na busca inicial e 50 segundos na ampliada, com 55 segundos para a busca completa. A busca inicial consulta até 8 páginas por fonte, 16 no MediaFire e 24 no VOSAN; a ampliada consulta até 40. Limites de resultado e tempo também podem encerrar a coleta. Cancelar a busca interrompe também as requisições externas dos adapters. `SEARCH_CONCURRENCY` controla a concorrência (padrão 8), e `CACHE_TTL_MS` controla o cache. O Blueprint existente em `render.yaml` configura a API no Render.

## Validação

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build
```

Os testes da API usam fixtures e dependências controladas para verificar correspondência, preço, filtros, IDs, cache, cancelamento, prazos, entrega SSE, páginas tardias, seções, subpastas públicas, cursores e limites de cobertura. Os testes de navegador verificam filtros combinados, paginação, favoritos, navegação, preservação de filtros, links compartilhados, celular, fallback REST, respostas atrasadas e ampliação por fonte. A CI executa esses testes sem depender da disponibilidade dos sites externos.
