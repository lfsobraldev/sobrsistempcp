-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop view if exists est_v_apontamentos_em_lote;
drop view if exists est_v_consumo_conferir;
drop function if exists est_consumo_ajustar(uuid,text);
drop function if exists est_consumo_conferir(uuid,uuid,uuid,numeric,text,text);
drop table if exists est_consumo_conferencias;
drop view if exists est_v_consumo_of;
drop view if exists est_v_saldo_natureza;
drop function if exists est_local_classificar(uuid,text,text,text,text);
alter table est_locais drop column if exists responsavel;
alter table est_locais drop column if exists tipo_local;
alter table est_locais drop column if exists natureza;
drop table if exists est_naturezas;
COMMIT;
