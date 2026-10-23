-- depends-on: 2026-11-17_40_perdas_pecas_reposicao.sql
-- scope: operational
-- migrate:up
-- Terceira unidade: MADEIRAS (ciclo da madeira/árvore). Amplia as listas de unidades e cadastra a filial.
do $$
declare r record;
begin
 for r in
  select c.conrelid::regclass::text tabela, c.conname, pg_get_constraintdef(c.oid) def
    from pg_constraint c
   where c.contype='c' and pg_get_constraintdef(c.oid) ilike '%''SUL''%' and pg_get_constraintdef(c.oid) ilike '%''NORDESTE''%' and pg_get_constraintdef(c.oid) not ilike '%''MADEIRAS''%'
     and c.conrelid::regclass::text in('erp_identidade_banco','pcp_lider_unidade_etapas')
 loop
  execute format('alter table %s drop constraint %I',r.tabela,r.conname);
  execute format('alter table %s add constraint %I %s',r.tabela,r.conname,
    regexp_replace(r.def,'''NORDESTE''(::[a-z ]+)','''NORDESTE''\1, ''MADEIRAS''\1'));
 end loop;
end $$;

do $$
begin
 if to_regclass('pcp_filiais') is not null and to_regclass('pcp_empresas') is not null then
  insert into pcp_filiais(empresa_id,codigo,nome)
   select e.id,'MADEIRAS','Madeiras' from pcp_empresas e where e.codigo='PCP_LEGADO'
   on conflict(empresa_id,codigo) do nothing;
 end if;
end $$;

-- migrate:down
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
