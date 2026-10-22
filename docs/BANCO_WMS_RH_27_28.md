# Banco de dados — migrações 27 e 28 (WMS, revisões, RH, EHS, Projetos)

Nada foi executado em banco remoto. Backup no Neon antes; aplicar **uma unidade por vez** (Sul, depois Nordeste), na pasta `docs/banco/colar/`, **depois** de 1 a 3:

5. `5_migracao_27_wms_revisoes_sobras.sql`
6. `6_migracao_28_rh_ehs_projetos.sql`
4. `4_verificar_tudo.sql` — todas as linhas devem vir `ok = true`.

## O que a 27 cria
| Tema | Objetos |
| --- | --- |
| Setores do armazém | `wms_setores` (RECEBIMENTO, ESTOQUE, PRODUCAO, EMBALAGEM, EXPEDICAO, REVISAO, SOBRAS, QUARENTENA — semeados); `est_enderecos` ganha setor, rua, módulo, nível, tipo de posição, capacidade em pallets e bloqueio |
| Localização de pallets | `wms_pallet_posicoes`, `wms_pallet_movs`, `wms_pallet_alocar()`, `wms_pallet_retirar()`, `wms_sugerir_endereco()`; pallet bloqueado só vai para Quarentena/Revisão; pedido com revisão aberta não entra em Embalagem/Expedição |
| Revisão de pedido | `pcp_pedido_revisoes`, `pcp_pedido_revisao_itens` (ACRESCENTA / SUBTRAI / ALTERA), `wms_revisao_abrir/avancar/destino/aplicar()`; nada que sai some sem destino (cancelar OF, sobra com endereço ou refugo); aplicar invalida etiquetas de revisão antiga |
| Sobras | `wms_sobras`, `wms_sobra_reservar()`, `wms_sobra_baixar()`; sugestão automática por medida + material + acabamento (+ mão) |
| Separação | `wms_picking_listas/itens`, `wms_picking_criar()` (ordem pela posição no armazém; bloqueia pedido em revisão), `wms_picking_conferir()` (leitura do código do pallet) |
| Recebimento | `wms_recebimentos/itens`, `wms_recebimento_fechar()` (CONFERIDO ou DIVERGENTE) |
| Etiquetas | `wms_etiquetas` (log de impressão com revisão e validade) |
| Indicadores | `wms_v_revisoes_paradas`, `wms_v_mapa`, `wms_indicadores()` |

## O que a 28 cria
- **RH:** `rh_cargos` (nível 1–9), `rh_colaboradores`, `rh_ausencias`, `rh_ponto`, `rh_folha`, `rh_folha_gerar()` / `rh_folha_fechar()`. Folha **gerencial** (salário − faltas/30 + horas extras a 50%); não substitui eSocial, INSS e IRRF.
- **EHS:** `ehs_ocorrencias`, `ehs_epis`, `ehs_epi_entregas`, `ehs_treinamentos`, `ehs_treinamento_registros`, `ehs_registrar_treinamento()`, `ehs_v_vencimentos`, `ehs_indicadores()` (dias sem acidente etc.).
- **Projetos:** `ps_projetos`, `ps_tarefas` (WBS), `ps_custos`, `ps_resumo()` (orçamento × realizado, % físico, atraso).

Tesouraria (TR) já existe no Financeiro (contas bancárias, conciliação, fluxo de caixa).

## Reversão
Os dois arquivos têm `-- migrate:down`. Reverter apaga os dados de WMS/revisões/sobras e de RH/EHS/Projetos; fazer backup antes.
