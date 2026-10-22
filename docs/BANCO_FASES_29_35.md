# Banco de dados — migrações 29 a 35 (Fases 1–6 do ERP)

Nada foi executado em banco remoto. **Faça backup no Neon antes.** Aplique uma unidade por vez (Sul, depois Nordeste), na pasta `docs/banco/colar/`, depois das migrações 25–28:

| Arquivo | Onde aplicar |
| --- | --- |
| `7_migracao_29_CENTRAL_cargos_identidade.sql` | **Somente no banco central de identidade** (usuários) |
| `8_migracao_30_seguranca_aprovacoes_auditoria.sql` | Sul e Nordeste |
| `9_migracao_31_embalagem_mrp_horizonte.sql` | Sul e Nordeste |
| `10_migracao_32_compras_qualidade_comercial.sql` | Sul e Nordeste |
| `11_migracao_33_financeiro_fechamento_rateio_margem.sql` | Sul e Nordeste |
| `12_migracao_34_plataforma_eventos_campos_notificacoes.sql` | Sul e Nordeste |
| `13_migracao_35_pessoas_ehs_projetos.sql` | Sul e Nordeste |
| `4_verificar_tudo.sql` | Conferência: todas as linhas `ok = true` |

Todas são idempotentes e têm `-- migrate:down` (reverter apaga os dados do módulo; faça backup).

## Fase 1 — Fundação (29, 30)
- **29:** cargos Supervisor, Diretor e Administrador aceitos no cadastro de usuários e perfis.
- **30:** matriz de permissões e alçadas por cargo (`erp_autorizacoes`, `erp_pode()`), regras e fluxo de aprovação em níveis (`erp_aprovacao_solicitar/decidir/cancelar`, separação de funções, delegação), auditoria imutável (`erp_auditoria` + gatilho `erp_auditar`), configurações (`erp_config`, nome da empresa **Famossul**).

## Fase 2 — Núcleo industrial (31)
Plano de embalagem (`emb_planos/pallets/itens`; conferência item a item; pallet só fecha sem divergência; bloqueio com revisão aberta) e MRP líquido por período (`erp_mrp_liquido_periodo`) para mês atual, próximo mês, 30 e 60 dias. Plano de corte e sobras usam a tela e `wms_sobras`.

## Fase 3 — Comercial, Compras e Qualidade (32)
Cotação comparativa (`cmp_v_cotacao_comparativa`, `cmp_cotacao_escolher` exige 2 propostas e justificativa se não for o menor preço); avaliação de fornecedores (`cmp_v_fornecedor_score`: entrega no prazo, NCs, nota manual → classe A/B/C); CAPA com eficácia (`qld_eficacia_definir_prazo/verificar`, `qld_encerrar_nc` passa a exigir eficácia quando há prazo); `vnd_v_pedido_revisoes` e `vnd_v_funil` (orçamento→pedido→revisão).

## Fase 4 — Financeiro e controladoria (33)
Fechamento de período (`fin_periodo_fechar/reabrir`; bloqueia lançamentos contábeis e baixas; exige períodos anteriores fechados, sem pendência e balanceado), rateio entre centros de custo, margem por pedido/cliente, sugestões de conciliação (`fin_conciliar_sugestoes`) e prontidão para NF-e em homologação (`fis_prontidao`).

## Fase 5 — Plataforma (34)
API v1 com escopos `pedidos`, `ordens`, `estoque`, `qualidade`; eventos `ordem.concluida`, `nc.aberta`, `aprovacao.decidida`, `periodo.fechado` (registro em `erp_eventos` + fila de webhooks); campos customizados por entidade; central de notificações por usuário/cargo com leitura individual; painel por função (`erp_painel_funcao`).

## Fase 6 — Pessoas e projetos (35)
Banco de horas (`rh_v_banco_horas`, `rh_banco_lancar`), férias por período aquisitivo (frações, saldo, sobreposição), custo de hora-homem (`rh_custo_hora`, encargos em `erp_config`) apropriado em projetos (`ps_apontar_horas`), inspeções EHS que geram ocorrência, CAT obrigatória para acidente grave com colaborador, dependências de tarefas com bloqueio de ciclo, reprogramação em cascata e caminho crítico.

## Telas novas
`/seguranca`, `/embalagem`, `/plano-corte`, `/cotacoes`, `/controladoria`, `/plataforma`, `/pessoas` (menus e permissões já registrados).
