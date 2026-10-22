-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop trigger if exists crm_comissoes_imutavel_t on crm_comissoes;
drop function if exists crm_comissoes_imutavel();
drop table if exists crm_comissoes;
drop table if exists crm_comissao_regras;
drop table if exists crm_pedido_venda_historico;
drop table if exists crm_pedido_venda_itens;
drop table if exists crm_pedidos_venda;
alter table crm_clientes drop column if exists condicao_pagamento;
alter table crm_clientes drop column if exists limite_credito;
COMMIT;
