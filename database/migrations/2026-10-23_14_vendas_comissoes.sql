-- depends-on: 2026-10-22_12_identidades_operacionais.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

alter table crm_clientes add column if not exists limite_credito numeric(16,2) not null default 0 check(limite_credito>=0);
alter table crm_clientes add column if not exists condicao_pagamento varchar(120) not null default '';

create table if not exists crm_pedidos_venda (
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 cliente_id uuid not null references crm_clientes(id) on delete restrict,
 representante_id uuid references crm_representantes(id) on delete restrict,
 pedido_cliente varchar(80) not null default '',
 pedido_pcp varchar(40) not null default '',
 proposta_id uuid references crm_propostas(id) on delete set null,
 condicao_pagamento varchar(120) not null default '',
 status varchar(20) not null default 'RASCUNHO' check(status in ('RASCUNHO','EM_APROVACAO','APROVADO','EM_PRODUCAO','PARCIAL','ATENDIDO','FATURADO','CANCELADO')),
 desconto_percentual numeric(7,4) not null default 0 check(desconto_percentual between 0 and 100),
 frete numeric(16,2) not null default 0 check(frete>=0),
 total_bruto numeric(16,2) not null default 0 check(total_bruto>=0),
 total numeric(16,2) not null default 0 check(total>=0),
 requer_aprovacao boolean not null default false,
 bloqueio_credito boolean not null default false,
 credito_excedente numeric(16,2) not null default 0 check(credito_excedente>=0),
 aprovado_por varchar(160), aprovado_em timestamptz,
 cancelado_motivo text not null default '',
 faturado_valor numeric(16,2) not null default 0 check(faturado_valor>=0),
 recebido_valor numeric(16,2) not null default 0 check(recebido_valor>=0),
 devolvido_valor numeric(16,2) not null default 0 check(devolvido_valor>=0),
 data_emissao date not null default current_date,
 data_entrega date,
 observacoes text not null default '',
 criado_por varchar(160) not null, atualizado_por varchar(160) not null,
 criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 check(faturado_valor<=total),
 check(devolvido_valor<=faturado_valor)
);
create index if not exists ix_pv_cliente on crm_pedidos_venda(cliente_id,criado_em desc);
create index if not exists ix_pv_representante on crm_pedidos_venda(representante_id,criado_em desc);
create index if not exists ix_pv_status on crm_pedidos_venda(status,data_entrega);
create unique index if not exists ux_pv_pedido_pcp on crm_pedidos_venda(pedido_pcp) where pedido_pcp<>'' and status<>'CANCELADO';
create unique index if not exists ux_pv_pedido_cliente on crm_pedidos_venda(cliente_id,lower(pedido_cliente)) where pedido_cliente<>'' and status<>'CANCELADO';

create table if not exists crm_pedido_venda_itens (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references crm_pedidos_venda(id) on delete cascade,
 linha integer not null check(linha>0),
 item_codigo varchar(80) not null default '',
 familia varchar(80) not null default '',
 descricao varchar(300) not null,
 unidade varchar(12) not null default 'UN',
 quantidade numeric(16,4) not null check(quantidade>0),
 preco_unitario numeric(16,4) not null check(preco_unitario>=0),
 desconto_percentual numeric(7,4) not null default 0 check(desconto_percentual between 0 and 100),
 total numeric(16,2) not null check(total>=0),
 data_entrega date,
 unique(pedido_id,linha)
);
create index if not exists ix_pv_itens_pedido on crm_pedido_venda_itens(pedido_id);

create table if not exists crm_pedido_venda_historico (
 id bigserial primary key,
 pedido_id uuid not null references crm_pedidos_venda(id) on delete cascade,
 evento varchar(40) not null, de varchar(20), para varchar(20),
 usuario varchar(160) not null, detalhe jsonb not null default '{}'::jsonb,
 criado_em timestamptz not null default now()
);
create index if not exists ix_pv_hist_pedido on crm_pedido_venda_historico(pedido_id,criado_em desc);

create table if not exists crm_comissao_regras (
 id uuid primary key default gen_random_uuid(),
 representante_id uuid not null references crm_representantes(id) on delete cascade,
 cliente_id uuid references crm_clientes(id) on delete cascade,
 item_codigo varchar(80) not null default '',
 familia varchar(80) not null default '',
 faixa_min numeric(16,2) check(faixa_min is null or faixa_min>=0),
 faixa_max numeric(16,2) check(faixa_max is null or faixa_max>=0),
 percentual numeric(7,4) not null check(percentual between 0 and 100),
 base varchar(10) not null default 'FATURADO' check(base in ('FATURADO','RECEBIDO')),
 vigencia_inicio date not null default current_date,
 vigencia_fim date,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vigencia_fim is null or vigencia_fim>=vigencia_inicio),
 check(faixa_max is null or faixa_min is null or faixa_max>=faixa_min)
);
create index if not exists ix_comissao_regras_rep on crm_comissao_regras(representante_id,ativo);

create table if not exists crm_comissoes (
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references crm_pedidos_venda(id) on delete restrict,
 representante_id uuid not null references crm_representantes(id) on delete restrict,
 tipo varchar(10) not null default 'PROVISAO' check(tipo in ('PROVISAO','LIBERACAO','ESTORNO')),
 base varchar(10) not null check(base in ('FATURADO','RECEBIDO')),
 valor_base numeric(16,2) not null,
 valor numeric(16,2) not null,
 status varchar(10) not null default 'PREVISTA' check(status in ('PREVISTA','A_PAGAR','PAGA','ESTORNADA')),
 competencia char(7) not null check(competencia ~ '^[0-9]{4}-[0-9]{2}$'),
 referencia_id uuid references crm_comissoes(id) on delete restrict,
 motivo text not null default '',
 pago_em timestamptz, pago_por varchar(160),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_comissoes_rep on crm_comissoes(representante_id,competencia,status);
create index if not exists ix_comissoes_pedido on crm_comissoes(pedido_id);
create unique index if not exists ux_comissao_provisao on crm_comissoes(pedido_id) where tipo='PROVISAO';

create or replace function crm_comissoes_imutavel() returns trigger language plpgsql as $$
begin
 if tg_op='DELETE' then raise exception 'Lançamento de comissão não pode ser apagado; use estorno';end if;
 if new.pedido_id is distinct from old.pedido_id or new.representante_id is distinct from old.representante_id
  or new.valor is distinct from old.valor or new.valor_base is distinct from old.valor_base
  or new.tipo is distinct from old.tipo or new.base is distinct from old.base or new.competencia is distinct from old.competencia then
  raise exception 'Lançamento de comissão é imutável; use estorno';
 end if;
 return new;
end$$;
drop trigger if exists crm_comissoes_imutavel_t on crm_comissoes;
create trigger crm_comissoes_imutavel_t before update or delete on crm_comissoes for each row execute function crm_comissoes_imutavel();

-- migrate:down
drop trigger if exists crm_comissoes_imutavel_t on crm_comissoes;
drop function if exists crm_comissoes_imutavel();
drop table if exists crm_comissoes;
drop table if exists crm_comissao_regras;
drop table if exists crm_pedido_venda_historico;
drop table if exists crm_pedido_venda_itens;
drop table if exists crm_pedidos_venda;
alter table crm_clientes drop column if exists condicao_pagamento;
alter table crm_clientes drop column if exists limite_credito;
