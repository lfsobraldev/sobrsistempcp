-- GERADO do arquivo canônico 2026-10-19_sac_industrial.sql; SHA256 25b5a71db88394de48f8aef2ce9ecd87257823a10811dee53629a6699e66332d
-- Destino: operacional (Sul/Nordeste). Dependências: schema-base/pré-requisitos legados.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-19_sac_industrial.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-19_sac_industrial.sql' and checksum<>'25b5a71db88394de48f8aef2ce9ecd87257823a10811dee53629a6699e66332d') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- SAC industrial: schema aditivo e idempotente. Preserva dados operacionais existentes.
create extension if not exists pgcrypto;
do $$
begin
  if exists (select 1 from pg_constraint where conname='ck_pcp_usuarios_perfil') then
    alter table pcp_usuarios drop constraint ck_pcp_usuarios_perfil;
  end if;
  alter table pcp_usuarios add constraint ck_pcp_usuarios_perfil
    check (perfil in ('PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE','COMERCIAL','LOGISTICA','LIDER_ENTREGAS','SAC'));
exception when duplicate_object then null;
end $$;
create table if not exists pcp_sac_atendimentos (
 id uuid primary key default gen_random_uuid(), protocolo bigint generated always as identity unique,
 cliente varchar(240) not null, pedido varchar(80) not null default '', of_referencia varchar(80) not null default '',
 tipo varchar(60) not null default 'DUVIDA', assunto varchar(240) not null, descricao text not null,
 solicitante varchar(160) not null, responsavel varchar(160) not null default '',
 prioridade varchar(20) not null default 'NORMAL', status varchar(30) not null default 'ABERTO',
 prazo date, medicao text not null default '', observacoes text not null default '',
 criado_por varchar(160) not null, atualizado_por varchar(160) not null,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), concluido_em timestamptz,
 constraint ck_pcp_sac_status check (status in ('ABERTO','EM_ANALISE','AGUARDANDO_CLIENTE','AGUARDANDO_FABRICA','AGENDADO','CONCLUIDO','CANCELADO')),
 constraint ck_pcp_sac_prioridade check (prioridade in ('BAIXA','NORMAL','ALTA','URGENTE'))
);
create table if not exists pcp_sac_eventos (
 id bigserial primary key, atendimento_id uuid not null references pcp_sac_atendimentos(id) on delete cascade,
 usuario varchar(160) not null, tipo varchar(60) not null, descricao text not null default '',
 antes jsonb, depois jsonb, criado_em timestamptz not null default now()
);
create index if not exists ix_pcp_sac_status_prazo on pcp_sac_atendimentos(status,prazo);
create index if not exists ix_pcp_sac_cliente on pcp_sac_atendimentos(cliente);
create index if not exists ix_pcp_sac_pedido on pcp_sac_atendimentos(pedido);
create index if not exists ix_pcp_sac_eventos_atendimento on pcp_sac_eventos(atendimento_id,criado_em desc);
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-19_sac_industrial.sql','25b5a71db88394de48f8aef2ce9ecd87257823a10811dee53629a6699e66332d',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-19_sac_industrial.sql','25b5a71db88394de48f8aef2ce9ecd87257823a10811dee53629a6699e66332d','APLICAR',current_user,'APLICADA');
COMMIT;
