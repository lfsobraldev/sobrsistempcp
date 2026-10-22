-- depends-on: 2026-10-23_14_vendas_comissoes.sql
-- depends-on: 2026-10-22_13_controle_of.sql
-- scope: operational
-- migrate:up
-- Somente leitura: funções e view. Nenhuma tabela existente é alterada.
create or replace function erp_norm_pedido(p text) returns text language sql immutable as $$
 select coalesce(nullif(ltrim(trim(coalesce(p,'')),'0'),''),'0')
$$;
create or replace function erp_norm_codigo(p text) returns text language sql immutable as $$
 select upper(regexp_replace(trim(coalesce(p,'')),'[[:space:]]+','','g'))
$$;

create or replace view erp_v_of_comercial as
select o.id of_id, o.numero of_numero, o.status of_status, o.pedido,
 pv.id pedido_venda_id, pv.numero pedido_venda_numero, pv.pedido_cliente,
 c.id cliente_id, c.razao_social cliente_nome, r.id representante_id, r.nome representante_nome
from erp_ordens_fabricacao o
left join crm_pedidos_venda pv on pv.pedido_pcp<>'' and pv.status<>'CANCELADO' and erp_norm_pedido(pv.pedido_pcp)=erp_norm_pedido(o.pedido)
left join crm_clientes c on c.id=pv.cliente_id
left join crm_representantes r on r.id=pv.representante_id;

-- Necessidade de produção de um pedido de venda: quanto falta produzir considerando OF em curso e saldo livre.
create or replace function erp_necessidade_pedido(p_pedido uuid)
returns table(linha int,item_codigo text,descricao text,produto_id uuid,quantidade numeric,em_of numeric,saldo_livre numeric,falta_producao numeric,situacao text)
language sql stable as $$
 with pv as (select id,pedido_pcp from crm_pedidos_venda where id=p_pedido),
 it as (select i.linha,i.item_codigo,i.descricao,i.quantidade,ep.id pid
        from crm_pedido_venda_itens i join pv on pv.id=i.pedido_id
        left join est_produtos ep on ep.codigo=erp_norm_codigo(i.item_codigo) and ep.ativo where i.pedido_id=p_pedido)
 select it.linha::int,it.item_codigo::text,it.descricao::text,it.pid,it.quantidade::numeric,
  coalesce(of.q,0)::numeric,coalesce(sl.livre,0)::numeric,
  greatest(0,it.quantidade-coalesce(of.q,0)-coalesce(sl.livre,0))::numeric,
  (case when it.pid is null then 'SEM_PRODUTO_ESTOQUE'
        when it.quantidade<=coalesce(of.q,0)+coalesce(sl.livre,0) then 'COBERTO' else 'PRODUZIR' end)::text
 from it
 left join lateral (select sum(o.quantidade) q from erp_ordens_fabricacao o, pv
   where o.produto_estoque_id=it.pid and o.status in ('PLANEJADA','LIBERADA') and pv.pedido_pcp<>'' and erp_norm_pedido(o.pedido)=erp_norm_pedido(pv.pedido_pcp)) of on true
 left join lateral (select sum(greatest(0,s.fisico-s.reservado-s.bloqueado)) livre from est_saldos s where s.produto_id=it.pid) sl on true
 order by it.linha
$$;

-- Disponibilidade dos componentes antes de criar a OF.
create or replace function erp_disponibilidade_estrutura(p_estrutura uuid,p_qtd numeric,p_local uuid)
returns table(componente_id uuid,codigo text,descricao text,classificacao text,necessidade numeric,livre numeric,falta numeric,situacao text)
language sql stable as $$
 select i.componente_id,p.codigo::text,p.descricao::text,p.classificacao::text,
  n.nec, coalesce(g.livre,0)::numeric, greatest(0,n.nec-coalesce(g.livre,0))::numeric,
  (case when n.nec<=coalesce(g.livre,0) then 'OK' when p.classificacao='SEMIACABADO' then 'GERA_OF_FILHA' else 'FALTA' end)::text
 from erp_estrutura_itens i
 join est_produtos p on p.id=i.componente_id
 join est_unidades u on u.codigo=p.unidade_base
 cross join lateral (select (case when u.fracionavel then ceil(p_qtd*i.quantidade*(1+i.perda_percentual/100)*1000)/1000
                                  else ceil(p_qtd*i.quantidade*(1+i.perda_percentual/100)) end)::numeric nec) n
 left join lateral (select greatest(0,s.fisico-s.reservado-s.bloqueado) livre from est_saldos s where s.produto_id=i.componente_id and s.local_id=p_local) g on true
 where i.estrutura_id=p_estrutura order by p.codigo
$$;

