-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists exp_devolver(uuid,uuid,numeric,text,text,uuid,text);
drop function if exists exp_entregar(uuid,text,text);
drop function if exists exp_fechar_remessa(uuid,text);
drop function if exists exp_ler_pallet(uuid,text,text);
drop function if exists exp_reservar(uuid,uuid,uuid,numeric,text);
drop function if exists exp_custo_medio(uuid,uuid);
drop function if exists exp_atp(uuid,numeric,date);
drop table if exists exp_portal_tokens;
drop table if exists exp_eventos_faturamento;
drop table if exists exp_devolucoes;
drop table if exists exp_ocorrencias;
drop table if exists exp_remessa_pallets;
drop table if exists exp_remessa_itens;
drop table if exists exp_remessas;
drop table if exists exp_transportadoras;
COMMIT;
