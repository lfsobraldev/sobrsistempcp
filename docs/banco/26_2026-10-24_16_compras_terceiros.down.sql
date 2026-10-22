-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists cmp_sugestao_compra();
drop function if exists cmp_curva_abc_xyz(integer);
drop function if exists cmp_terceiro_mov(text,uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,text);
drop function if exists cmp_receber(uuid,text,text,uuid,jsonb,text);
drop function if exists cmp_mov_estoque(text,uuid,uuid,numeric,text,text,numeric,text);
drop view if exists cmp_saldo_terceiros;
drop table if exists cmp_terceiros_movs;
drop table if exists cmp_recebimento_itens;
drop table if exists cmp_recebimentos;
drop table if exists cmp_pedido_itens;
drop table if exists cmp_pedidos;
drop table if exists cmp_cotacao_propostas;
drop table if exists cmp_solicitacao_itens;
drop table if exists cmp_solicitacoes;
drop table if exists cmp_alcadas;
drop table if exists cmp_fornecedores;
alter table est_produtos drop column if exists lote_compra;
alter table est_produtos drop column if exists lead_time_dias;
alter table est_produtos drop column if exists estoque_seguranca;
COMMIT;
