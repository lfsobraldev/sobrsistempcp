-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists erp_mrp_gerar_of(uuid,uuid,uuid,numeric,date,uuid,text);
drop function if exists erp_mrp_liquido();
drop view if exists erp_v_ops_abertas;
drop table if exists erp_of_agenda;
COMMIT;
