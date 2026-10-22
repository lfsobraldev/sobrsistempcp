-- GERADO do arquivo canônico 2026-10-16_local_montagem.sql; SHA256 d52071480a97c6ceecf4c7eaeb717ab6054270b455e6b22a2e16b092a2a29260
-- Destino: operacional (Sul/Nordeste). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-16_local_montagem.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-16_local_montagem.sql' and checksum<>'d52071480a97c6ceecf4c7eaeb717ab6054270b455e6b22a2e16b092a2a29260') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Local de Montagem por pedido (preenchimento manual; vazio quando não informado)
create table if not exists pcp_pedido_local (
  pedido varchar(60) primary key,
  local_montagem varchar(60) not null default '',
  atualizado_por varchar(80),
  atualizado_em timestamptz not null default now()
);
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-16_local_montagem.sql','d52071480a97c6ceecf4c7eaeb717ab6054270b455e6b22a2e16b092a2a29260',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-16_local_montagem.sql','d52071480a97c6ceecf4c7eaeb717ab6054270b455e6b22a2e16b092a2a29260','APLICAR',current_user,'APLICADA');
COMMIT;
