# Progresso do ERP

Atualizado em 2026-10-21. Branch de trabalho: `erp-completo`.

- Fase 0 — Auditoria: concluída; stack, rotas, schema, RBAC, migrations e gaps registrados no histórico da tarefa.
- Fase 1 — Fundação multiempresa/RBAC/auditoria: em andamento; migration aditiva criada para empresas, filiais, vínculos/escopo de usuários, permissões por perfil e ledger global append-only. Ainda sem backfill, aplicação ou integração com login/rotas.
- Fase 2 — Suprimentos/Estoque: em andamento; inventário inicial concluído. Reaproveitar `est_movimentos`, `est_saldos`, `est_produtos`, `est_locais` e inventários existentes. Melhorado o bloqueio de movimentos no escopo do inventário. Nenhuma migration aplicada. Compras/fornecedores/lotes dependem da fundação multiempresa/filial da Fase 1.
- Fase 3 — PCP/Produção: pendente; preservar programação/apontamentos existentes; OF autônoma ainda ausente.
- Fase 4 — Qualidade: pendente; preservar inspeção/liberação Qualidade/MSAC e medições existentes.
- Fase 5 — Vendas/Expedição/Logística: pendente; evoluir CRM, controle de entregas, romaneios, pallets e QR existentes.
- Fase 6 — Financeiro/Fiscal/Contábil: pendente; sem motor fiscal próprio.
- Fase 7 — Manutenção/Ativos: pendente.
- Fase 8 — Camada Inteligente: parcial existente; evoluções pendentes devem continuar somente leitura para consultas e exigir confirmação humana para escritas.
- Transversal — multiempresa, anexos externos, outbox/jobs, observabilidade, OpenAPI e e2e: pendente/parcial conforme inventário.
- Entrega C — painel de migrações: concluída em estrutura, com `schema_migrations`, catálogo de arquivos em `lib/migration-service.ts`, script `npm run migrate`, página `/admin/migracoes` e guia `docs/MIGRACOES.md`; ainda sem execução real contra Neon e sem `ALLOW_ADMIN_MIGRATIONS` habilitado em produção.
- Entrega A — programações por mês/unidade: páginas `/programacao/sul`, `/programacao/nordeste` e `/programacao/consolidado` estruturadas com seletores de mês, comparativos e tabela; sem importação real do CSV, validação de lote em banco e persistência real do mês/unidade.
- Entrega B — configurações de usuário: abas de perfil, preferências, notificações, usuários, permissões e sistema em `/configuracoes`; sem persistência real de usuários/permissões nem auditoria completa ainda.

Critério por fase: teste focado, `npm test`, `npm run build`, revisão do diff e commit com mensagem `Fase N: <nome>`. Migrações são geradas, nunca aplicadas pelo agente.

## Último incremento validado

- `lib/estoque-db.ts`: movimentos em local coberto por inventário geral ou local são recusados mesmo se o produto ainda não tiver item de contagem.
- `tests/estoque-db.test.ts`: cobre entrada em local com inventário aberto e sem item contado.
- Validação em 2026-10-21: `npm test` 114/114; `npm run build` passou. Nenhuma migration ou consulta ao banco.
- Risco aberto: serializar abertura/fechamento de inventário contra movimentos concorrentes requer desenho e teste em Neon de homologação.
- Incremento da Fase 1: `database/migrations/2026-10-21_fundacao_multiempresa.sql` define o schema-base sem alterar estruturas operacionais existentes. A migration não foi aplicada; dados existentes não foram vinculados a tenant e as rotas ainda não fazem enforcement multiempresa/RBAC.

## Prompt Master — retomada em 2026-10-21

O histórico acima está preservado; as entregas posteriores implementaram unidades globais, acessos centrais, BOM, OF e marketing (migrações 04–07, relatório `ENTREGA_INTEGRADA_ERP.md`). Não recriar esses conceitos.

- Bloco 1, incremento de filtros: validado na branch `erp-master-b1-filtros`. Contrato URL/SQL único para painel e apontamento, competência/filtros/pedidos múltiplos, visão por data, isolamento das métricas, descarte de respostas antigas, data civil e precisão. Sem migrações novas. Restante do bloco: adoção nas demais telas, retenção de histórico e homologação visual.
- PR pendente de abertura: https://github.com/lfsobraldev/sobrsistempcp/pull/new/erp-master-b1-filtros
- Regra atual: somente commit e envio das branches; nenhum merge, deploy ou comando contra banco de produção.
- Próximo grupo: Blocos 2/3 em outra branch, mantendo os componentes e APIs existentes; status mensal e navegação por unidade ainda precisam ser evoluídos.

- Validação do incremento B1: 133 testes passaram; TypeScript e build aprovados. Branch enviada pelo conector GitHub após falha de autenticação do git push; o link acima é para abrir PR, não um PR já criado. Auto-deploy desativado em vercel.json para ambas as branches Master.
