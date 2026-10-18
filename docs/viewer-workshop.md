# Visualizador 3D na página Ferramentas

Abra `tools.html#viewer`. A bancada aceita GLB/glTF 2.0, OBJ/MTL e suas texturas, seleção de pasta ou um ZIP contendo esses arquivos. Um pacote com vários modelos oferece seleção do arquivo principal.

## Fluxo

- Os arquivos locais são lidos neste navegador. Referências HTTP externas em glTF são recusadas; os arquivos necessários devem estar na seleção. MTLs com texturas ausentes usam material substituto e exibem um aviso.
- A tela do conversor e o histórico oferecem **Visualizar resultado** para conversões concluídas. A interface pede um novo ticket privado, baixa o ZIP com prazo e tamanho limitados e abre esse pacote localmente. A credencial da conversão permanece no cabeçalho Authorization; não é passada ao visualizador ou incluída na URL. Não foram criados endpoints públicos de listagem ou de extração de arquivos.
- A seleção de pasta preserva caminhos relativos. Recursos com nome repetido só são associados quando o caminho é exato ou a correspondência é única.
- OBJ usa MTL e imagens em PNG, JPEG, WebP, BMP, TGA e DDS RGB/alpha/luminância, DXT1/3/5. DDS de outros tipos gera aviso e uma textura neutra. Há fallback para DXT em dispositivos sem S3TC e para dimensões pequenas incompatíveis com o armazenamento comprimido de WebGL.
- GLB/glTF suporta materiais PBR e os decoders Draco, Meshopt e KTX2 configurados com a versão instalada de Three.js. A prévia desta versão é estática.

## Controles

Selecione peças pelo clique na malha ou pela lista pesquisável. É possível ocultar, mostrar, isolar e enquadrar peças; mudar a vista, ativar wireframe, rotação automática e grade; editar cor, opacidade, rugosidade e metalização; substituir a textura de cor; e restaurar o material carregado.

As caixas da lista somam ou removem peças da seleção. Ctrl/Cmd ou Shift + clique também alternam uma peça; ativar **Seleção múltipla** permite esse comportamento sem teclado, tanto na lista quanto no modelo. A última peça selecionada fica ativa para o editor de materiais. Ocultar, mostrar, isolar e enquadrar atuam sobre o conjunto selecionado; a seleção permanece ao mudar a busca ou a página. **Limpar seleção** remove todas as marcações.

A seleção ganha uma sobreposição roxa na geometria e uma linha destacada na lista, sem alterar os materiais do arquivo. Ao clicar no modelo, a lista abre a página correspondente e rola somente seu painel até a peça; uma busca que esconderia essa seleção é limpa. A lista tem páginas de 100 peças, com acesso às demais por Anterior/Próxima. O destaque desaparece ao ocultar a peça e não entra no PNG exportado.

Os ajustes de material aparecem no PNG e nos downloads 3D das peças. Um material compartilhado afeta todas as peças que o usam. O enquadramento por eixo é identificado por +Z, +X e Topo; a orientação original do modelo é preservada. Dimensões são expressas nas unidades do modelo.

## Download de peças

- O ícone de download na linha baixa somente aquela peça em GLB, sem alterar a seleção. **Baixar selecionadas (GLB)** cria um arquivo com as peças escolhidas e **Peças separadas (ZIP)** entrega um GLB por peça, com nomes únicos e seguros.
- Cada GLB incorpora os materiais atuais e as texturas necessários. O pacote original da conversão permanece inalterado. A geometria é uma fotografia estática da prévia: transformações, poses e instâncias são aplicadas às malhas; animações e esqueletos não são exportados. As peças mantêm suas posições relativas na cena centralizada do visualizador, permitindo remontá-las juntas. Peças selecionadas ocultas também entram no download.
- A seleção roxa, caixa, grade e demais peças não entram no GLB. A imagem PNG também exclui os indicadores de seleção e tem fundo transparente.
- Texturas de imagem são incorporadas diretamente; DDS/KTX2 são convertidas em pixels exportáveis pelo renderizador. Mapas de opacidade separados são combinados com a textura de cor quando usam o mesmo canal UV. Um canal UV diferente gera um erro explicativo, evitando omitir a transparência silenciosamente. Materiais continuam sendo a aproximação exibida na prévia, sem shaders proprietários dos jogos.
- O exportador é carregado sob demanda. O trabalho pode ser cancelado, e trocar/fechar o modelo cancela a exportação. A renderização da cena pausa durante a geração; cópias de geometria, materiais, texturas e alvos temporários são liberados ao finalizar ou falhar. O modelo carregado não é alterado.
- Até 2 milhões de triângulos (contando instâncias), 192 MiB estimados de buffers copiados, 96 milhões de pixels e 256 MiB de download. Texturas repetidas em GLBs separados contam novamente para o tamanho total do ZIP. Para pacotes maiores, exporte grupos menores.

## Limites e ciclo de vida

- Até 256 MiB de arquivos selecionados ou ZIP; 384 MiB de conteúdo total descompactado; 512 arquivos úteis.
- Até 128 MiB por arquivo principal/buffer e 32 MiB por textura; dimensões de até 8192 × 8192 e orçamento de 96 milhões de pixels.
- Até 2 milhões de triângulos, 4.000 peças e 512 materiais. São limites de proteção; a capacidade efetiva também depende do dispositivo.
- O ZIP tem nomes, caminhos e tamanhos declarados verificados antes da descompactação. Cancelar ou trocar de modelo encerra a abertura anterior.
- Ao fechar, trocar o modelo ou sair da aba, são liberados o loop, observadores, controles, decoders, buffers, materiais, texturas, URLs temporárias e o contexto WebGL. O arquivo selecionado continua disponível em memória enquanto permanecer na página, permitindo reabrir a aba. Nada é salvo permanentemente pelo visualizador.
- O renderizador limita a densidade a 2 e pausa o desenho quando a página ou a área da bancada não está visível. O código 3D é carregado sob demanda.

## Verificação

`npx playwright test tests/viewer.spec.ts` cobre abertura OBJ/ZIP e GLB, texturas incorporadas e separadas, seleção/visibilidade, edição/restauração de materiais, substituição de textura, PNG transparente, resultado privado de conversão, dependências externas recusadas, ZIP com caminho inseguro ou expansão excessiva, troca de modelos, pixels DDS conhecidos, navegação de teclado e celular.

`npx playwright test tests/viewer-export.spec.ts` cobre seleção múltipla, comandos em grupo, downloads individuais sem alterar a seleção, GLB conjunto e ZIP separado, reabertura, textura orientada e com cores preservadas, materiais editados, posição relativa, transformações espelhadas, mapa de opacidade e cancelamento com nova tentativa.

A bancada também foi conferida com um ZIP real do conversor: 289.988 triângulos, 246 peças, 84 materiais e 133 arquivos de textura. As abas de Ferramentas têm navegação por setas, Home e End, painéis identificados e o estado do agente fica fora do tablist. O conteúdo principal usa o landmark `main`.
