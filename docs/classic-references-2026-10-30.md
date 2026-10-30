# Referências CLASSIC.COM — 30/10/2026

## Situação real

O usuário pediu para buscar o veículo exato no CLASSIC.COM ao abrir um modelo, mostrar suas fotografias e baixar as selecionadas ou a galeria carregada em ZIP. Ele confirmou que ainda não tem acesso à API de parceiros.

O teste HTTP normal de busca retornou **403**, com página de verificação de acesso. O navegador também apresentou uma verificação. A chamada real pelo novo leitor para `2023 Ford Bronco DR` retornou `status: blocked`, zero exemplares e mensagem de acesso recusado; uma busca seguinte por `1995 BMW M3 E36` respeitou a pausa de novas tentativas. **Nenhuma galeria real completa foi extraída ou validada.**

A implementação permanece em um PR de rascunho, sem publicação em produção enquanto a extração real estiver sem validação. Os testes com HTML e respostas controladas verificam o funcionamento do código, e não provam disponibilidade da fonte.

## Implementação

- Painel dentro dos detalhes do modelo, com busca automática, edição da identidade pesquisada, exemplares separados, ampliação das fotos e seleção múltipla. Pode consultar diretamente um link de veículo/lote informado pelo usuário.
- Leitor de páginas públicas: pesquisa padrão do CLASSIC.COM, links de exemplares e dados estruturados JSON-LD. Galerias são lidas somente da página do exemplar que corresponde à identidade; imagens de recomendações, vendedores e logotipos ficam fora.
- Reutiliza a verificação existente de marca, modelo, geração, versão e ano explícito. A identidade é verificada de novo ao abrir cada exemplar. Ausência de correspondência não produz uma galeria aproximada.
- Seleciona versões de imagem efetivamente publicadas na página. Não modifica URLs para inventar uma resolução maior. Quando só há capa, a interface informa que é uma prévia, sem afirmar que encontrou todas as fotos.
- Reconhece recusa HTTP, verificação de acesso e galeria restrita. Não usa cookies, credenciais pessoais, endpoints privados, resolução de desafios ou recursos de evasão de bloqueio.
- Cada ZIP aceita apenas IDs de fotos de uma galeria criada pelo servidor. URLs arbitrárias fornecidas pelo cliente não são baixadas. Páginas e redirecionamentos ficam no CLASSIC.COM; fotografias e seus redirecionamentos ficam no domínio `images.classic.com`, caminho `/vehicles/`.
- Valida tamanho declarado, tamanho efetivo, tipo de conteúdo e assinatura do arquivo. O ZIP inclui `sources.txt`; não atribui licenças abertas às fotografias.
- A troca de modelo/galeria ou fechamento da tela cancela consultas e preparação de ZIP em andamento. Resultados antigos não substituem a seleção atual.

## Limites explícitos

- Até 5 páginas de busca consultadas sob demanda, 24 exemplares por página e 200 fotos por galeria. A interface informa truncamento quando detectado.
- Até 12 MB por foto e 64 MB de conteúdo de imagens por ZIP. Arquivos que excedem os limites pedem uma seleção menor; falhas de download não geram silenciosamente um ZIP incompleto.
- Duas leituras de página e uma preparação de ZIP por vez por processo, com filas de até oito consultas e dois ZIPs pendentes. Cache em memória de até 60 entradas por conjunto, normalmente por 15 minutos; acesso recusado gera pausa de um minuto.
- Leitura de HTML de até 4 MB e tempo limite de dez segundos por página. ZIP com prazo total de 90 segundos.
- “Baixar todas” significa todas as fotos da **galeria carregada daquele exemplar**, conforme indica a interface. Não promete todas as fotos do catálogo ou conteúdo que a fonte não expõe.

## API do projeto

- `GET /api/classic/references?title=...&page=1`: exemplares confirmados ou diagnóstico de acesso.
- `GET /api/classic/references/gallery?title=...&url=...`: galeria pública do exemplar confirmado.
- `POST /api/classic/references/zip`: JSON com `galleryId` e `ids`, ou `galleryId` e `all: true`.

## Dependência para ativação

A API oficial é GraphQL e atende parceiros autorizados por integração. Sua documentação pública descreve `image_url` como **imagem principal do anúncio**; não documenta a obtenção da galeria inteira. Ainda precisamos de um meio de acesso que funcione e confirmação de quais fotografias podem ser exibidas e disponibilizadas para download no VJ. As consultas GraphQL não foram inventadas nem apresentadas como configuradas.

Fontes verificadas:

- https://support.classic.com/classic.com-api
- https://www.classic.com/insights/classic-com-third-party-api-documentation/
- https://www.classic.com/about/terms-conditions/

Contato oficial para integrações: `datasupport@classic.com`. Nenhum contato externo foi enviado nesta tarefa.

## Validação do código

- 13 testes do leitor e rotas: identidade, escopo das imagens, resolução publicada, paginação, restrição de acesso, cache, IDs de seleção, ZIP, expiração, tamanho, tipos de arquivo, redirecionamentos e fila limitada.
- 5 testes novos de interface: carregamento ao abrir o carro, ZIP selecionado e completo, bloqueio explícito, capa sem galeria, erros de identidade/expiração, teclado/celular e troca de exemplar durante uma resposta pendente.
- Revisão visual em 320 px com imagens de teste, sem apresentar essas imagens como fotografias reais da fonte.
- Verificação de tipos, build e testes existentes executados. A disponibilidade externa continua pendente, independentemente desses resultados.
