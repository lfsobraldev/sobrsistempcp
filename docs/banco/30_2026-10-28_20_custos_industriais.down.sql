-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop view if exists cst_v_margem_pedidos;
drop view if exists cst_v_valorizacao;
drop function if exists cst_of_registrar(uuid,text);
drop function if exists cst_of_analise(uuid);
drop function if exists cst_calcular_padrao(uuid,date,numeric,text);
drop function if exists cst_calc(uuid,date,int,numeric);
drop function if exists cst_taxa(uuid,date);
drop function if exists cst_preco(uuid,date);
drop table if exists cst_of_resultados;
drop table if exists cst_horas_of;
drop trigger if exists cst_padrao_imutavel_t on cst_padrao;
drop table if exists cst_padrao;
drop function if exists cst_padrao_imutavel();
drop table if exists cst_precos_padrao;
drop table if exists cst_taxas;
COMMIT;
