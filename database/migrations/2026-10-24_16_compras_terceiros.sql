-- depends-on: 2026-10-23_15_vendas_producao.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

alter table est_produtos add column if not exists estoque_seguranca numeric(16,3) not null default 0 check(estoque_seguranca>=0);
alter table est_produtos add column if not exists lead_time_dias integer not null default 0 check(lead_time_dias>=0);
alter table est_produtos add column if not exists lote_compra numeric(16,3) not null default 0 check(lote_compra>=0);

create table if not exists cmp_fornecedores(
 id uuid primary key default gen_random_uuid(),
 razao_social varchar(240) not null,
 documento varchar(40) not null default '',
 email varchar(240) not null default '', telefone varchar(50) not null default '',
 condicao_pagamento varchar(120) not null default '',
 prazo_medio_dias integer not null default 0 check(prazo_medio_dias>=0),
 terceirizador boolean not null default false,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_cmp_fornecedor_doc on cmp_fornecedores(regexp_replace(documento,'[^[:alnum:]]','','g')) where documento<>'';

create table if not exists cmp_alcadas(
 id serial primary key,
 valor_ate numeric(16,2) check(valor_ate is null or valor_ate>0),
 perfil_aprovador varchar(20) not null check(perfil_aprovador in ('PCP','GERENTE'))
);
create unique index if not exists ux_cmp_alcada_valor on cmp_alcadas((coalesce(valor_ate,-1)));
insert into cmp_alcadas(valor_ate,perfil_aprovador) select 5000,'PCP' where not exists(select 1 from cmp_alcadas where valor_ate=5000);
insert into cmp_alcadas(valor_ate,perfil_aprovador) select null,'GERENTE' where not exists(select 1 from cmp_alcadas where valor_ate is null);

create table if not exists cmp_solicitacoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 status varchar(12) not null default 'RASCUNHO' check(status in ('RASCUNHO','APROVADA','ATENDIDA','CANCELADA')),
 motivo varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 aprovado_por varchar(160), aprovado_em timestamptz
);
create table if not exists cmp_solicitacao_itens(
 solicitacao_id uuid not null references cmp_solicitacoes(id) on delete cascade,
 linha integer not null check(linha>0),
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 necessidade_data date,
 primary key(solicitacao_id,linha)
);
create table if not exists cmp_cotacao_propostas(
 solicitacao_id uuid not null, linha integer not null,
 fornecedor_id uuid not null references cmp_fornecedores(id),
 preco_unitario numeric(16,4) not null check(preco_unitario>=0),
 prazo_dias integer not null default 0 check(prazo_dias>=0),
 escolhida boolean not null default false,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(solicitacao_id,linha,fornecedor_id),
 foreign key(solicitacao_id,linha) references cmp_solicitacao_itens(solicitacao_id,linha) on delete cascade
);
create unique index if not exists ux_cmp_cotacao_escolhida on cmp_cotacao_propostas(solicitacao_id,linha) where escolhida;

create table if not exists cmp_pedidos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 fornecedor_id uuid not null references cmp_fornecedores(id) on delete restrict,
 solicitacao_id uuid references cmp_solicitacoes(id) on delete set null,
 status varchar(14) not null default 'RASCUNHO' check(status in ('RASCUNHO','EM_APROVACAO','APROVADO','PARCIAL','RECEBIDO','CANCELADO')),
 total numeric(16,2) not null default 0 check(total>=0),
 aprovador_exigido varchar(20) not null default 'PCP',
 previsao date,
 observacoes text not null default '',
 aprovado_por varchar(160), aprovado_em timestamptz,
 cancelado_motivo text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists ix_cmp_pedidos_status on cmp_pedidos(status,previsao);
create table if not exists cmp_pedido_itens(
 pedido_id uuid not null references cmp_pedidos(id) on delete cascade,
 linha integer not null check(linha>0),
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 preco_unitario numeric(16,4) not null check(preco_unitario>=0),
 quantidade_recebida numeric(16,3) not null default 0 check(quantidade_recebida>=0),
 primary key(pedido_id,linha)
);
create index if not exists ix_cmp_pedido_itens_prod on cmp_pedido_itens(produto_id);

