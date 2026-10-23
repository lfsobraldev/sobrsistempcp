-- GERADO do arquivo canônico 2026-11-18_41_unidade_madeiras.sql; SHA256 255e031aae62d7081808681ad16d38254a52858058e96f77e4daaebacc1db63b
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-17_40_perdas_pecas_reposicao.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-18_41_unidade_madeiras.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-18_41_unidade_madeiras.sql' and checksum<>'255e031aae62d7081808681ad16d38254a52858058e96f77e4daaebacc1db63b') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-18_41_unidade_madeiras.sql','255e031aae62d7081808681ad16d38254a52858058e96f77e4daaebacc1db63b',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-18_41_unidade_madeiras.sql','255e031aae62d7081808681ad16d38254a52858058e96f77e4daaebacc1db63b','APLICAR',current_user,'APLICADA');
COMMIT;
