# Auditoria de cobertura das fontes

Auditoria em 13/10/2026. Foram inspecionadas as entradas públicas das 32 fontes e executadas consultas de carro (BMW), caminhão (Scania) e moto (Ducati). A amostra usa até 20 modelos por fonte, portanto as contagens abaixo não são totais do catálogo. Os dados e motivos de falha estão em [source-coverage-results.json](source-coverage-results.json).

## Lacunas confirmadas e corrigidas

- 3D Warehouse: a rota antiga não disparava a pesquisa. A rota atual e sua API pública informaram 118 entradas para BMW E36; a busca ampliada recuperou 112 modelos distintos após filtrar e consultar variantes do termo.
- Assetto Hub: modelos estavam no tipo WordPress cars, com taxonomias brand/class/country e dados ACF, não na busca genérica usada anteriormente. A consulta BMW E36 recuperou 8 modelos.
- MediaFire RR3: a pasta principal tinha uma subpasta Cars com 541 arquivos, além de Maps e texturas. A integração agora percorre os arquivos públicos e seus chunks, sem baixar os arquivos dos modelos.
- 3D Rush: a lista é preenchida via AJAX e usa search-term. O adapter atual reproduz a consulta pública com sua sessão anônima, paginação e FREE/PRO.
- VOSAN: a fonte tem um campo search e a categoria correta de packs é car-pack. A busca ampliada BMW E36 concluiu 3 páginas e recuperou 32 modelos, em vez de vasculhar apenas lançamentos recentes.
- ROH3D: products.json expôs 250 produtos na primeira página e mais produtos na segunda; o leitor anterior só acessava uma vitrine de coleção.
- Paginação: suporte a cursores JSON, Blogger, page-N, cars-pageN, coleções e diretórios. Uma página sem correspondências não encerra a busca se a fonte oferece uma próxima página.

## Matriz das 32 fontes

| Fonte | Caminho anterior/lacuna | Caminho e limite atual | BMW / Scania / Ducati |
|---|---|---|---|
| RigModels | Busca HTML e paginação por links. | Busca global preservada; novas regras de páginas e limites explícitos. | 20 / 5 / 5 |
| Free3D | Rota por termo; HTML bloqueado. | HTTP 403 confirmado nas três consultas; acesso automático não validado. | 0 / 0 / 0 |
| 3D Rush | Parâmetro s incorreto e página sem produtos renderizados. | Formulário search-term, sessão pública anônima e AJAX paginado; grátis e PRO. | 20 / 6 / 1 |
| Brasil Simulator Mods | Busca geral WP e detalhes de apenas 12 linhas por página. | Tipo REST cars, todas as linhas com metadados embutidos e paginação. | 20 / 3 / 1 |
| OverTake.gg | Somente algumas tags; detalhes podiam descartar resultados. | Bloqueio 403 confirmado; cobertura de categorias continua não verificada. | 0 / 0 / 0 |
| Assetto Mods | Leitor HTML geral. | REST de posts; categorias/tags alcançadas pela pesquisa global e conteúdo de packs confirmado em listas. | 20 / 0 / 0 |
| ModDB | Acrescentava car vehicle ao termo e recebia 403. | Termo original restaurado; acesso permanece bloqueado na auditoria. | 0 / 0 / 0 |
| Assetto Hub | Busca geral não alcançava o tipo próprio cars. | Endpoint de carros com marcas, classes e campos ACF; paginação e metadados. | 20 / 0 / 0 |
| ETS2.lt | Pesquisa WP por s; acesso bloqueado. | 403 confirmado; carros, caminhões e ônibus não podem ser declarados cobertos. | 0 / 0 / 0 |
| VOSAN | Percorria apenas páginas recentes de Cars. | Pesquisa search da própria fonte em Cars e Car Pack, com próximas páginas e listas de veículos confirmadas. | 20 / 0 / 0 |
| Sketchfab | Uma página, restrita a downloadable. | API pública sem excluir modelos de visualização; cursores next e formatos expostos. | 20 / 20 / 20 |
| CGTrader | Tags e keywords; parada ao encontrar resultados na primeira rota. | Rotas deixam de parar por falta de novos matches; resposta 202 vazia é bloqueio, não busca completa. | 0 / 0 / 0 |
| Done3D | HTML de busca. | REST global de posts com mídia/autor, filtros automotivos e paginação. | 4 / 2 / 0 |
| 3DSky | API paginada sem informar truncamento. | Quantidade total, limites, progresso e paginação verificada dentro do escopo de transporte. | 20 / 20 / 9 |
| Free3D.io | Parâmetro q não acionava a pesquisa, que usa Google CSE. | Catálogo terrestre publicado e próximas páginas; partes e conteúdo não correspondente são filtrados. | 4 / 0 / 0 |
| Vertex Warehouse | Busca nativa com ações Next e limites silenciosos. | Mantém a busca global; informa páginas pendentes e indisponibilidade da ação de paginação. | 20 / 0 / 20 |
| 3D Models Destination | HTML com paginação Blogger não reconhecida. | Feed público com consulta global, rótulos de jogos, start-index e contagem de entradas. | 14 / 0 / 3 |
| MediaFire · Real Racing 3 | HTML da pasta principal sem os arquivos internos. | API pública: subpasta Cars, chunks e subpastas; Maps e texturas avulsas ficam fora dos modelos de veículos. | 20 / 0 / 0 |
| Open3DLab | Duas coleções e páginas fixas de somente uma delas. | Pesquisa global query mais as duas coleções conhecidas; paginação descoberta por links. | 11 / 0 / 0 |
| VK · 3D Car Models | HTML podia parecer busca bem-sucedida com zero modelos. | Catálogo estruturado não exposto ao leitor atual; marcado como cobertura não confirmada/falha. | 0 / 0 / 0 |
| SketchUp 3D Warehouse | URL de busca antiga e aplicativo HTML vazio. | Rota products correta e API pública usada pelo site; offsets, modelos, metadados, previews e formatos. | 20 / 20 / 20 |
| 3D CAD Browser | Limite contado antes do filtro estrito; uma rota por termo. | Termo, fabricante e catálogo Cars; páginas e hits únicos; detalhes enriquecidos sem perder os já encontrados. | 20 / 20 / 20 |
| 3DCar.ru | Somente páginas de galeria listadas na primeira página. | Paginação da galeria percorre os próximos links; resultados continuam sendo referências visuais. | 8 / 0 / 0 |
| 3D-Baza | Somente Car, ignorando Truck/Bus e subcategorias. | Car, Truck e Bus, com subcategorias terrestres publicadas e paginação page-N. | 9 / 2 / 0 |
| BlendKit | Uma página, metadados de preço incompletos. | next, variantes do termo, categoria vehicle, BLEND, licença, tamanho e venda/gratuidade explícita. | 20 / 20 / 2 |
| Wire Wheels Club | Primeiras páginas de gratuito/loja; car não correspondia aos títulos; URLs relativas erradas. | URLs de modelos preservam /models/; catálogo grátis e produtos/categorias da loja paginados. Loja pode exceder o prazo. | 0 / 0 / 0 |
| 3ddd.ru | API/HTML sem informação sobre páginas por consultar. | Progresso da API e total/paginação dentro do transporte; bloqueios/fallback ficam visíveis. | 20 / 20 / 9 |
| ROH3D | Somente a primeira página de uma coleção; freebies podiam ficar de fora. | Catálogo público products.json de todos os produtos publicados, variantes, imagens e todas as páginas. | 12 / 0 / 0 |
| ZIFIR 3D | Uma rota de pesquisa e poucas páginas. | Pesquisa e categorias de carro publicadas: sedan, coupe, classic, wagon, racing e outras; falhas parciais visíveis. | 12 / 0 / 0 |
| 3DExport | Uma rota por termo. | Rota por termo mais catálogo automotivo e seções terrestres publicadas; paginação. Busca AJAX respondeu 403 no teste. | 20 / 20 / 20 |
| CGMood | Somente Cars. | Descobre seções terrestres vinculadas ao transporte; 403/503 impede validar a cobertura completa. | 0 / 0 / 0 |
| RenderHub | Primeiras páginas de carros, sem caminhões/motos; rota de busca incorreta. | Pesquisa s em 3d-models, variantes, Cars/Trucks/Motorcycles e catálogo gratuito, com paginação cars-pageN. | 1 / 20 / 20 |

