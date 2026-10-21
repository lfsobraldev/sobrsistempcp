# Progresso do ERP

Atualizado em 2026-10-21. Branch de trabalho: `erp-completo`.

- Fase 0 — Auditoria: concluída; stack, rotas, schema, RBAC, migrations e gaps registrados no histórico da tarefa.
- Fase 1 — Fundação multiempresa/RBAC/auditoria: pendente de implementação; a auditoria confirmou que a fundação completa não existe no schema atual.
- Fase 2 — Suprimentos/Estoque: em andamento; inventário inicial concluído. Reaproveitar `est_movimentos`, `est_saldos`, `est_produtos`, `est_locais` e inventários existentes. Melhorado o bloqueio de movimentos no escopo do inventário. Nenhuma migration aplicada. Compras/fornecedores/lotes dependem da fundação multiempresa/filial da Fase 1.
- Fase 3 — PCP/Produção: pendente; preservar programação/apontamentos existentes; OF autônoma ainda ausente.
- Fase 4 — Qualidade: pendente; preservar inspeção/liberação Qualidade/MSAC e medições existentes.
- Fase 5 — Vendas/Expedição/Logística: pendente; evoluir CRM, controle de entregas, romaneios, pallets e QR existentes.
- Fase 6 — Financeiro/Fiscal/Contábil: pendente; sem motor fiscal próprio.
- Fase 7 — Manutenção/Ativos: pendente.
- Fase 8 — Camada Inteligente: parcial existente; evoluções pendentes devem continuar somente leitura para consultas e exigir confirmação humana para escritas.
- Transversal — multiempresa, anexos externos, outbox/jobs, observabilidade, OpenAPI e e2e: pendente/parcial conforme inventário.

Critério por fase: teste focado, `npm test`, `npm run build`, revisão do diff e commit com mensagem `Fase N: <nome>`. Migrações são geradas, nunca aplicadas pelo agente.

## Último incremento validado

- `lib/estoque-db.ts`: movimentos em local coberto por inventário geral ou local são recusados mesmo se o produto ainda não tiver item de contagem.
- `tests/estoque-db.test.ts`: cobre entrada em local com inventário aberto e sem item contado.
- Validação em 2026-10-21: `npm test` 114/114; `npm run build` passou. Nenhuma migration ou consulta ao banco.
- Risco aberto: serializar abertura/fechamento de inventário contra movimentos concorrentes requer desenho e teste em Neon de homologação.
