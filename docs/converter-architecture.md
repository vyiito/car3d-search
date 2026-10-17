# Ferramentas e conversor KN5

O catálogo continua em `index.html`. A página independente `tools.html` contém o conversor e o histórico privado deste navegador, com seis conversões por página. O frontend não recebe a chave do agente Windows.

## Fluxo

1. A página consulta a disponibilidade do agente. Uploads são recusados se ele estiver offline.
2. O usuário envia um KN5 de até 128 MiB. O nome original é preservado. A pasta original pode ser informada ou preenchida automaticamente ao selecionar a pasta do mod; somente o KN5 escolhido é enviado.
3. A API transmite o corpo diretamente ao disco, valida a assinatura e coloca a tarefa na fila. O navegador recebe uma credencial aleatória exclusiva para consultar, cancelar e baixar essa conversão.
4. Um único agente Windows faz conexões de saída para a API, recebe uma tarefa com uma concessão exclusiva e mantém sua atividade por heartbeat. Nenhuma porta do computador precisa ser aberta.
5. O agente valida a estrutura do KN5, cria uma pasta de carro dentro de um DummyAC próprio e executa o Content Manager Centrale com `--auto-decrypt`. O perfil usa `Centrale.data`, preservando o perfil principal do usuário.
6. A leitura da malha e a extração de texturas usam o conversor Python já instalado pelo usuário. A exportação OBJ da integração grava cada face uma vez, transforma normais pela inversa transposta e escreve caminhos de textura compatíveis com outros sistemas.
7. O agente verifica geometria, referências e texturas substitutas, gera OBJ/MTL/texturas e ZIP, envia o resultado e remove os arquivos da tarefa no computador.
8. O navegador solicita um ticket de download de uso único, válido por um minuto. O ZIP fica disponível por 60 minutos após a conclusão. A entrada na API é removida assim que o resultado é recebido.

## Identidade do carro protegido

No Mustang testado, trocar o nome da pasta do carro produziu um arquivo com texturas substitutas. O nome original `mnba_ford_mustang_gt_2018`, junto ao arquivo original, permitiu recuperar o conteúdo. Por isso a integração preserva nomes e oferece seleção de pasta e campo de identidade; não renomeia indiscriminadamente os modelos para `model.kn5`.

Nomes de arquivos presentes de forma não ambígua no catálogo local fornecido podem ser associados automaticamente à sua pasta original. A associação permanece na configuração local do agente, sem distribuir modelos ou chaves pelo Git. Outros modelos podem precisar da seleção da pasta ou do nome original. Chaves ausentes, formatos não suportados e texturas externas continuam gerando erro explícito.

## Limites e isolamento

- Dois uploads/tarefas ativos; seis envios por IP por hora; até 20 registros retidos por instância.
- Reserva de armazenamento global de 768 MiB; entrada de 128 MiB e ZIP de 256 MiB.
- Validação de caminhos Windows, ADS, nomes de dispositivos, contagens, tamanhos, hierarquia e índices antes da execução nativa.
- Processos sem shell, com stdin fechado, timeout, limite de memória e Windows Job Object para encerrar descendentes. Um agente por diretório local, usando lock do sistema.
- Diretório dedicado para cada tarefa; somente pastas próprias com marcador são removidas. Uploads não são extraídos como arquivos executáveis.
- Tarefas em processamento expiram se o agente não renovar sua concessão. Resultados de uma concessão cancelada ou vencida são rejeitados.
- O estado é salvo no disco da API, com hashes das credenciais de cada usuário. Não há endpoint público para listar conversões de outras pessoas.
- O plano atual do Render usa disco efêmero: uma substituição de instância pode perder a fila e os resultados. O frontend informa expiração/interrupção e permite reenviar. Não há promessa de armazenamento permanente.

O Content Manager permanece um programa nativo executado no computador Windows configurado. A disponibilidade depende de essa máquina estar ligada, com sessão e conexão ativas. O agente é iniciado na entrada da sessão pelo atalho de inicialização instalado localmente. Para disponibilidade independente deste computador, será necessário transferi-lo para uma máquina Windows dedicada.

## Configuração

`CONVERTER_WORKER_TOKEN` na API precisa coincidir com `token` no arquivo local de configuração do agente. Essa chave não deve ir para `VITE_*`, Git, HTML, query strings ou logs. O token é configurado no ambiente do serviço existente do Render, sem substituir as outras variáveis.

`CONVERSION_STORAGE_DIR` pode alterar o diretório temporário da API. Persistência confiável e múltiplas instâncias exigem armazenamento e fila externos; o serviço atual deve continuar com uma instância.

Veja [o guia do agente](../worker/README.md). Os executáveis, bibliotecas, dados de chaves e o conversor Python de terceiros não são distribuídos pelo repositório.
