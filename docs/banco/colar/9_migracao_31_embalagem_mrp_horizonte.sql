-- GERADO do arquivo canônico 2026-11-08_31_embalagem_mrp_horizonte.sql; SHA256 1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-07_30_seguranca_aprovacoes_auditoria.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-08_31_embalagem_mrp_horizonte.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-08_31_embalagem_mrp_horizonte.sql' and checksum<>'1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ================================================================ A. Plano de embalagem com lista por pallet e conferência
create table if not exists emb_planos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 pedido varchar(60) not null,
 montagem varchar(30) not null default 'MONTADO_HS',
 status varchar(12) not null default 'RASCUNHO' check(status in('RASCUNHO','EM_EMBALAGEM','FECHADO','CANCELADO')),
 origem varchar(20) not null default 'ROMANEIO',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 atualizado_por varchar(160) not null default ''
);
create unique index if not exists ux_emb_plano_aberto on emb_planos(pedido) where status in('RASCUNHO','EM_EMBALAGEM');
create table if not exists emb_pallets(
 plano_id uuid not null references emb_planos(id) on delete cascade,
 numero integer not null check(numero>0),
 tipo varchar(30) not null default 'PORTA',
 limite_m3 numeric(10,4), volume_m3 numeric(10,4) not null default 0,
 limite_qtd numeric(12,3), regra text not null default '',
 status varchar(10) not null default 'VALIDO' check(status in('VALIDO','ATENCAO','INVALIDO')),
 pallet_id uuid references pcp_pallets(id),
 fechado_por varchar(160) not null default '', fechado_em timestamptz,
 primary key(plano_id,numero)
);
create table if not exists emb_itens(
 plano_id uuid not null, pallet_numero integer not null, linha integer not null check(linha>0),
 descricao varchar(300) not null, medida varchar(80) not null default '',
 quantidade numeric(12,3) not null check(quantidade>0),
 qtd_conferida numeric(12,3) check(qtd_conferida is null or qtd_conferida>=0),
 observacao varchar(300) not null default '',
 conferido_por varchar(160) not null default '', conferido_em timestamptz,
 primary key(plano_id,pallet_numero,linha),
 foreign key(plano_id,pallet_numero) references emb_pallets(plano_id,numero) on delete cascade
);

