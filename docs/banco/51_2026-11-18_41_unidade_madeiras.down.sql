-- ATENÇÃO: revisar fonte, dependentes e backup antes de qualquer reversão.
-- Down conservador pode não desfazer estrutura. Não tratar como recuperação de dados.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $$
declare r record;
begin
 for r in
  select c.conrelid::regclass::text tabela, c.conname, pg_get_constraintdef(c.oid) def
    from pg_constraint c
   where c.contype='c' and pg_get_constraintdef(c.oid) ilike '%''MADEIRAS''%'
     and c.conrelid::regclass::text in('erp_identidade_banco','pcp_lider_unidade_etapas')
 loop
  execute format('alter table %s drop constraint %I',r.tabela,r.conname);
  execute format('alter table %s add constraint %I %s',r.tabela,r.conname,regexp_replace(regexp_replace(r.def,', \(''MADEIRAS''::[a-z ]+\)::[a-z]+',''),', ''MADEIRAS''::[a-z ]+',''));
 end loop;
 if to_regclass('pcp_filiais') is not null then delete from pcp_filiais where codigo='MADEIRAS' and not exists(select 1 from pcp_usuario_filiais uf where uf.filial_id=pcp_filiais.id); end if;
end $$;
COMMIT;
