-- depends-on: 2026-11-13_36_estoque_naturezas_conferencia.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

-- Cadeia de custódia de matéria-prima certificada: NF recebida -> pedido -> consumo (FIFO), sem consumir mais do que a NF certificada.
create table if not exists cert_nfs(
 id uuid primary key default gen_random_uuid(),
 numero_nf varchar(40) not null unique,
 fornecedor varchar(200) not null default '',
 emissao date,
 certificada boolean not null default true,
 arquivo_origem varchar(200) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists cert_nf_itens(
 nf_id uuid not null references cert_nfs(id) on delete cascade,
 item integer not null check(item>0),
 codigo varchar(40) not null, codigo_interno varchar(60) not null default '',
 descricao varchar(300) not null, unidade varchar(10) not null,
 quantidade numeric(16,4) not null check(quantidade>0),
 preco_unitario numeric(16,5) not null default 0 check(preco_unitario>=0),
 primary key(nf_id,item)
);
create index if not exists ix_cert_itens_codigo on cert_nf_itens(codigo);
create table if not exists cert_pedido_nfs(
 pedido varchar(60) not null, nf_id uuid not null references cert_nfs(id) on delete restrict,
 vinculado_por varchar(160) not null, vinculado_em timestamptz not null default now(),
 ordem bigserial,
 primary key(pedido,nf_id)
);
create table if not exists cert_consumos(
 id bigserial primary key,
 pedido varchar(60) not null,
 nf_id uuid not null, item integer not null,
 quantidade numeric(16,4) not null check(quantidade<>0),
 origem varchar(12) not null default 'MANUAL' check(origem in('MANUAL','APONTAMENTO','ESTORNO')),
 estorno_de bigint references cert_consumos(id),
 observacao varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 foreign key(nf_id,item) references cert_nf_itens(nf_id,item)
);
create index if not exists ix_cert_consumos_pedido on cert_consumos(pedido,nf_id,item);
create unique index if not exists ux_cert_estorno on cert_consumos(estorno_de) where estorno_de is not null;
create or replace function cert_consumo_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Consumo certificado é registro de rastreabilidade: use estorno';end$$;
drop trigger if exists cert_consumo_imutavel_t on cert_consumos;
create trigger cert_consumo_imutavel_t before update or delete on cert_consumos for each row execute function cert_consumo_imutavel();

create or replace view cert_v_saldo_item as
select p.pedido,i.nf_id,n.numero_nf,n.certificada,i.item,i.codigo,i.codigo_interno,i.descricao,i.unidade,p.ordem,
 i.quantidade recebido,coalesce(sum(c.quantidade),0) utilizado,(i.quantidade-coalesce(sum(c.quantidade),0)) saldo
from cert_pedido_nfs p join cert_nfs n on n.id=p.nf_id join cert_nf_itens i on i.nf_id=n.id
left join cert_consumos c on c.pedido=p.pedido and c.nf_id=i.nf_id and c.item=i.item
group by p.pedido,i.nf_id,n.numero_nf,n.certificada,i.item,i.codigo,i.codigo_interno,i.descricao,i.unidade,p.ordem,i.quantidade;
create or replace view cert_v_saldo_produto as
select pedido,codigo,max(codigo_interno) codigo_interno,max(descricao) descricao,max(unidade) unidade,
 sum(recebido) recebido,sum(utilizado) utilizado,sum(saldo) saldo,count(distinct nf_id)::int nfs
from cert_v_saldo_item where certificada group by pedido,codigo;

create or replace function cert_vincular(p_pedido text,p_nf uuid,p_ator text) returns void language plpgsql as $$
begin
 if length(trim(coalesce(p_pedido,'')))=0 then raise exception 'Informe o pedido';end if;
 if not exists(select 1 from cert_nfs where id=p_nf) then raise exception 'NF inexistente';end if;
 insert into cert_pedido_nfs(pedido,nf_id,vinculado_por) values(p_pedido,p_nf,p_ator) on conflict do nothing;
end$$;

-- Consome em FIFO (ordem de vínculo das NFs, depois item) e nunca acima do saldo certificado.
create or replace function cert_consumir(p_pedido text,p_codigo text,p_qtd numeric,p_origem text,p_obs text,p_ator text) returns integer language plpgsql as $$
declare v_rest numeric:=p_qtd;r record;v_usar numeric;v_n int:=0;v_saldo numeric;
begin
 if p_qtd is null or p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 select coalesce(sum(saldo),0) into v_saldo from cert_v_saldo_item where pedido=p_pedido and codigo=p_codigo and certificada;
 if v_saldo<p_qtd then raise exception 'SALDO_CERTIFICADO_INSUFICIENTE: saldo % x solicitado %',v_saldo,p_qtd;end if;
 for r in select nf_id,item,saldo from cert_v_saldo_item where pedido=p_pedido and codigo=p_codigo and certificada and saldo>0 order by ordem,numero_nf,item loop
  v_usar=least(v_rest,r.saldo);
  insert into cert_consumos(pedido,nf_id,item,quantidade,origem,observacao,criado_por) values(p_pedido,r.nf_id,r.item,v_usar,coalesce(nullif(p_origem,''),'MANUAL'),coalesce(p_obs,''),p_ator);
  v_rest=v_rest-v_usar;v_n=v_n+1;exit when v_rest<=0;
 end loop;
 return v_n;
end$$;

create or replace function cert_estornar(p_consumo bigint,p_motivo text,p_ator text) returns bigint language plpgsql as $$
declare c cert_consumos%rowtype;v_id bigint;
begin
 select * into strict c from cert_consumos where id=p_consumo;
 if c.quantidade<0 then raise exception 'Não é possível estornar um estorno';end if;
 if exists(select 1 from cert_consumos where estorno_de=p_consumo) then raise exception 'Consumo já estornado';end if;
 if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo do estorno';end if;
 insert into cert_consumos(pedido,nf_id,item,quantidade,origem,estorno_de,observacao,criado_por) values(c.pedido,c.nf_id,c.item,-c.quantidade,'ESTORNO',p_consumo,p_motivo,p_ator) returning id into v_id;
 return v_id;
end$$;

-- migrate:down
drop function if exists cert_estornar(bigint,text,text);
drop function if exists cert_consumir(text,text,numeric,text,text,text);
drop function if exists cert_vincular(text,uuid,text);
drop view if exists cert_v_saldo_produto;
drop view if exists cert_v_saldo_item;
drop trigger if exists cert_consumo_imutavel_t on cert_consumos;
drop function if exists cert_consumo_imutavel();
drop table if exists cert_consumos;
drop table if exists cert_pedido_nfs;
drop table if exists cert_nf_itens;
drop table if exists cert_nfs;
