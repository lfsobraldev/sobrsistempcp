-- GERADO do arquivo canônico 2026-10-12_ia.sql; SHA256 38c3375aee822de309d3ca73c2041d262cd02d65ba299c43101058820fb1a949
-- Destino: operacional (Sul/Nordeste). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-12_ia.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-12_ia.sql' and checksum<>'38c3375aee822de309d3ca73c2041d262cd02d65ba299c43101058820fb1a949') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists pcp_ia_log(
  id bigserial primary key,
  usuario varchar(120) not null,
  pergunta text not null default '',
  resposta text not null default '',
  anexos text[] not null default '{}',
  criado_em timestamptz not null default now()
);
create table if not exists pcp_romaneios_hist(
  id uuid primary key default gen_random_uuid(),
  pedido varchar(80) not null default '',
  cliente varchar(240) not null default '',
  transportadora varchar(160) not null default '',
  rota varchar(160) not null default '',
  total_itens int not null default 0,
  dados jsonb not null default '{}'::jsonb,
  origem varchar(20) not null default 'IA',
  criado_por varchar(120) not null default '',
  criado_em timestamptz not null default now()
);
create index if not exists ix_romaneios_hist_pedido on pcp_romaneios_hist(pedido);
create index if not exists ix_romaneios_hist_cliente on pcp_romaneios_hist(cliente, criado_em desc);
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-12_ia.sql','38c3375aee822de309d3ca73c2041d262cd02d65ba299c43101058820fb1a949',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-12_ia.sql','38c3375aee822de309d3ca73c2041d262cd02d65ba299c43101058820fb1a949','APLICAR',current_user,'APLICADA');
COMMIT;
