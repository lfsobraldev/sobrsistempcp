-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists cert_estornar(bigint,text,text);
drop function if exists cert_consumir(text,text,numeric,text,text,text);
drop function if exists cert_vincular(text,uuid,text);
drop view if exists cert_v_saldo_produto;
drop view if exists cert_v_saldo_item;
drop trigger if exists cert_consumo_imutavel_t on cert_consumos;
drop function if exists cert_consumo_imutavel();
drop table if exists cert_consumos;
drop table if exists cert_pedido_nfs;
drop table if exists cert_nf_itens;
drop table if exists cert_nfs;
COMMIT;
