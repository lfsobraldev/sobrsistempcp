-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists ps_resumo();
drop table if exists ps_custos;
drop table if exists ps_tarefas;
drop table if exists ps_projetos;
drop function if exists ehs_indicadores();
drop view if exists ehs_v_vencimentos;
drop function if exists ehs_registrar_treinamento(uuid,uuid,date,text);
drop table if exists ehs_treinamento_registros;
drop table if exists ehs_treinamentos;
drop table if exists ehs_epi_entregas;
drop table if exists ehs_epis;
drop table if exists ehs_ocorrencias;
drop function if exists rh_folha_fechar(text,text);
drop function if exists rh_folha_gerar(text,text);
drop table if exists rh_folha;
drop table if exists rh_ponto;
drop table if exists rh_ausencias;
drop table if exists rh_colaboradores;
drop table if exists rh_cargos;
COMMIT;
