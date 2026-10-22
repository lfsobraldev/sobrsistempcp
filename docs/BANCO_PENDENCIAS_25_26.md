# Banco de dados — migrações 25 e 26 (pendências)

Nada foi executado em banco remoto. Fazer o backup (branch/snapshot) no Neon antes e aplicar **uma unidade por vez** (Sul, depois Nordeste), na pasta `docs/banco/colar/`:

1. `1_registro_de_migracoes_SE_AINDA_NAO_EXISTIR.sql` — só se a unidade ainda não tem `schema_migrations`.
2. `2_migracao_25_producao_estoque_financeiro.sql`
3. `3_migracao_26_sac_qualidade_oee.sql`
4. `4_verificar_tudo.sql` — todas as linhas devem vir `ok = true`.

Pré-requisito: migrações 14 a 24 já aplicadas (PR #66, em main).

## O que a 25 cria
| Tema | Objetos |
| --- | --- |
| Substitutos de componente | `erp_substitutos`, `erp_of_substituicoes`, `erp_substitutos_disponibilidade()`; `erp_ciclo_processar()` passa a aceitar `consumos[].substitutoId` |
| OF do pedido com um clique | `crm_pedido_venda_of`, `erp_gerar_ofs_pedido()` |
| Custo de retrabalho/refugo | `cst_retrabalho`, `cst_registrar_retrabalho()`, `cst_of_analise_ext()` |
| Endereçamento | `est_enderecos`, `est_endereco_saldos`, `est_endereco_movs`, `est_endereco_mover()`, view `est_v_pendente_enderecar` |
| Inventário cíclico | `est_ciclico_regras` (A 30 d, B 90 d, C 180 d), `est_ciclico_contagens`, funções `est_ciclico_*` |
| PEPS | `est_peps_camadas()`, `est_peps_resumo()` |
| Portal do fornecedor | `cmp_portal_tokens`, `cmp_confirmacoes`, `cmp_confirmar_entrega()` |
| Juros, multa e desconto | `fin_ajustes`, origem `ENCARGO` em `fin_titulos`, contas 3.2.01/3.2.02/5.2.01/5.2.02 e regras de lançamento (só entram se o plano de contas já foi semeado; a baixa completa reaplica), `fin_encargos_sugeridos()`, `fin_desconto()`, `fin_baixar_completo()` |

Dados semeados: apenas as 3 frequências do cíclico. O restante nasce vazio.

## O que a 26 cria
`sac_anexos` (fotos/PDF até 3 MB, 10 por atendimento), `sac_indice_reclamacao()`, `qld_medir_lote()` (importação tudo-ou-nada) e `ind_painel()` com OEE completo (desempenho vem das horas reais em `cst_horas_of`; sem horas informadas o painel continua mostrando o OEE parcial).

## Reversão
Cada arquivo canônico em `database/migrations/` tem `-- migrate:down`; os roteiros de down/baseline estão em `docs/banco/35_*` e `36_*`. Reverter a 25 apaga os dados de substitutos, endereços, contagens cíclicas e ajustes; fazer backup antes.

## Rotina agendada
`/api/cron/rotinas` gera os alertas e entrega a fila de webhooks de cada unidade. Precisa da variável `CRON_SECRET` (mínimo 16 caracteres) na Vercel; sem ela a rotina responde 401. O `vercel.json` agenda 1x ao dia (06:00 em Brasília) para funcionar em qualquer plano; em plano Pro pode ser `*/15 * * * *`.
