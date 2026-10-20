# Latência da busca e estabilidade do visualizador — 20/10/2026

## Causas reproduzidas

Na consulta de controle em produção `Ford Bronco DR`, o RenderHub iniciou depois de cerca de 23 segundos: os oito slots eram ocupados pelas fontes anteriores na lista. Seu resultado só foi enviado após terminar as demais páginas dessa fonte. A consulta terminou em 36,47 segundos nessa medição; na verificação anterior pela interface, em aproximadamente 57 segundos.

A falha de CI foi reproduzida com CPU limitada a ¼ da velocidade. O teste de seleção com 220 peças ultrapassou 30 segundos no mesmo passo da execução publicada. A cena estática era redesenhada continuamente por WebGL.

## Correções

- Fontes com pesquisa direta e marketplaces recebem prioridade de execução, preservando a ordem original dos status no retorno. Continuam sendo consultadas todas as fontes selecionadas; limites e paginação não foram reduzidos para aparentar ganho de velocidade.
- Cada página pode enviar modelos imediatamente por SSE, enquanto outras páginas da mesma fonte ainda são consultadas. Eventos intermediários não incrementam a contagem de fontes concluídas nem duplicam a contagem de modelos.
- Cache por fonte, consulta, limite e profundidade: a falha de uma fonte não invalida os resultados das demais. Respostas saudáveis usam o TTL configurado, normalmente 10 minutos; falhas transitórias expiram em 5 segundos.
- Consultas iguais simultâneas compartilham o trabalho. Um consumidor pode cancelar sem interromper os demais; o trabalho é abortado quando o último sai. Novos consumidores recebem o último estado de cada fonte.
- Bloqueios completos e exigências de acesso entram em pausa por 5 minutos; limites de requisição, por 1 minuto. Outra busca não repete imediatamente o mesmo acesso recusado. Atualização explícita ou busca ampliada permite tentar novamente. Uma rota opcional bloqueada não desativa um catálogo público que funciona.
- Se uma atualização falhar, resultados anteriores ainda disponíveis em memória são preservados com indicação de que são antigos e de que a consulta atual está incompleta. Cache limitado a 400 entradas; não é um índice persistente e se perde ao reiniciar o serviço.
- O visualizador redesenha quando muda câmera, seleção, material, grade, malha ou tamanho. Damping e rotação automática continuam animados. Um modelo parado deixa de consumir desenho contínuo da GPU.

## Evidência

- Testes de servidor inicialmente reproduziram seis falhas: ausência de entrega intermediária, invalidação conjunta do cache, repetição de bloqueios, trabalho duplicado, fila inadequada e contagem SSE inflada. Todos passaram após as correções, com testes adicionais de retenção de resultados e catálogo alternativo acessível.
- Na medição local com fontes reais, o primeiro resultado chegou em 1,74 segundo, a consulta terminou em 11,17 segundos e a repetição em cache foi imediata. Esses tempos dependem da rede e das fontes; a comparação final de produção exige medir o servidor publicado.
- O teste que excedia 30 segundos com CPU a ¼ passou três vezes nas mesmas condições: 20,8, 21,5 e 21,7 segundos, mantendo o limite original. Um teste separado verifica que a cena para de desenhar e volta a desenhar com mudanças na câmera e na visualização.

## Acesso externo

Free3D, ETS2.lt, ModDB, OverTake e CGTrader recusaram consultas automáticas em produção; VK exige acesso autorizado. Rotas públicas alternativas verificadas para ETS2.lt (REST/feed), OverTake (RSS), ModDB (RSS) e CGMood também retornaram HTTP 403 nesta investigação. Não foram usadas credenciais, pagamento nem soluções de desafio.

Essas fontes continuam identificadas como acesso limitado, com link para a busca original e indicação da pausa quando aplicável. Não são declaradas como catálogos completos nem removidas da contagem para esconder falhas. Uma integração que dependa de login, chave ou contrato continua exigindo autorização fornecida pela fonte.
