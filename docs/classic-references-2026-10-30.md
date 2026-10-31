# Referências CLASSIC.COM — 30/10/2026

## Resultado real e condição de uso

O CLASSIC.COM continua sendo a única fonte desta integração. As consultas HTTP do servidor e o navegador isolado de testes receberam HTTP 403. O navegador comum conseguiu abrir a busca e a galeria pública, sem login e sem resolver desafios de acesso.

Teste real: **1991 Acura NSX**, exemplar [JH4NA1155MT002364](https://www.classic.com/veh/1991-acura-nsx-senna-jh4na1155mt002364-pdYG574/). Foram lidas **110 fotos** da galeria pública. As URLs com largura de 2000 vieram dos atributos publicados da visualização ampliada; nenhuma resolução foi inventada. Galerias históricas protegidas não foram acessadas.

O servidor importou esses metadados e gerou os dois arquivos reais:

- Três fotos selecionadas: 970.796 bytes.
- Galeria completa, 110 fotos: 33.347.684 bytes, aproximadamente 11,4 segundos. Integridade CRC do ZIP verificada, sem erros, com `sources.txt`.

Os artefatos estão em `.qa/classic-live-*`, ignorados pelo Git. Esse ensaio comprova a leitura pública e a geração do ZIP com fotos reais. A instalação da extensão no navegador pessoal do usuário ainda não foi realizada; os testes da extensão e da interface usam páginas e respostas controladas.

## Como o site funciona

O painel dos detalhes pesquisa a marca, modelo, geração, versão e ano. Cada exemplar tem sua própria galeria, ampliação, seleção múltipla, ZIP selecionado e ZIP da galeria carregada. Há um campo para consultar diretamente um link de exemplar.

A consulta HTTP continua disponível. Quando ela é recusada, o site pode usar **VJ CLASSIC Reader**, extensão para Chrome e Edge distribuída em `classic-reader.zip`. A instalação é única e manual: extrair a pasta, carregar sem compactação em `chrome://extensions` ou `edge://extensions`, recarregar o VJ e conectar o leitor. O build empacota automaticamente os cinco arquivos da extensão.

O leitor abre uma aba temporária ativa, lê o conteúdo público e percorre os controles da galeria ampliada. A aba é fechada ao terminar ou cancelar. Só atua no VJ, na busca e nas páginas públicas de exemplares do CLASSIC.COM. Não solicita permissões de cookies, histórico ou credenciais; não consulta endpoints privados nem resolve verificações. Caso a fonte exija uma verificação manual ou acesso restrito, o site informa a limitação.

A extensão envia metadados ao projeto. O servidor valida novamente endereço, identidade do veículo e domínio das fotos, e emite os IDs usados no ZIP. A presença da extensão não promete disponibilidade de todas as galerias do catálogo.

## Identidade e limites

- A identidade é verificada tanto na busca quanto ao abrir o exemplar. Um título relacionado não confirma outra geração ou versão.
- Busca com paginação publicada, iniciada em 1; a segunda página é `page=2`. Até cinco páginas sob demanda e 24 exemplares por página.
- Até 200 fotos por galeria; a interface informa quantas foram carregadas e quantas foram publicadas quando esse total é conhecido.
- Páginas e redirecionamentos restritos ao CLASSIC.COM. Fotos e redirecionamentos restritos a `https://images.classic.com/vehicles/`.
- Até 12 MB por foto, 64 MB de imagens por ZIP, prazo de 90 segundos. Tipos, assinaturas e tamanhos são validados. Falhas não geram silenciosamente um ZIP incompleto.
- Um ZIP por vez, até dois pendentes e três downloads de foto em paralelo. A ordem de seleção é preservada no arquivo.
- Consultas HTTP: duas ativas, até oito pendentes, HTML de até 4 MB e dez segundos por página. Cache de até 60 entradas por conjunto, com validade padrão de 15 minutos e pausa de um minuto após recusa.
- Extensão: uma leitura por vez, até quatro tarefas contando a ativa; até 60 segundos de navegação na galeria. Cancelamento fecha somente a aba criada pelo leitor.
- Trocar o modelo, exemplar ou fechar os detalhes cancela a operação anterior. Respostas antigas não substituem a galeria atual.
- Os direitos das fotos continuam pertencendo aos titulares. O ZIP inclui a origem e não atribui licença aberta.

## Rotas

- `GET /api/classic/references?title=...&page=1`
- `GET /api/classic/references/gallery?title=...&url=...`
- `POST /api/classic/references/browser-import`, com identidade, tipo e metadados limitados da página pública.
- `POST /api/classic/references/zip`, somente com `galleryId` e IDs emitidos pelo servidor, ou `all: true`.

## Validação automatizada

Há testes para identidade, escopo, resolução publicada, paginação, recusa de acesso, cache, seleção, ZIP, expiração, limites, tipos, redirecionamentos e concorrência. O leitor tem testes de origem permitida, prontidão antecipada da aba e rejeição de destinos externos ou privados. A interface verifica seleção e ZIP, bloqueio explícito, celular/teclado, cancelamento e conexão entre VJ e leitor. As páginas de teste são identificadas como simulações; a prova com 110 fotografias reais é registrada separadamente acima.

A API oficial atende parceiros autorizados. A documentação pública descreve a imagem principal, sem documentar a galeria completa. Nenhuma chave, cookie de conta ou consulta GraphQL privada foi configurada. Documentação consultada: https://support.classic.com/classic.com-api e https://www.classic.com/insights/classic-com-third-party-api-documentation/ . Nenhum contato externo foi enviado.
