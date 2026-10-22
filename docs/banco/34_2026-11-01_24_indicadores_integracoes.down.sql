-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop trigger if exists sys_trg_evento_remessa_t on exp_remessas;
drop trigger if exists sys_trg_evento_pedido_t on crm_pedidos_venda;
drop function if exists sys_trg_evento_remessa();
drop function if exists sys_trg_evento_pedido();
drop function if exists ind_painel(date,date);
drop function if exists sys_gerar_alertas(date);
drop function if exists sys_emitir_evento(text,jsonb);
drop function if exists sys_alertas_candidatos(date);
drop table if exists sys_webhook_fila;
drop table if exists sys_webhooks;
drop table if exists sys_tokens_api;
drop table if exists sys_alertas;
COMMIT;
