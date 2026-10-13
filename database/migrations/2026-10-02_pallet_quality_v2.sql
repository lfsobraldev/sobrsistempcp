create extension if not exists pgcrypto;
create table if not exists pcp_pallet_nao_conformidades(
 id uuid primary key default gen_random_uuid(), pallet_id uuid not null references pcp_pallets(id) on delete cascade, codigo varchar(60) not null unique,
 categoria varchar(80) not null default 'OUTROS', tipo_defeito varchar(180) not null, gravidade varchar(20) not null default 'MAIOR', quantidade_afetada numeric(16,3) not null default 0,
 local_defeito varchar(300) not null default '', descricao text not null default '', contencao text not null default '', acao_corretiva text not null default '', responsavel varchar(160) not null default '', prazo timestamptz,
 status varchar(40) not null default 'ABERTA', correcao_executada text not null default '', corrigido_por varchar(160) not null default '', corrigido_em timestamptz,
 reinspecao_resultado varchar(30) not null default '', reinspecao_usuario varchar(160) not null default '', reinspecao_em timestamptz, reinspecao_observacao text not null default '',
 criado_por varchar(160) not null default '', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table if not exists pcp_pallet_medicoes(
 id uuid primary key default gen_random_uuid(), pallet_id uuid not null references pcp_pallets(id) on delete cascade, caracteristica varchar(180) not null, nominal numeric(16,3), tolerancia_min numeric(16,3), tolerancia_max numeric(16,3), medido numeric(16,3) not null, unidade varchar(30) not null default 'mm', resultado varchar(30) not null default 'REGISTRADO', observacao text not null default '', usuario varchar(160) not null default '', criado_em timestamptz not null default now());
alter table pcp_pallet_fotos add column if not exists nc_id uuid;
alter table pcp_pallet_fotos add column if not exists tipo varchar(20) not null default 'GERAL';
do $$ begin if not exists(select 1 from pg_constraint where conname='fk_pcp_pallet_fotos_nc') then alter table pcp_pallet_fotos add constraint fk_pcp_pallet_fotos_nc foreign key(nc_id) references pcp_pallet_nao_conformidades(id) on delete set null; end if; end $$;
create index if not exists ix_pcp_pallet_nc_pallet on pcp_pallet_nao_conformidades(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_nc_status on pcp_pallet_nao_conformidades(status,prazo);
create index if not exists ix_pcp_pallet_medicoes_pallet on pcp_pallet_medicoes(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_fotos_nc on pcp_pallet_fotos(nc_id,tipo,criado_em desc);
