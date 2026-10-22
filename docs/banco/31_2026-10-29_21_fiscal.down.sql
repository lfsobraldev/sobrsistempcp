-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
drop function if exists fis_apurar(text);
drop function if exists fis_mudar_status(uuid,text,text,text,text,text,uuid,text);
drop function if exists fis_montar_nfe(uuid,date,text);
drop function if exists fis_calcular_item(uuid,numeric,date);
drop function if exists fis_regra(text,text,text,text,text,date);
drop function if exists fis_param(text,date);
drop table if exists fis_creditos;
drop table if exists fis_documentos;
drop table if exists fis_provedores;
drop table if exists fis_regras;
drop table if exists fis_parametros;
drop table if exists fis_produto_fiscal;
drop table if exists fis_cfop;
drop table if exists fis_emitente;
alter table crm_clientes drop column if exists contribuinte_icms;
alter table crm_clientes drop column if exists regime_tributario;
alter table crm_clientes drop column if exists ie;
alter table crm_clientes drop column if exists uf;
COMMIT;
