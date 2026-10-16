# Auditoria de falhas e integração GTA5-Mods

Verificação em 16/10/2026, reproduzindo a consulta **Ford Bronco DR** nas 33 fontes. As consultas de controle usam até 20 resultados por fonte. Contagens não representam o tamanho dos catálogos.

Resultados detalhados, entradas consultadas, limites, duração e falhas: [source-reliability-results.json](source-reliability-results.json). Reprodução: `node scripts/audit-source-reliability.mjs .qa/source-reliability-results.json`.

## Correções verificadas

- **3D-Baza**: pesquisa global publicada em `/all-models/search/q-{termo}`, em vez de percorrer apenas lançamentos de categorias. Inclui carros, caminhões e outros veículos, filtrados pelo assunto do modelo. Paginação `/search/q-{termo}/page-N` preservada. O controle Scania recuperou 13 caminhões na primeira página.
- **ZIFIR 3D**: formulário usa `/search/product?q=...`. A rota anterior `/search?query=...` não efetuava a consulta. Incluídas as seções reais de SUVs/off-road, pickups, vans e modelos gratuitos.
- **3DExport**: usa o formulário `/search?search_keywords=...`, em vez de tratar o termo como uma categoria inexistente.
- **Wire Wheels Club**: catálogo gratuito e API pública de produtos WordPress; paginação, previews e formatos preservados. Os preços são enriquecidos pela API WooCommerce Store apenas para produtos correspondentes. Se essa consulta opcional falha, o modelo continua disponível com preço não informado. Removida a entrada `/products/`, que não corresponde ao catálogo publicado.
- **RenderHub**: a consulta e sua paginação recebem prioridade sobre categorias gerais. O modelo correspondente a Ford Bronco DR foi preservado.
- **GTA5-Mods**: integrado ao catálogo, filtros de fonte e GTA V, buscas e paginação numérica. Mantém veículos completos, previews, autores e links originais. Exclui pinturas, handling, sons, peças, mapas e armas. Detalhes não seguem links de arquivos automaticamente.
- **Coletor comum**: duas páginas por fonte em paralelo, limite de páginas mantido, progresso salvo a cada página concluída. A busca global de cada fonte tem prioridade; categorias gerais são usadas quando a entrada de busca não pode ser lida. Leitura de até 16 segundos por página, 26 segundos por fonte e 65 segundos para a busca inicial. A paginação para antes do prazo quando não há margem para outra leitura e informa cobertura limitada, preservando modelos já encontrados. Um retry limitado para HTTP 429/502/503/504; respostas recuperadas não continuam marcadas como falha. Desafios HTTP 202 não contam como páginas de modelos válidas.
- **Status**: bloqueio, acesso autorizado, falha temporária e timeout recebem motivos próprios. Fontes com bloqueio ou login oferecem a busca original, sem sugerir aprofundamento automático que repetiria o bloqueio. Uma página de cobrança de API não é aceita como catálogo vazio concluído.

## Consultas de controle

| Consulta | Fonte | Modelos retornados |
|---|---|---:|
| Ford Bronco | 3D-Baza | 13 |
| Ford Bronco | ZIFIR 3D | 6 |
| Ford Bronco | 3DExport | 10 |
| Ford Bronco | RenderHub | 20 |
| Ford Bronco | GTA5-Mods | 8 |
| Ford | Wire Wheels Club | 6 |

Na consulta exata **Ford Bronco DR**, foi encontrado 1 modelo no RenderHub. As fontes restantes acessíveis não devolveram correspondências nas entradas e páginas verificadas; catálogos limitados continuam identificados como limitados. Não foram incluídos Broncos de outras versões apenas para aumentar a contagem.

## Limitações externas ainda presentes

| Fonte | Resposta observada | Tratamento |
|---|---|---|
| Free3D | HTTP 403 | Bloqueio automático; busca original disponível. |
| ETS2.lt | HTTP 403, inclusive REST público | Bloqueio automático; busca original disponível. |
| ModDB | HTTP 403 | Bloqueio automático; busca original disponível. |
| OverTake.gg | HTTP 403 nas entradas públicas | Bloqueio automático explicitado em vez de erro genérico. |
| CGTrader | HTTP 202 sem catálogo | Desafio de acesso; zero páginas válidas, busca original disponível. |
| CGMood | HTTP 503; também houve HTTP 403 em acesso direto | Indisponibilidade/bloqueio da fonte; tentativa transitória limitada e motivo informado. |
| VK · 3D Car Models | Página pública sem catálogo pesquisável | Exige login/integração autorizada; não declarado como busca vazia concluída. |

Essas restrições não foram removidas pelo código: dependem da disponibilidade ou autorização da própria fonte. Nenhuma credencial, pagamento ou solução de desafio foi utilizada. Free3D.io respondeu com páginas de categoria acessíveis nesta execução; bloqueios podem variar conforme a origem da requisição.

## Verificação

Testes cobrem categorias do GTA5-Mods, previews, paginação, arquivos não seguidos, páginas paralelas e timeout, recuperação de HTTP 503, desafios de acesso, rotas corrigidas e moeda/paginação da loja. A interface confirma GTA5-Mods na pesquisa e ação manual para fontes bloqueadas.
