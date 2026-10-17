# Agente Windows do conversor

O agente executa o conjunto local Content Manager Centrale + DummyAC. Ele consulta a API por HTTPS; não expõe uma porta no computador. Os programas e as chaves de terceiros continuam locais.

Requisitos: Windows com sessão ativa, Python 3.12 com NumPy e as ferramentas já instaladas e funcionando. A integração não instala o Content Manager nem transfere sua licença ou suas chaves para o servidor.

## Preparar

Use um caminho curto fora de pastas virtualizadas, por exemplo `C:\Users\SEU_USUARIO\.vj3d-converter`. Na pasta do repositório:

```powershell
python worker/setup_agent.py --pack "C:\caminho\JAPA KN5 CONVERTER" --destination "C:\Users\SEU_USUARIO\.vj3d-converter" --config "C:\Users\SEU_USUARIO\.vj3d-converter\config.json" --api-url "https://car3d-search-api.onrender.com"
```

O setup cria outro DummyAC e perfil, copia as chaves/plugins locais e configura o caminho do DummyAC em `Centrale.data`. O perfil principal do Content Manager não é alterado. As cópias usam o mesmo contexto Windows do usuário que já configurou as ferramentas.

Acrescente ao `config.json` um campo `token` aleatório de pelo menos 32 bytes e configure o mesmo valor em `CONVERTER_WORKER_TOKEN` na API. Mantenha o arquivo privado e fora do repositório. O setup preserva um token já configurado.

## Executar

```powershell
python "C:\Users\SEU_USUARIO\.vj3d-converter\runtime\agent.py" --config "C:\Users\SEU_USUARIO\.vj3d-converter\config.json"
```

Para instalar o atalho de inicialização da sessão:

```powershell
.\worker\install-startup.ps1 -ConfigPath "C:\Users\SEU_USUARIO\.vj3d-converter\config.json"
```

O atalho **VJ 3D Converter** inicia o `pythonw.exe` e o agente em segundo plano. Fechar a sessão ou desligar o computador deixa o conversor offline no site. Para desativar o início automático, remova somente esse atalho da pasta Inicializar do Windows.

O arquivo `agent.log` registra disponibilidade e códigos de erro, com rotação de tamanho. Não registra credenciais nem nomes dos arquivos enviados. Para atualizar as chaves depois de configurá-las no Content Manager principal, pare o agente, execute o setup novamente e reinicie-o.

## Proteções e limitações

O nome original da pasta pode ser necessário para abrir um modelo protegido. A seleção da pasta do mod no site preenche esse nome sem enviar os outros arquivos da pasta. Associações inequívocas de nomes do catálogo local são usadas automaticamente.

A etapa Python valida e exporta geometria estática, materiais aproximados e texturas incorporadas. OBJ não preserva rig ou animação. Referências externas ausentes, formatos desconhecidos, um resultado composto inteiramente por texturas substitutas, ou limites excedidos não são apresentados como sucesso.

Cada execução tem limites de tempo, memória, disco e caminhos. Não desative os limites para disponibilizar o agente a arquivos públicos. Para uma instalação com disponibilidade contínua e isolamento adicional, utilize uma máquina Windows dedicada à conversão.

## Testar sem os programas de terceiros

```powershell
python worker/test_kn5.py
python worker/test_kn5.py --sample exemplo.kn5
```

Os testes verificam leitura limitada, caminhos inseguros, faces duplicadas entre malhas e normais em uma transformação com escala não uniforme. O sample é uma pequena malha própria para smoke tests; não contém assets de terceiros.
