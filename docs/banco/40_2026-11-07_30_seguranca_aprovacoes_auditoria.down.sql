-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $$ declare t text;begin
 foreach t in array array['crm_pedidos_venda','cmp_pedidos','fin_titulos','exp_remessas','est_inventarios','pcp_pedido_revisoes','wms_sobras','wms_picking_listas','wms_recebimentos','erp_aprovacoes','erp_autorizacoes','erp_aprovacao_regras','rh_colaboradores','ehs_ocorrencias','ps_projetos'] loop
  if to_regclass('public.'||t) is not null then execute format('drop trigger if exists tr_erp_auditar on %I',t);end if;
 end loop;
end $$;
drop table if exists erp_config;
drop function if exists erp_auditar();
drop trigger if exists tr_erp_auditoria_imutavel on erp_auditoria;
drop table if exists erp_auditoria;
drop function if exists erp_auditoria_imutavel();
drop view if exists erp_v_aprovacoes_pendentes;
drop function if exists erp_aprovacao_cancelar(uuid,text);
drop function if exists erp_aprovacao_decidir(uuid,text,text,text,text);
drop function if exists erp_aprovacao_solicitar(text,text,text,text,numeric,text,text);
drop table if exists erp_delegacoes;
drop table if exists erp_aprovacao_etapas;
drop table if exists erp_aprovacoes;
drop table if exists erp_aprovacao_regras;
drop function if exists erp_pode(text,text,text,numeric);
drop function if exists erp_cargo_nivel(text);
drop table if exists erp_autorizacoes;
drop table if exists erp_cargos_nivel;
COMMIT;
