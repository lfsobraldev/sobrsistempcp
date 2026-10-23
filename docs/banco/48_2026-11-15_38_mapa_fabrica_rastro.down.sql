-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop view if exists pcp_v_rastro_paradas;
drop view if exists pcp_v_rastro_setor_datas;
drop view if exists pcp_v_rastro_atual;
drop function if exists pcp_rastro_ler(text,text,text,text,numeric,text,text);
drop trigger if exists pcp_rastro_imutavel_t on pcp_rastro_leituras;
drop function if exists pcp_rastro_imutavel();
drop table if exists pcp_rastro_leituras;
drop view if exists wms_v_sem_endereco;
drop view if exists wms_v_localizador_end;
drop view if exists wms_v_localizador;
COMMIT;
