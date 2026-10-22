-- Somente leitura. Todas as linhas devem mostrar ok = true.
select * from (
select 'tabela erp_substitutos' item, to_regclass('public.erp_substitutos') is not null ok
union all
select 'tabela erp_of_substituicoes' item, to_regclass('public.erp_of_substituicoes') is not null ok
union all
select 'tabela crm_pedido_venda_of' item, to_regclass('public.crm_pedido_venda_of') is not null ok
union all
select 'tabela cst_retrabalho' item, to_regclass('public.cst_retrabalho') is not null ok
union all
select 'tabela est_enderecos' item, to_regclass('public.est_enderecos') is not null ok
union all
select 'tabela est_endereco_saldos' item, to_regclass('public.est_endereco_saldos') is not null ok
union all
select 'tabela est_endereco_movs' item, to_regclass('public.est_endereco_movs') is not null ok
union all
select 'tabela est_ciclico_regras' item, to_regclass('public.est_ciclico_regras') is not null ok
union all
select 'tabela est_ciclico_contagens' item, to_regclass('public.est_ciclico_contagens') is not null ok
union all
select 'tabela cmp_portal_tokens' item, to_regclass('public.cmp_portal_tokens') is not null ok
union all
select 'tabela cmp_confirmacoes' item, to_regclass('public.cmp_confirmacoes') is not null ok
union all
select 'tabela fin_ajustes' item, to_regclass('public.fin_ajustes') is not null ok
union all
select 'tabela sac_anexos' item, to_regclass('public.sac_anexos') is not null ok
union all
select 'view est_v_pendente_enderecar', to_regclass('public.est_v_pendente_enderecar') is not null
union all
select 'funcao erp_substitutos_disponibilidade', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='erp_substitutos_disponibilidade')
union all
select 'funcao erp_ciclo_processar', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='erp_ciclo_processar')
union all
select 'funcao erp_gerar_ofs_pedido', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='erp_gerar_ofs_pedido')
union all
select 'funcao cst_registrar_retrabalho', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cst_registrar_retrabalho')
union all
select 'funcao cst_of_analise_ext', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cst_of_analise_ext')
union all
select 'funcao est_endereco_mover', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_endereco_mover')
union all
select 'funcao est_ciclico_devidos', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_ciclico_devidos')
union all
select 'funcao est_ciclico_abrir', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_ciclico_abrir')
union all
select 'funcao est_ciclico_contar', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_ciclico_contar')
union all
select 'funcao est_ciclico_ajustar', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_ciclico_ajustar')
union all
select 'funcao est_ciclico_cancelar', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_ciclico_cancelar')
union all
select 'funcao est_peps_camadas', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_peps_camadas')
union all
select 'funcao est_peps_resumo', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='est_peps_resumo')
union all
select 'funcao cmp_confirmar_entrega', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='cmp_confirmar_entrega')
union all
select 'funcao ctb_semear_encargos', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ctb_semear_encargos')
union all
select 'funcao fin_encargos_sugeridos', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fin_encargos_sugeridos')
union all
select 'funcao fin_desconto', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fin_desconto')
union all
select 'funcao fin_baixar_completo', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='fin_baixar_completo')
union all
select 'funcao sac_indice_reclamacao', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='sac_indice_reclamacao')
union all
select 'funcao qld_medir_lote', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='qld_medir_lote')
union all
select 'funcao ind_painel', exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='ind_painel')
union all
select 'origem ENCARGO aceita em fin_titulos', exists(select 1 from pg_constraint where conrelid='fin_titulos'::regclass and conname='fin_titulos_origem_chk')
union all
select 'migracao 25 registrada', exists(select 1 from schema_migrations where name='2026-11-02_25_pendencias_producao_estoque_financeiro.sql' and status='APLICADA')
union all
select 'migracao 26 registrada', exists(select 1 from schema_migrations where name='2026-11-03_26_sac_qualidade_oee.sql' and status='APLICADA')
) x order by ok, item;
