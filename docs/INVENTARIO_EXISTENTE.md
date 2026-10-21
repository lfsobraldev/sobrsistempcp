# Inventário do ERP

Item | situação (existente / melhorado / criado) | arquivos | observação
--- | --- | --- | ---
Programação industrial e importação Consistem | existente | `app/(erp)/programacao`, `app/api/programacoes`, `lib/order-import.ts` | Preservar códigos, quantidades, filtros e ordenação industrial.
Operações e apontamentos de produção | existente | `database/schema.sql`, `lib/pcp-schema.ts`, `app/api/pcp/operacoes/route.ts` | Produção registrada não equivale a OF independente.
Ordem de fabricação independente | criado | pendente | Não há entidade e fluxo próprios de OF; campo `of` é referência textual nos itens.
Estoque: produtos, unidades, locais, saldos | existente | `lib/estoque-schema.ts`, `app/api/estoque` | DDL atualmente inicializado em runtime, sem migration versionada correspondente no diretório.
Ledger imutável de estoque | existente | `lib/estoque-schema.ts`, `lib/estoque-db.ts`, `app/api/estoque/movimentos/route.ts` | `est_movimentos` é append-only; reaproveitar.
Inventário físico e contagem | existente | `app/api/estoque/inventarios/route.ts`, `lib/estoque.ts` | Divergências exigem conferência; fechamento processa ajustes em mais de uma instrução.
Bloqueio de movimentação durante inventário | melhorado | `lib/estoque-db.ts`, `tests/estoque-db.test.ts` | Considera escopo geral/local mesmo antes de adicionar o produto à contagem; concorrência na abertura/fechamento permanece pendente.
Reserva e bloqueio de estoque | existente | `lib/estoque.ts`, `lib/estoque-db.ts` | Controles por saldo/pedido, sem associação a OF persistente.
Fornecedores e suprimentos | criado | pendente | Nenhum cadastro/fluxo de compras correspondente identificado.
Lotes e números de série | criado | pendente | Sem rastreabilidade por lote/série no estoque.
CRM, clientes e representantes | existente | `app/(erp)/comercial`, `app/api/comercial/crm/route.ts`, `database/migrations/2026-10-20_crm_comercial.sql` | Conversão comercial cria/vincula pedido nos fluxos atuais.
Medições versionadas | existente | `app/(erp)/medicoes`, `app/api/medicoes/route.ts`, `lib/medicoes.ts` | Valida unidades suportadas e mantém revisão/aprovação.
SAC e eventos | existente | `app/(erp)/sac`, `app/api/sac/route.ts`, `database/migrations/2026-10-19_sac_industrial.sql` | Vínculos a cliente/pedido/medição; sem anexos próprios.
Qualidade/MSAC de pallets | existente | `app/(erp)/inspecao-pallets`, `app/api/pallets/route.ts` | Inspeção, fotos em banco, NC, bloqueio e liberação.
QR e portal de pallet | existente | `app/api/pallets/public-link/route.ts`, `app/api/pallets/public-tracking/route.ts`, `app/rastreio/pallet` | HMAC baseado em UUID; sem revogação individual ou rate limit persistente.
Controle de entrega e carregamentos | existente | `app/api/controle-entregas`, `app/api/controle-entregas/carregamentos/route.ts` | Datas, transportadora, NF como referência e eventos.
Romaneios e etiquetas | existente | `app/(erp)/romaneios`, `app/api/romaneios`, `lib/romaneio` | Processamento/exportação; sem ciclo completo persistido de carga/pallet/recebimento.
Multiempresa, filiais e isolamento | melhorado (fundação de schema) | `database/migrations/2026-10-21_fundacao_multiempresa.sql` | Cadastro de empresa/filial e vínculo de usuário com escopo por filial definidos; migration não aplicada, sem backfill nem enforcement nas rotas.
RBAC atual | parcial (fundação de schema) | `lib/auth.ts`, `database/migrations/2026-10-21_fundacao_multiempresa.sql`, APIs por módulo | Perfil/cookie HMAC e listas de papéis permanecem ativos; catálogo de permissões e grants por perfil definidos, ainda sem população nem enforcement por empresa/filial.
Auditoria global append-only | parcial (fundação de schema) | `pcp_eventos`, `crm_historico`, `database/migrations/2026-10-21_fundacao_multiempresa.sql` | Ledger global definido com trigger que bloqueia UPDATE/DELETE; ainda sem escrita pelas rotas e sem migration aplicada.
Financeiro, fiscal e contabilidade | criado | pendente | Não foram encontrados módulos/tabelas correspondentes.
Manutenção e ativos | criado | pendente | Capacidade/setup/perdas existem; ativos e ordens de manutenção não foram encontrados.
IA consultiva tipada | existente | `app/(erp)/sobral-ia`, `app/api/ia/chat/route.ts`, `lib/ia` | Ferramentas tipadas, consultas delimitadas e rate limit em memória; avaliar custo/latência e limite distribuído.
Painel de migrações do sistema | criado (estrutura inicial) | `app/admin/migracoes/page.tsx`, `app/api/admin/migracoes/route.ts`, `lib/migration-service.ts`, `scripts/migrate.ts`, `docs/MIGRACOES.md` | Reúne catálogo de arquivos, estado de habilitação, checksum e execução segura de migrações; ainda sem execução real em banco e sem aplicação do SQL em Neon.
Programação mensal por unidade | melhorado | `app/(erp)/programacao/sul/page.tsx`, `.../nordeste/page.tsx`, `.../consolidado/page.tsx` | Estrutura de visualização por unidade, competência, comparativo e tabela; importação, validação e persistência do CSV continuam pendentes.
Configurações do usuário | melhorado | `app/(erp)/configuracoes/page.tsx` | Abas de perfil, preferências, notificações, usuários, permissões e sistema; sem vínculo atual ao banco de usuários/permissões.
CI de testes/build | parcial | `.github/workflows/verify-build.yml` | Testa/build em PR; filtros de paths e atualização automática do lockfile precisam revisão.

## Revisão de 21/10/2026 — programação multimestre

As páginas mensais originais eram demonstrações estáticas. Foram substituídas por `components/programacao-mensal.tsx` e `/api/programacao-mensal`. Importador reaproveitado: `lib/import-reader.ts`; parser/liberação industrial preservados. Não existe CSV de exemplo versionado. `pcp_programacoes.data_programacao` fornece competência dos dados legados, projetados sem cópia por views. Novos lotes/itens são a camada de planejamento mensal, sem duplicar ordens/produção. Detalhes, dependências, limites e validação: `RELATORIO_PROGRAMACAO_MULTIMES.md`. Referências e sequência de evolução ERP: `REFERENCIAS_ERP_INDUSTRIAL.md`.
