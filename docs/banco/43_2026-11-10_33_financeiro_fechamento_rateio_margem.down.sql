-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists fis_prontidao();
drop function if exists fin_conciliar_sugestoes(uuid,int);
drop view if exists fin_v_margem_cliente;
drop view if exists fin_v_margem_pedido_calc;
drop view if exists fin_v_margem_pedido;
drop function if exists fin_rateio_apurar(text,text);
drop function if exists fin_rateio_salvar(uuid,jsonb,text);
drop table if exists fin_rateio_apuracoes;
drop table if exists fin_rateio_regras;
drop trigger if exists fin_periodo_baixa_t on fin_baixas;
drop trigger if exists fin_periodo_ctb_t on ctb_lancamentos;
drop function if exists fin_trg_periodo_baixa();
drop function if exists fin_trg_periodo_ctb();
drop function if exists fin_periodo_reabrir(text,text,text);
drop function if exists fin_periodo_fechar(text,text,text);
drop function if exists fin_periodo_fechado(text);
drop table if exists fin_periodo_historico;
drop table if exists fin_periodos;
COMMIT;
