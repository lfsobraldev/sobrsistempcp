-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists erp_mrp_liquido_periodo(date,date);
drop view if exists emb_v_resumo;
drop function if exists emb_plano_cancelar(uuid,text);
drop function if exists emb_pallet_fechar(uuid,integer,text);
drop function if exists emb_codigo_pallet(text,integer);
drop function if exists emb_conferir(uuid,integer,integer,numeric,text,text);
drop function if exists emb_plano_criar(text,text,jsonb,text);
drop table if exists emb_itens;
drop table if exists emb_pallets;
drop table if exists emb_planos;
COMMIT;
