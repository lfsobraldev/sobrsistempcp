-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop view if exists pcp_v_perdas_pecas;
drop function if exists pcp_perda_fechar(bigint,text,text);
drop function if exists pcp_perda_decidir(bigint,text,text,date,text,text);
drop function if exists pcp_perda_abrir(text,text,text,text,numeric,text,text,text,text);
drop trigger if exists pcp_perdas_ev_imutavel_t on pcp_perdas_pecas_eventos;
drop function if exists pcp_perdas_ev_imutavel();
drop table if exists pcp_perdas_pecas_eventos;
drop table if exists pcp_perdas_pecas;
drop table if exists pcp_familia_responsaveis;
drop table if exists pcp_perda_motivos;
COMMIT;