create table if not exists cmp_recebimentos(
 id uuid primary key default gen_random_uuid(),
 pedido_id uuid not null references cmp_pedidos(id) on delete restrict,
 nota_numero varchar(40) not null default '',
 chave_nfe char(44),
 local_id uuid not null references est_locais(id),
 divergente boolean not null default false,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_cmp_recebimento_chave on cmp_recebimentos(chave_nfe) where chave_nfe is not null;
create table if not exists cmp_recebimento_itens(
 recebimento_id uuid not null references cmp_recebimentos(id) on delete cascade,
 linha integer not null,
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 preco_nf numeric(16,4) not null check(preco_nf>=0),
 divergencia text not null default '',
 movimento_id bigint references est_movimentos(id),
 primary key(recebimento_id,linha)
);

create table if not exists cmp_terceiros_movs(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(10) not null check(tipo in ('REMESSA','RETORNO')),
 fornecedor_id uuid not null references cmp_fornecedores(id) on delete restrict,
 produto_id uuid not null references est_produtos(id),
 produto_retorno_id uuid references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 custo_servico numeric(16,2) not null default 0 check(custo_servico>=0),
 local_id uuid not null references est_locais(id),
 nota_numero varchar(40) not null default '',
 of_id uuid references erp_ordens_fabricacao(id) on delete set null,
 movimento_id bigint references est_movimentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_cmp_terceiros on cmp_terceiros_movs(fornecedor_id,produto_id);

create or replace view cmp_saldo_terceiros as
select fornecedor_id,produto_id,
 coalesce(sum(case when tipo='REMESSA' then quantidade else 0 end),0)::numeric remetido,
 coalesce(sum(case when tipo='RETORNO' then quantidade else 0 end),0)::numeric retornado,
 (coalesce(sum(case when tipo='REMESSA' then quantidade else 0 end),0)-coalesce(sum(case when tipo='RETORNO' then quantidade else 0 end),0))::numeric saldo,
 coalesce(sum(custo_servico),0)::numeric custo_servico
from cmp_terceiros_movs group by fornecedor_id,produto_id;

-- Entrada de estoque centralizada para compras/terceiros (mesma regra do ledger: depósito ativo, sem inventário em contagem).
create or replace function cmp_mov_estoque(p_tipo text,p_prod uuid,p_local uuid,p_q numeric,p_doc text,p_motivo text,p_custo numeric,p_ator text) returns bigint language plpgsql as $$
declare u text;fr boolean;s est_saldos%rowtype;v_id bigint;
begin
 if p_tipo not in ('ENTRADA','SAIDA') then raise exception 'Tipo inválido';end if;
 select p.unidade_base,ub.fracionavel into strict u,fr from est_produtos p join est_unidades ub on ub.codigo=p.unidade_base where p.id=p_prod and p.ativo;
 if not fr and p_q<>trunc(p_q) then raise exception 'Produto não fracionável';end if;
 if not exists(select 1 from est_locais where id=p_local and ativo) then raise exception 'Depósito inválido';end if;
 if exists(select 1 from est_inventarios where status='EM_CONTAGEM' and (tipo='GERAL' or local_id=p_local)) then raise exception 'Depósito com inventário em contagem';end if;
 insert into est_saldos(produto_id,local_id) values(p_prod,p_local) on conflict do nothing;
 select * into strict s from est_saldos where produto_id=p_prod and local_id=p_local for update;
 if p_tipo='SAIDA' and s.fisico-s.reservado-s.bloqueado<p_q then raise exception 'SALDO_INSUFICIENTE: remessa';end if;
 update est_saldos set fisico=fisico+case when p_tipo='ENTRADA' then p_q else -p_q end,atualizado_em=now() where produto_id=p_prod and local_id=p_local;
 insert into est_movimentos(tipo,produto_id,local_origem_id,local_destino_id,quantidade_base,quantidade_informada,unidade_informada,documento,motivo,usuario,custo_total)
 values(p_tipo,p_prod,case when p_tipo='SAIDA' then p_local end,case when p_tipo='ENTRADA' then p_local end,p_q,p_q,u,coalesce(p_doc,''),coalesce(p_motivo,''),p_ator,greatest(0,coalesce(p_custo,0))) returning id into v_id;
 return v_id;
end$$;

-- Recebimento com conferência: quantidade e preço contra o pedido; tolerância de +5% de quantidade.
create or replace function cmp_receber(p_pedido uuid,p_nota text,p_chave text,p_local uuid,p_itens jsonb,p_ator text) returns uuid language plpgsql as $$
declare pd cmp_pedidos%rowtype;it record;pi cmp_pedido_itens%rowtype;rid uuid;v_mov bigint;div boolean=false;d text;n int=0;falta int;
begin
 perform pg_advisory_xact_lock(hashtextextended('cmp:receber:'||p_pedido::text,0));
 select * into strict pd from cmp_pedidos where id=p_pedido for update;
 if pd.status not in ('APROVADO','PARCIAL') then raise exception 'Pedido de compra não está liberado para recebimento (%)',pd.status;end if;
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then raise exception 'Informe os itens recebidos';end if;
 if nullif(p_chave,'') is not null and p_chave !~ '^[0-9]{44}$' then raise exception 'Chave da NF-e inválida';end if;
 insert into cmp_recebimentos(pedido_id,nota_numero,chave_nfe,local_id,criado_por) values(p_pedido,coalesce(p_nota,''),nullif(p_chave,''),p_local,p_ator) returning id into rid;
 for it in select (x->>'linha')::int linha,(x->>'quantidade')::numeric q,(x->>'precoNf')::numeric preco from jsonb_array_elements(p_itens) x order by 1 loop
  if it.q is null or it.q<=0 then raise exception 'Quantidade recebida inválida';end if;
  select * into pi from cmp_pedido_itens where pedido_id=p_pedido and linha=it.linha for update;
  if not found then raise exception 'Linha % não existe no pedido',it.linha;end if;
  if pi.quantidade_recebida+it.q>pi.quantidade*1.05 then raise exception 'Linha %: recebimento excede o pedido além da tolerância de 5%%',it.linha;end if;
  d='';
  if it.preco is distinct from pi.preco_unitario then d=d||'preço NF '||coalesce(it.preco::text,'?')||' ≠ pedido '||pi.preco_unitario;end if;
  if pi.quantidade_recebida+it.q>pi.quantidade then d=d||case when d<>'' then '; ' else '' end||'quantidade acima do pedido';end if;
  if d<>'' then div=true;end if;
  v_mov=cmp_mov_estoque('ENTRADA',pi.produto_id,p_local,it.q,'NF '||coalesce(p_nota,''),'COMPRA PC '||pd.numero,it.q*coalesce(it.preco,pi.preco_unitario),p_ator);
  insert into cmp_recebimento_itens values(rid,it.linha,pi.produto_id,it.q,coalesce(it.preco,pi.preco_unitario),d,v_mov);
  update cmp_pedido_itens set quantidade_recebida=quantidade_recebida+it.q where pedido_id=p_pedido and linha=it.linha;
  n=n+1;
 end loop;
 update cmp_recebimentos set divergente=div where id=rid;
 select count(*) into falta from cmp_pedido_itens where pedido_id=p_pedido and quantidade_recebida<quantidade;
 update cmp_pedidos set status=case when falta=0 then 'RECEBIDO' else 'PARCIAL' end,atualizado_em=now() where id=p_pedido;
 return rid;
end$$;

-- Remessa/retorno de beneficiamento em terceiros.
create or replace function cmp_terceiro_mov(p_tipo text,p_forn uuid,p_prod uuid,p_ret uuid,p_q numeric,p_custo numeric,p_local uuid,p_nota text,p_of uuid,p_ator text) returns uuid language plpgsql as $$
declare v_new uuid;v_mov bigint;saldo numeric;
begin
 perform pg_advisory_xact_lock(hashtextextended('cmp:terceiros:'||p_forn::text,0));
 if not exists(select 1 from cmp_fornecedores where id=p_forn and ativo) then raise exception 'Fornecedor inativo ou inexistente';end if;
 if p_q<=0 then raise exception 'Quantidade inválida';end if;
 if p_tipo='REMESSA' then
  v_mov=cmp_mov_estoque('SAIDA',p_prod,p_local,p_q,'REM '||coalesce(p_nota,''),'REMESSA TERCEIRO',0,p_ator);
 elsif p_tipo='RETORNO' then
  select coalesce(sum(case when tipo='REMESSA' then quantidade else -quantidade end),0) into saldo from cmp_terceiros_movs where fornecedor_id=p_forn and produto_id=p_prod;
  if p_q>saldo then raise exception 'Retorno maior que o saldo em poder do terceiro (%)',saldo;end if;
  v_mov=cmp_mov_estoque('ENTRADA',coalesce(p_ret,p_prod),p_local,p_q,'RET '||coalesce(p_nota,''),'RETORNO TERCEIRO',coalesce(p_custo,0),p_ator);
 else raise exception 'Tipo inválido';end if;
 insert into cmp_terceiros_movs(tipo,fornecedor_id,produto_id,produto_retorno_id,quantidade,custo_servico,local_id,nota_numero,of_id,movimento_id,criado_por)
 values(p_tipo,p_forn,p_prod,case when p_tipo='RETORNO' then nullif(p_ret,p_prod) end,p_q,case when p_tipo='RETORNO' then coalesce(p_custo,0) else 0 end,p_local,coalesce(p_nota,''),p_of,v_mov,p_ator) returning cmp_terceiros_movs.id into v_new;
 return v_new;
end$$;

-- Curva ABC (valor consumido) e XYZ (variabilidade mensal) dos últimos p_dias dias.
create or replace function cmp_curva_abc_xyz(p_dias integer default 180)
returns table(produto_id uuid,codigo text,descricao text,consumo_valor numeric,consumo_qtd numeric,percentual_acum numeric,classe_abc text,coef_variacao numeric,classe_xyz text)
language sql stable as $$
 with base as (
  select m.produto_id,date_trunc('month',m.criado_em) mes,sum(m.quantidade_base) q,sum(m.custo_total) v
  from est_movimentos m where m.tipo='SAIDA' and m.estorno_de is null and m.criado_em>=now()-make_interval(days=>greatest(1,p_dias))
  group by 1,2),
 tot as (select produto_id,sum(v) valor,sum(q) qtd,avg(q) media,coalesce(stddev_pop(q),0) desvio from base group by 1),
 rk as (select t.*,sum(valor) over (order by valor desc,produto_id) acum,sum(valor) over () soma from tot t)
 select r.produto_id,p.codigo::text,p.descricao::text,r.valor::numeric,r.qtd::numeric,
  case when r.soma>0 then round(100*r.acum/r.soma,2) else 100 end::numeric,
  (case when r.soma<=0 then 'C' when 100*(r.acum-r.valor)/r.soma<80 then 'A' when 100*(r.acum-r.valor)/r.soma<95 then 'B' else 'C' end)::text,
  case when r.media>0 then round(r.desvio/r.media,3) else 0 end::numeric,
  (case when r.media<=0 then 'Z' when r.desvio/r.media<0.5 then 'X' when r.desvio/r.media<1 then 'Y' else 'Z' end)::text
 from rk r join est_produtos p on p.id=r.produto_id order by r.valor desc
$$;

-- Sugestão de compra: projeção = disponível + em compra − necessidade restante das OFs abertas; alvo = mínimo + segurança.
create or replace function cmp_sugestao_compra()
returns table(produto_id uuid,codigo text,descricao text,disponivel numeric,em_compra numeric,necessidade_of numeric,projecao numeric,alvo numeric,sugerido numeric,lead_time_dias int,custo_medio numeric)
language sql stable as $$
 with disp as (select s.produto_id,sum(s.fisico-s.bloqueado) livre from est_saldos s group by 1),
 comp as (select i.produto_id,sum(i.quantidade-least(i.quantidade,i.quantidade_recebida)) q from cmp_pedido_itens i join cmp_pedidos p on p.id=i.pedido_id where p.status in ('EM_APROVACAO','APROVADO','PARCIAL') group by 1),
 nec as (
  select m.produto_id,sum(greatest(0,m.necessidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=m.of_id and x.produto_id=m.produto_id and x.tipo='SAIDA' and x.estorno_de is null),0))) q
  from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id where o.status in ('PLANEJADA','LIBERADA') group by 1),
 cm as (select produto_id,sum(custo_total)/nullif(sum(quantidade_base),0) c from est_movimentos where tipo='ENTRADA' and estorno_de is null and custo_total>0 group by 1)
 select p.id,p.codigo::text,p.descricao::text,coalesce(d.livre,0)::numeric,coalesce(c.q,0)::numeric,coalesce(n.q,0)::numeric,
  (coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0))::numeric,(p.estoque_minimo+p.estoque_seguranca)::numeric,
  (case when p.lote_compra>0 then ceil(greatest(0,p.estoque_minimo+p.estoque_seguranca-(coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0)))/p.lote_compra)*p.lote_compra
        else greatest(0,p.estoque_minimo+p.estoque_seguranca-(coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0))) end)::numeric,
  p.lead_time_dias,coalesce(cm.c,0)::numeric
 from est_produtos p left join disp d on d.produto_id=p.id left join comp c on c.produto_id=p.id left join nec n on n.produto_id=p.id left join cm on cm.produto_id=p.id
 where p.ativo and p.classificacao in ('INSUMO','NAO_CLASSIFICADO')
   and (coalesce(d.livre,0)+coalesce(c.q,0)-coalesce(n.q,0)) < (p.estoque_minimo+p.estoque_seguranca)
order by p.codigo
$$;

-- migrate:down
drop function if exists cmp_sugestao_compra();
drop function if exists cmp_curva_abc_xyz(integer);
drop function if exists cmp_terceiro_mov(text,uuid,uuid,uuid,numeric,numeric,uuid,text,uuid,text);
drop function if exists cmp_receber(uuid,text,text,uuid,jsonb,text);
drop function if exists cmp_mov_estoque(text,uuid,uuid,numeric,text,text,numeric,text);
drop view if exists cmp_saldo_terceiros;
drop table if exists cmp_terceiros_movs;
drop table if exists cmp_recebimento_itens;
drop table if exists cmp_recebimentos;
drop table if exists cmp_pedido_itens;
drop table if exists cmp_pedidos;
drop table if exists cmp_cotacao_propostas;
drop table if exists cmp_solicitacao_itens;
drop table if exists cmp_solicitacoes;
drop table if exists cmp_alcadas;
drop table if exists cmp_fornecedores;
alter table est_produtos drop column if exists lote_compra;
alter table est_produtos drop column if exists lead_time_dias;
alter table est_produtos drop column if exists estoque_seguranca;
