-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists qld_ppm(int);
drop function if exists qld_encerrar_nc(uuid,text);
drop function if exists qld_decidir(uuid,text,text,text);
drop function if exists qld_medir(uuid,int,numeric,uuid,text);
drop function if exists qld_abrir_lote(uuid,numeric,text,text,uuid,uuid,text);
drop table if exists qld_acoes;
drop table if exists qld_nao_conformidades;
drop trigger if exists qld_medicao_imutavel_t on qld_medicoes;
drop table if exists qld_medicoes;
drop function if exists qld_medicao_imutavel();
drop table if exists qld_lotes_inspecao;
drop table if exists qld_plano_caracteristicas;
drop table if exists qld_planos;
drop table if exists qld_instrumentos;
COMMIT;
