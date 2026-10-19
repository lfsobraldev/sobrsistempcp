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