-- Onde-é-usado em árvore (versão aprovada mais recente de cada pai).
create or replace function erp_onde_usado(p_prod uuid)
returns table(nivel int,pai_id uuid,pai_codigo text,pai_descricao text,componente_id uuid,quantidade_por_pai numeric,quantidade_acumulada numeric,caminho text)
language sql stable as $$
 with recursive vig as (
  select distinct on (e.produto_id) e.id,e.produto_id from erp_estruturas e where e.status='APROVADA' order by e.produto_id,e.versao desc),
 t as (
  select 1 nivel,v.produto_id pai_id,i.componente_id,i.quantidade::numeric q1,i.quantidade::numeric qacum,array[v.produto_id,i.componente_id] vis
  from erp_estrutura_itens i join vig v on v.id=i.estrutura_id where i.componente_id=p_prod
  union all
  select t.nivel+1,v.produto_id,i.componente_id,i.quantidade::numeric,t.qacum*i.quantidade::numeric,t.vis||v.produto_id
  from t join erp_estrutura_itens i on i.componente_id=t.pai_id join vig v on v.id=i.estrutura_id
  where t.nivel<25 and not v.produto_id=any(t.vis))
 select t.nivel::int,t.pai_id,p.codigo::text,p.descricao::text,t.componente_id,t.q1,t.qacum,
  (select string_agg(x.codigo,' > ' order by o) from unnest(t.vis) with ordinality as a(id,o) join est_produtos x on x.id=a.id)::text
 from t join est_produtos p on p.id=t.pai_id order by t.nivel,p.codigo
$$;

-- Rastreabilidade para trás e para frente a partir de uma OF.
create or replace function erp_rastreio_of(p_of uuid)
returns table(sentido text,tipo text,referencia text,descricao text,quantidade numeric,detalhe jsonb)
language sql stable as $$
 with o as (select * from erp_ordens_fabricacao where id=p_of)
 select 'ORIGEM'::text,'MATERIAL_CONSUMIDO'::text,coalesce(l.codigo,'sem lote')::text,p.codigo::text,sum(m.quantidade_base-0)::numeric,
  jsonb_build_object('produto_id',m.produto_id,'lote_id',m.lote_id)
 from est_movimentos m join est_produtos p on p.id=m.produto_id left join est_lotes l on l.id=m.lote_id
 where m.of_id=p_of and m.tipo='SAIDA' and m.estorno_de is null
   and not exists(select 1 from est_movimentos e where e.estorno_de=m.id)
 group by m.produto_id,m.lote_id,l.codigo,p.codigo
 union all
 select 'ORIGEM','OF_PAI',f.numero::text,'OF '||f.numero,f.quantidade,jsonb_build_object('of_id',f.id,'status',f.status)
 from o join erp_ordens_fabricacao f on f.id=o.of_pai_id
 union all
 select 'DESTINO','ENTRADA_PRODUZIDA',coalesce(l.codigo,'sem lote'),p.codigo,sum(m.quantidade_base),jsonb_build_object('produto_id',m.produto_id,'lote_id',m.lote_id)
 from est_movimentos m join est_produtos p on p.id=m.produto_id left join est_lotes l on l.id=m.lote_id
 where m.of_id=p_of and m.tipo='ENTRADA' and m.estorno_de is null and not exists(select 1 from est_movimentos e where e.estorno_de=m.id)
 group by m.produto_id,m.lote_id,l.codigo,p.codigo
 union all
 select 'DESTINO','OF_FILHA',f.numero::text,'OF '||f.numero,f.quantidade,jsonb_build_object('of_id',f.id,'status',f.status)
 from erp_ordens_fabricacao f where f.of_pai_id=p_of
 union all
 select 'DESTINO','PALLET',pl.codigo::text,pl.tipo_produto::text,pl.quantidade,jsonb_build_object('pedido',pl.pedido)
 from o join pcp_pallets pl on erp_norm_pedido(pl.pedido)=erp_norm_pedido(o.pedido)
 union all
 select 'DESTINO','PEDIDO_VENDA',c.pedido_venda_numero::text,coalesce(c.cliente_nome,''),null::numeric,
  jsonb_build_object('pedido_venda_id',c.pedido_venda_id,'cliente',c.cliente_nome,'representante',c.representante_nome,'pedido_cliente',c.pedido_cliente)
 from erp_v_of_comercial c where c.of_id=p_of and c.pedido_venda_id is not null
$$;

-- Para frente a partir de um lote de matéria-prima: OFs que o consumiram e seus pedidos/clientes.
create or replace function erp_rastreio_lote(p_lote uuid)
returns table(of_id uuid,of_numero bigint,of_status text,produto text,quantidade_consumida numeric,pedido text,pedido_venda_numero bigint,cliente text,representante text)
language sql stable as $$
 select o.id,o.numero,o.status::text,pr.codigo::text,
  sum(case when m.tipo='SAIDA' then m.quantidade_base else 0 end)
   - coalesce((select sum(e.quantidade_base) from est_movimentos e where e.lote_id=p_lote and e.of_id=o.id and e.tipo='ENTRADA' and e.estorno_de is not null),0),
  o.pedido::text,max(c.pedido_venda_numero),max(c.cliente_nome)::text,max(c.representante_nome)::text
 from est_movimentos m join erp_ordens_fabricacao o on o.id=m.of_id join est_produtos pr on pr.id=o.produto_estoque_id
 left join erp_v_of_comercial c on c.of_id=o.id
 where m.lote_id=p_lote and m.tipo='SAIDA' and m.estorno_de is null
 group by o.id,o.numero,o.status,pr.codigo,o.pedido order by o.numero
$$;

-- migrate:down
drop function if exists erp_rastreio_lote(uuid);
drop function if exists erp_rastreio_of(uuid);
drop function if exists erp_onde_usado(uuid);
drop function if exists erp_disponibilidade_estrutura(uuid,numeric,uuid);
drop function if exists erp_necessidade_pedido(uuid);
drop view if exists erp_v_of_comercial;
drop function if exists erp_norm_codigo(text);
drop function if exists erp_norm_pedido(text);
