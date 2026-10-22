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


### Grupo 2/3 — incremento de unidades e competências

- Branch `erp-master-b23-unidades-meses`, baseada na branch B1 (`erp-master-b1-filtros`), sem merge/deploy. Revisar B1 antes; o segundo link inclui as mudanças do primeiro enquanto ele não for integrado.
- PR pendente de abertura: https://github.com/lfsobraldev/sobrsistempcp/pull/new/erp-master-b23-unidades-meses
- Novas entradas `/pcp/{sul,nordeste,consolidado}`, `/apontamento/{sul,nordeste,consolidado}` e `/estoque/{sul,nordeste,consolidado}` reaproveitam telas e autorização. Consolidado ainda é o resumo geral de gestão existente, sem nova tabela detalhada por módulo; esta parte do Bloco 2 permanece pendente.
- URL de consulta com unidade diferente da selecionada é recusada no servidor. Troca de unidade descarta a query antiga para não reaproveitar IDs/filtros da outra fonte.
- Migração 08 somente gerada: competências ATIVO/PLANEJADO/ENCERRADO, vínculo empresa/filial, ativo único por filial, ativação/encerramento auditados e lotes protegidos em mês encerrado. Lotes futuros nascem planejados. Schema e dados reais não foram consultados nem alterados.
- Flag nova `ERP_PROGRAMACAO_STATUS=enabled`, desligada por padrão; ativar somente depois de o administrador aplicar a 08 em cada banco operacional. Sem flag, o fluxo mensal anterior continua. Flag ligada sem schema mostra Módulo aguardando migração.
- Programação mensal: filtro por pedidos, separação explícita de status em lista/cartões/gráfico/exportação, ações de ativar/encerrar, filtros salvos com estado e pedidos. Assistente de importação e reversão existentes preservados; navegação de assistente em passos e URL unificada da tela mensal ainda pendentes.
- Validação do grupo: 135 testes locais passaram; TypeScript e build aprovados. Envio pelo conector GitHub porque o terminal não tem credenciais de push.
- O primeiro envio de B1 acionou um preview automático (`dpl_FYK5rdbEC6CbK56CQT2VbRicMz5C`), cancelado antes da conclusão. `vercel.json` agora bloqueia auto-deploy das duas branches. Nenhum deploy de produção neste trabalho.
- Próximos incrementos: terminar adoção do recorte nas demais telas do Bloco 1; consolidado detalhado e assistente/URL mensal do grupo 2/3; depois engenharia/roteiros/OF e consumo por operação (Blocos 4–6) em nova branch. Não anunciar esses blocos concluídos.


## Etapa A — fechamento das visões existentes

Branch `erp-etapa-a-fechamento`, baseada em `erp-master-b23-unidades-meses`; um commit da etapa. Recorte compartilhado nos leitores industriais e consultas auxiliares, estoque paginado, consolidados detalhados (PCP/operações/programação/estoque), assistente mensal em três passos e parâmetros canônicos na URL. Histórico e programação ativa passam a arquivamento auditado com migração 09; sem schema, aguardando migração. Cadastros/metas sem relação com pedido não recebem rateio inventado. Nenhum módulo empresarial novo.

Migração nova: `2026-10-22_09_historico_seguro.sql`, após 08 no catálogo, somente gerada. Validação local: 137 testes passaram, TypeScript e build aprovados. Testes SQL executados somente em PGlite isolado. Não houve consulta/migração no banco real.

PR a abrir após envio: https://github.com/lfsobraldev/sobrsistempcp/pull/new/erp-etapa-a-fechamento . Sem merge/deploy; auto-deploy bloqueado para esta branch e para a Etapa B. Próximo passo: Etapa B em `erp-etapa-b-ciclo`, evoluindo engenharia/OF/produção/estoque existentes.