## Como interpretar a cobertura

- **Paginação concluída:** terminou a consulta nas entradas públicas verificadas. Isso não prova que todo o catálogo do proprietário está exposto nessa consulta.
- **Limitada:** há páginas, seções ou resultados pendentes. A busca inicial tem limites de tempo/resultados; a opção Aprofundar nesta fonte consulta até 200 modelos e 40 páginas com um prazo maior.
- **Parcial:** houve bloqueio, erro ou prazo excedido. Os modelos coletados antes da interrupção são preservados.
- **Não confirmada:** o adapter não forneceu evidência suficiente de que a paginação acabou.

Free3D, ModDB e ETS2 retornaram 403 nas três consultas. CGTrader respondeu 202 sem o catálogo; CGMood retornou 403/503. VK não expõe um catálogo utilizável pelo leitor atual. Seções autenticadas, protegidas ou não publicadas não são declaradas cobertas.

A integração pesquisa metadados públicos e preserva autor, imagem, formatos, jogo, preço/gratuidade, tamanho e licença quando expostos. Um arquivo compactado não é declarado OBJ/FBX sem essa informação; galerias e referências não recebem download de modelo inventado.

## Reprodução e referências

Execute npm ci e npm ci --prefix server, então node scripts/audit-source-coverage.mjs para inspecionar as entradas públicas. As respostas HTML e o mapa de navegação ficam em .qa/source-audit, fora do Git. Com a API local ativa, as consultas da matriz podem ser repetidas em `/api/search?q=BMW&perSource=20&refresh=1`, trocando BMW por Scania ou Ducati. Para aprofundar a validação específica: `/api/search?q=BMW%20E36&source=3dwarehouse&depth=expanded&perSource=200&refresh=1`. A disponibilidade e os resultados dos sites externos podem mudar.

Os 34 testes da API e 14 testes de navegador passaram. Eles verificam páginas tardias, subpastas, limites, seções, preservação de resultados, filtros, cancelamento e ampliação por fonte. Typecheck e build passaram. Uma busca real BMW E36 completou os 32 status com 224 resultados nesta execução; a interface não registrou erros JavaScript nem transbordamento horizontal no celular. As falhas externas permaneceram visíveis no painel.

Documentação primária consultada: [API Sketchfab](https://sketchfab.com/developers/data-api/v3), [API MediaFire de pastas públicas](https://www.mediafire.com/developers/core_api/1.5/folder/), [cliente oficial BlenderKit](https://github.com/BlenderKit/Blendkit/blob/main/search.py). As demais rotas foram verificadas nos formulários, links e consultas públicas dos próprios sites.