create or replace function emb_plano_criar(p_pedido text,p_montagem text,p_pallets jsonb,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_p jsonb;v_i jsonb;v_l integer;v_n integer:=0;
begin
 if coalesce(trim(p_pedido),'')='' then raise exception 'Informe o pedido';end if;
 if wms_pedido_em_revisao(p_pedido) then raise exception 'REVISAO_ABERTA: o pedido % tem revisão aberta e não pode ser embalado',p_pedido;end if;
 if jsonb_typeof(p_pallets)<>'array' or jsonb_array_length(p_pallets)=0 then raise exception 'O plano não tem pallets';end if;
 if exists(select 1 from emb_planos where pedido=p_pedido and status in('RASCUNHO','EM_EMBALAGEM')) then raise exception 'O pedido % já tem um plano de embalagem em aberto',p_pedido;end if;
 insert into emb_planos(pedido,montagem,criado_por) values(p_pedido,coalesce(nullif(p_montagem,''),'MONTADO_HS'),p_ator) returning id into v_id;
 for v_p in select * from jsonb_array_elements(p_pallets) loop
  v_n:=v_n+1;
  insert into emb_pallets(plano_id,numero,tipo,limite_m3,volume_m3,limite_qtd,regra,status)
  values(v_id,v_n,left(coalesce(v_p->>'tipo','PORTA'),30),nullif(v_p->>'limiteM3','')::numeric,coalesce(nullif(v_p->>'volumeM3','')::numeric,0),nullif(v_p->>'limiteQtd','')::numeric,coalesce(v_p->>'regra',''),
   case when upper(coalesce(v_p->>'status','VALIDO')) in('VALIDO','ATENCAO','INVALIDO') then upper(coalesce(v_p->>'status','VALIDO')) else 'VALIDO' end);
  v_l:=0;
  for v_i in select * from jsonb_array_elements(coalesce(v_p->'itens','[]'::jsonb)) loop
   if coalesce((v_i->>'quantidade')::numeric,0)<=0 then continue;end if;
   v_l:=v_l+1;
   insert into emb_itens(plano_id,pallet_numero,linha,descricao,medida,quantidade) values(v_id,v_n,v_l,left(coalesce(v_i->>'descricao','Item'),300),left(coalesce(v_i->>'medida',''),80),(v_i->>'quantidade')::numeric);
  end loop;
  if v_l=0 then raise exception 'O pallet % não tem itens',v_n;end if;
 end loop;
 return v_id;
end$$;

create or replace function emb_conferir(p_plano uuid,p_pallet integer,p_linha integer,p_qtd numeric,p_obs text,p_ator text) returns void language plpgsql as $$
declare v_st text;v_pf timestamptz;v_q numeric;
begin
 if p_qtd is null or p_qtd<0 then raise exception 'Quantidade conferida inválida';end if;
 select status into v_st from emb_planos where id=p_plano for update;
 if v_st is null or v_st in('FECHADO','CANCELADO') then raise exception 'Plano encerrado ou inexistente';end if;
 select fechado_em into v_pf from emb_pallets where plano_id=p_plano and numero=p_pallet;
 if v_pf is not null then raise exception 'Pallet % já está fechado',p_pallet;end if;
 select quantidade into v_q from emb_itens where plano_id=p_plano and pallet_numero=p_pallet and linha=p_linha;
 if v_q is null then raise exception 'Item não encontrado';end if;
 if p_qtd<>v_q and coalesce(trim(p_obs),'')='' then raise exception 'DIVERGENCIA: conferido % de % — informe a observação',p_qtd,v_q;end if;
 update emb_itens set qtd_conferida=p_qtd,observacao=coalesce(p_obs,''),conferido_por=p_ator,conferido_em=now() where plano_id=p_plano and pallet_numero=p_pallet and linha=p_linha;
 update emb_planos set status='EM_EMBALAGEM',atualizado_em=now(),atualizado_por=p_ator where id=p_plano and status='RASCUNHO';
end$$;

create or replace function emb_pallet_fechar(p_plano uuid,p_pallet integer,p_ator text) returns uuid language plpgsql as $$
declare v_pl record;v_pa record;v_cod text;v_pid uuid;v_pend integer;v_div integer;v_total numeric;v_abertos integer;
begin
 select * into v_pl from emb_planos where id=p_plano for update;
 if not found or v_pl.status in('FECHADO','CANCELADO') then raise exception 'Plano encerrado ou inexistente';end if;
 if wms_pedido_em_revisao(v_pl.pedido) then raise exception 'REVISAO_ABERTA: o pedido % tem revisão aberta',v_pl.pedido;end if;
 select * into v_pa from emb_pallets where plano_id=p_plano and numero=p_pallet for update;
 if not found then raise exception 'Pallet não encontrado';end if;
 if v_pa.fechado_em is not null then raise exception 'Pallet já fechado';end if;
 if v_pa.status='INVALIDO' then raise exception 'PALLET_INVALIDO: o pallet excede as regras (%). Replaneje antes de fechar',v_pa.regra;end if;
 select count(*) filter(where qtd_conferida is null),count(*) filter(where qtd_conferida is not null and qtd_conferida<>quantidade),sum(quantidade) into v_pend,v_div,v_total from emb_itens where plano_id=p_plano and pallet_numero=p_pallet;
 if v_pend>0 then raise exception 'Confira todos os itens antes de fechar (% sem conferência)',v_pend;end if;
 if v_div>0 then raise exception 'DIVERGENCIA: % item(ns) conferido(s) diferente(s) do plano; corrija ou replaneje',v_div;end if;
 v_cod:=emb_codigo_pallet(v_pl.pedido,p_pallet);
 insert into pcp_pallets(codigo,pedido,pallet,tipo_produto,quantidade,jogos,status,criado_por)
 values(v_cod,v_pl.pedido,v_cod,v_pa.tipo,v_total,case when v_pa.tipo<>'PORTA' then v_total else 0 end,'AGUARDANDO_INSPECAO',p_ator) returning id into v_pid;
 update emb_pallets set pallet_id=v_pid,fechado_por=p_ator,fechado_em=now() where plano_id=p_plano and numero=p_pallet;
 select count(*) into v_abertos from emb_pallets where plano_id=p_plano and fechado_em is null;
 update emb_planos set status=case when v_abertos=0 then 'FECHADO' else 'EM_EMBALAGEM' end,atualizado_em=now(),atualizado_por=p_ator where id=p_plano;
 return v_pid;
end$$;
create or replace function emb_codigo_pallet(p_pedido text,p_num integer) returns text language sql immutable as $$ select p_pedido||'-P'||lpad(p_num::text,2,'0') $$;

create or replace function emb_plano_cancelar(p_plano uuid,p_ator text) returns void language plpgsql as $$
begin
 if exists(select 1 from emb_pallets where plano_id=p_plano and fechado_em is not null) then raise exception 'Há pallet fechado: não é possível cancelar o plano';end if;
 update emb_planos set status='CANCELADO',atualizado_em=now(),atualizado_por=p_ator where id=p_plano and status in('RASCUNHO','EM_EMBALAGEM');
 if not found then raise exception 'Plano não está em aberto';end if;
end$$;

create or replace view emb_v_resumo as
 select p.id,p.numero,p.pedido,p.montagem,p.status,p.criado_em,
  (select count(*) from emb_pallets x where x.plano_id=p.id) pallets,
  (select count(*) from emb_pallets x where x.plano_id=p.id and x.fechado_em is not null) fechados,
  (select count(*) from emb_pallets x where x.plano_id=p.id and x.status='INVALIDO') invalidos,
  wms_pedido_em_revisao(p.pedido) em_revisao
 from emb_planos p;

-- ================================================================ B. MRP por horizonte (mês atual, próximo mês, janela livre)
create or replace function erp_mrp_liquido_periodo(p_ini date,p_fim date)
returns table(produto_id uuid,codigo text,descricao text,classificacao text,necessidade_bruta numeric,saldo_livre numeric,em_compra numeric,em_producao numeric,necessidade_liquida numeric,acao text,prazo_mais_cedo date)
language sql stable as $$
 with bruta as (
  select m.produto_id,
   sum(greatest(0,m.necessidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=m.of_id and x.produto_id=m.produto_id and x.tipo='SAIDA' and x.estorno_de is null),0))) q,
   min(o.prazo) prazo
  from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id
  where o.status in ('PLANEJADA','LIBERADA') and (p_ini is null or o.prazo>=p_ini) and (p_fim is null or o.prazo<=p_fim) group by 1),
 saldo as (select produto_id,sum(fisico-bloqueado) livre from est_saldos group by 1),
 comp as (select i.produto_id,sum(i.quantidade-least(i.quantidade,i.quantidade_recebida)) q from cmp_pedido_itens i join cmp_pedidos p on p.id=i.pedido_id where p.status in ('EM_APROVACAO','APROVADO','PARCIAL') group by 1),
 prod as (
  select o.produto_estoque_id produto_id,
   sum(greatest(0,o.quantidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=o.id and x.produto_id=o.produto_estoque_id and x.tipo='ENTRADA' and x.estorno_de is null),0))) q
  from erp_ordens_fabricacao o where o.status in ('PLANEJADA','LIBERADA') and o.of_pai_id is not null group by 1)
 select p.id,p.codigo::text,p.descricao::text,p.classificacao::text,b.q::numeric,coalesce(s.livre,0)::numeric,coalesce(c.q,0)::numeric,coalesce(pr.q,0)::numeric,
  greatest(0,b.q-coalesce(s.livre,0)-coalesce(c.q,0)-coalesce(pr.q,0))::numeric,
  (case when b.q-coalesce(s.livre,0)-coalesce(c.q,0)-coalesce(pr.q,0)<=0 then 'OK' when p.classificacao in ('SEMIACABADO','ACABADO') then 'PRODUZIR' else 'COMPRAR' end)::text,
  b.prazo
 from bruta b join est_produtos p on p.id=b.produto_id left join saldo s on s.produto_id=b.produto_id left join comp c on c.produto_id=b.produto_id left join prod pr on pr.produto_id=b.produto_id
 order by 10 desc,b.prazo,p.codigo
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-08_31_embalagem_mrp_horizonte.sql','1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-08_31_embalagem_mrp_horizonte.sql','1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498','APLICAR',current_user,'APLICADA');
COMMIT;
