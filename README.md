# Car3D Search

Metabuscador especializado em modelos 3D de carros e veículos.

## MVP

- Busca local por nome, marca, veículo e fonte
- Filtro de modelos gratuitos
- Filtro por formato
- Filtro por uso (games, impressão 3D e render)
- Catálogo inicial de providers
- Estrutura pronta para evoluir para integrações reais
- Deploy preparado para GitHub Pages

> Os modelos exibidos no MVP são dados demonstrativos. As integrações reais serão adicionadas provider por provider.

## Desenvolvimento

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Próximos passos

1. Validar e ampliar a base de sites.
2. Criar a interface comum `SearchProvider`.
3. Implementar o primeiro provider real.
4. Criar normalização de marca/modelo/geração/ano.
5. Adicionar deduplicação.
6. Migrar os dados para PostgreSQL/Supabase quando necessário.
