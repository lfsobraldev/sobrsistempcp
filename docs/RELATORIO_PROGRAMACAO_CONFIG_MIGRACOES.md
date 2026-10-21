# Relatório da entrega: programação, configurações e migrações

## 1) Reaproveitado / melhorado / criado

### Reaproveitado
- Estrutura operacional existente de ERP e rotas em `app/` e `lib/`, preservando o comportamento atual sem quebrar módulos operacionais já ativos.
- Controle de acesso e catálogo de permissões já existente em `lib/auth.ts` e `lib/permissions.ts`, utilizando o padrão atual para exibir e proteger opções administrativas.
- Importador/visualização de programação e dados de PCP em `app/(erp)/programacao` e rotas do ERP, sem alterar a lógica de importação atual já em uso.
- Sistema de banco Neon via `lib/db.ts` e migração de schema já existente no repositório para manter a convenção e a segurança de operação.

### Melhorado
- Página de configurações em `app/(erp)/configuracoes/page.tsx`, expandindo a área de perfil, preferências, notificações, usuários, permissões e sistema.
- Painel de migrações em `app/admin/migracoes/page.tsx` e endpoint em `app/api/admin/migracoes/route.ts`, acrescentando catálogo, checksum e sinalização de ambiente.
- Páginas de programação por unidade em `app/(erp)/programacao/sul/page.tsx`, `nordeste/page.tsx` e `consolidado/page.tsx`, com organização por competência, comparativo e tabela estruturada.

### Criado
- `database/migrations/2026-10-21_02_schema_migrations.sql` para controlar `schema_migrations` e `schema_migration_events`.
- `lib/migration-service.ts` para catalogar migrações, calcular checksum e expor o estado de ambiente.
- `scripts/migrate.ts` para CLI de execução (`npm run migrate`).
- `docs/MIGRACOES.md` com fluxo de geração, aplicação e reversão.
- `docs/SUPOSICOES.md` e registros de inventário/progresso para documentar premissas e estado atual.

## 2) Migrações em ordem e descrição

A sequência atual de migrações no repositório é:

1. `2026-10-02_pallet_quality_msac.sql` — ajustes de qualidade de pallets e MSAC.
2. `2026-10-02_pallet_quality_v2.sql` — correção/ajuste de qualidade de pallets.
3. `2026-10-06_operational_excellence.sql` — melhorias de excelência operacional.
4. `2026-10-08_quality_user.sql` — ajustes de usuários da qualidade.
5. `2026-10-09_tipo_pedido_embalagem.sql` — tipos de pedido e embalagem.
6. `2026-10-12_ia.sql` — evolução do módulo de IA.
7. `2026-10-16_local_montagem.sql` — local de montagem.
8. `2026-10-19_sac_industrial.sql` — SAC industrial.
9. `2026-10-20_crm_comercial.sql` — integração comercial.
10. `2026-10-20_medicoes_engenharia.sql` — medições de engenharia.
11. `2026-10-21_02_schema_migrations.sql` — controle do schema migrations e auditoria do próprio mecanismo de migração.

Observação: a migration criada neste trabalho é aditiva e registra a fundação de controle do sistema de migrações sem tocar em dados operacionais existentes. Ela não foi executada automaticamente no banco em ambiente real, conforme regra da missão.

## 3) Variáveis de ambiente novas e relevantes

- `ALLOW_ADMIN_MIGRATIONS` — habilita o painel de migrações e o script `npm run migrate`.
- `DATABASE_URL` — base de dados Neon vinculada ao ambiente ativo.
- `NEON_BRANCH_NAME` e `VERCEL_GIT_COMMIT_REF` — usados para identificar o branch/ambiente no painel.
- `MIGRATION_ACTOR` — nome do agente/usuário responsável pela aplicação por CLI.

## 4) Testes e validação

Validação executada:

- `npm test` — passou.
- `npm run build` — passou.

O comportamento atual da ERP foi preservado, e as telas recém-criadas continuam como estrutura visual / fluxos controlados pela UI, sem duplicar módulos já existentes.

## 5) Riscos

- A execução real de migrações em Neon ainda depende de ambiente configurado e do mecanismo de bloqueio/lock transacional a ser liberado oficialmente no painel.
- A importação real do CSV por unidade/mês ainda depende de integração com o banco, do modelo de dados do mês/unidade e do fluxo de validação antes de confirmar.
- As telas de configurações e programação são estruturadas, mas não substituem a persistência e o RBAC completo do backend.
- O painel de migrações está protegido por `ALLOW_ADMIN_MIGRATIONS`, mas a execução de SQL real deve seguir validação adicional em branch e homologação antes de produção.

## 6) Suposições registradas

- A unidade e a competência são inferidas por CSV e normalizadas para `SUL`, `NORDESTE` e `CONSOLIDADO` quando necessário.
- O modelo de importação não deve duplicar registros com mesmo hash ou chave natural.
- Migrações seguem o padrão `YYYY-MM-DD_NN_descricao.sql`, com blocos `-- migrate:up` e `-- migrate:down`.
- Nenhuma migration será aplicada sem autorização manual no ambiente e sem controle de checksum.

## 7) Como validar manualmente

### 7.1. Configuração de ambiente

1. Defina `DATABASE_URL` com a base de dados de teste/branch do Neon.
2. Defina `ALLOW_ADMIN_MIGRATIONS=true` apenas para ambiente controlado.
3. Execute:

```bash
npm run migrate
```

### 7.2. Acessar o painel de migrações

- Acesse `/admin/migracoes` como usuário administrativo.
- Confirme que a listagem mostra as migrações em ordem e `checksum` do arquivo.
- Simule a confirmação no ambiente e verifique os estados de pendente/aplicada.

### 7.3. Validar programação por unidade

1. Abra `/programacao/sul`, `/programacao/nordeste` e `/programacao/consolidado`.
2. Confirme a navegação entre as unidades e os cartões de resumo.
3. Valide os filtros de competência e comparação visual do mês.
4. Para o mês 10/2026, confirme a lógica de importação inicial, leitura do CSV e controle de linhas/importação em lote.

### 7.4. Importação do mês 10/2026

- Usar o fluxo de importação já existente do ERP, aplicando a regra de competência e unidade do CSV.
- Validar a pré-visualização antes de confirmar.
- Verificar que o arquivo não duplicate registros em re-importação (hash/chave natural).
- Verificar a diferenciação entre importar novo mês e acrescentar ao mês existente.

## 8) Conclusão

A entrega consolidou a base operacional para:
- migrações controladas por repositório,
- configurações de usuário por abas,
- e páginas de programação por mês/unidade com estrutura de seleção e comparação.

A garantia de segurança e de não interrupção do ERP ficou condicionada à execução real em ambiente de homologação, com `ALLOW_ADMIN_MIGRATIONS` habilitado apenas por administrador e após conferência do checksum e do branch de destino.
