-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists erp_rastreio_lote(uuid);
drop function if exists erp_rastreio_of(uuid);
drop function if exists erp_onde_usado(uuid);
drop function if exists erp_disponibilidade_estrutura(uuid,numeric,uuid);
drop function if exists erp_necessidade_pedido(uuid);
drop view if exists erp_v_of_comercial;
drop function if exists erp_norm_codigo(text);
drop function if exists erp_norm_pedido(text);
COMMIT;
