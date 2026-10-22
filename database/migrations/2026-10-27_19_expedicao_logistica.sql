-- depends-on: 2026-10-26_18_mrp_aps.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

create table if not exists exp_transportadoras(
 id uuid primary key default gen_random_uuid(),
 nome varchar(200) not null, documento varchar(40) not null default '',
 contato varchar(160) not null default '', ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists exp_remessas(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 pedido_venda_id uuid not null references crm_pedidos_venda(id) on delete restrict,
 cliente_id uuid not null references crm_clientes(id),
 transportadora_id uuid references exp_transportadoras(id),
 local_id uuid not null references est_locais(id),
 status varchar(10) not null default 'ABERTA' check(status in ('ABERTA','SEPARANDO','FECHADA','ENTREGUE','CANCELADA')),
 frete numeric(16,2) not null default 0 check(frete>=0),
 previsao_entrega date,
 fechada_em timestamptz, entregue_em timestamptz,
 nota_numero varchar(40) not null default '',
 observacoes text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_exp_remessas_pedido on exp_remessas(pedido_venda_id,status);
create table if not exists exp_remessa_itens(
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 linha integer not null check(linha>0),
 pedido_linha integer not null,
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 movimento_id bigint references est_movimentos(id),
 primary key(remessa_id,linha)
);
create table if not exists exp_remessa_pallets(
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 pallet_id uuid not null references pcp_pallets(id),
 lido_por varchar(160) not null, lido_em timestamptz not null default now(),
 primary key(remessa_id,pallet_id)
);
create unique index if not exists ux_exp_pallet_unico on exp_remessa_pallets(pallet_id);
create table if not exists exp_ocorrencias(
 id bigserial primary key,
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 tipo varchar(20) not null default 'OUTRO' check(tipo in ('ATRASO','AVARIA','FALTA','RECUSA','OUTRO','ENTREGA')),
 descricao text not null, origem varchar(10) not null default 'INTERNA' check(origem in ('INTERNA','CLIENTE')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists exp_devolucoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 remessa_id uuid not null references exp_remessas(id),
 pedido_venda_id uuid not null references crm_pedidos_venda(id),
 produto_id uuid not null references est_produtos(id),
 quantidade numeric(16,3) not null check(quantidade>0),
 destino varchar(10) not null check(destino in ('ESTOQUE','QUARENTENA')),
 valor numeric(16,2) not null default 0 check(valor>=0),
 valor_aplicado numeric(16,2) not null default 0 check(valor_aplicado>=0),
 motivo text not null, local_id uuid not null references est_locais(id),
 movimento_id bigint references est_movimentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists exp_eventos_faturamento(
 id uuid primary key default gen_random_uuid(),
 remessa_id uuid not null unique references exp_remessas(id),
 status varchar(10) not null default 'PRONTO' check(status in ('PRONTO','ENVIADO','CANCELADO')),
 payload jsonb not null,
 criado_em timestamptz not null default now()
);
create table if not exists exp_portal_tokens(
 id uuid primary key default gen_random_uuid(),
 remessa_id uuid not null references exp_remessas(id) on delete cascade,
 token_hash char(64) not null unique,
 expira_em timestamptz not null,
 revogado_em timestamptz, usado_em timestamptz,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

-- ATP: disponível agora + produção planejada até a data (OFs abertas do item).
create or replace function exp_atp(p_prod uuid,p_qtd numeric,p_data date)
returns table(livre_agora numeric,producao_ate_data numeric,atp numeric,atende boolean)
language sql stable as $$
 with l as (select coalesce(sum(greatest(0,fisico-reservado-bloqueado)),0) v from est_saldos where produto_id=p_prod),
 pr as (select coalesce(sum(greatest(0,o.quantidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=o.id and x.produto_id=o.produto_estoque_id and x.tipo='ENTRADA' and x.estorno_de is null),0))),0) v
        from erp_ordens_fabricacao o where o.produto_estoque_id=p_prod and o.status in ('PLANEJADA','LIBERADA') and o.prazo<=p_data)
 select l.v::numeric,pr.v::numeric,(l.v+pr.v)::numeric,(l.v+pr.v)>=p_qtd from l,pr
$$;

-- Custo médio unitário do depósito (mesma fórmula do ciclo industrial: entradas - saídas / físico).
create or replace function exp_custo_medio(p_prod uuid,p_local uuid) returns numeric language sql stable as $$
 select greatest(0,coalesce(sum(case when m.tipo='ENTRADA' then m.custo_total when m.tipo='SAIDA' then -m.custo_total else 0 end),0))
  /nullif((select fisico from est_saldos where produto_id=p_prod and local_id=p_local),0)
 from est_movimentos m where m.produto_id=p_prod and (m.local_destino_id=p_local or m.local_origem_id=p_local)
$$;

-- Reserva de estoque para o pedido de venda (chave legada: est_movimentos.pedido = 'PV-<n>').
create or replace function exp_reservar(p_pedido uuid,p_prod uuid,p_local uuid,p_qtd numeric,p_ator text) returns bigint language plpgsql as $$
declare pv crm_pedidos_venda%rowtype;s est_saldos%rowtype;u text;v_id bigint;
begin
 select * into strict pv from crm_pedidos_venda where id=p_pedido;
 if pv.status not in ('APROVADO','EM_PRODUCAO','PARCIAL') then raise exception 'Pedido não está liberado para reserva (%)',pv.status;end if;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 select unidade_base into strict u from est_produtos where id=p_prod and ativo;
 insert into est_saldos(produto_id,local_id) values(p_prod,p_local) on conflict do nothing;
 select * into strict s from est_saldos where produto_id=p_prod and local_id=p_local for update;
 if s.fisico-s.reservado-s.bloqueado<p_qtd then raise exception 'SALDO_INSUFICIENTE: reserva (livre %)',s.fisico-s.reservado-s.bloqueado;end if;
 update est_saldos set reservado=reservado+p_qtd,atualizado_em=now() where produto_id=p_prod and local_id=p_local;
 insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,pedido,motivo,usuario)
 values('RESERVA',p_prod,p_local,p_qtd,p_qtd,u,'PV-'||pv.numero,'RESERVA PEDIDO DE VENDA',p_ator) returning id into v_id;
 return v_id;
end$$;

-- Leitura de pallet (QR) na remessa: só pallet liberado e do mesmo pedido.
create or replace function exp_ler_pallet(p_remessa uuid,p_codigo text,p_ator text) returns uuid language plpgsql as $$
declare r exp_remessas%rowtype;pv crm_pedidos_venda%rowtype;pl pcp_pallets%rowtype;
begin
 select * into strict r from exp_remessas where id=p_remessa for update;
 if r.status not in ('ABERTA','SEPARANDO') then raise exception 'Remessa % não aceita leitura',r.status;end if;
 select * into strict pv from crm_pedidos_venda where id=r.pedido_venda_id;
 select * into pl from pcp_pallets where codigo=trim(p_codigo);
 if not found then raise exception 'Pallet % não encontrado',trim(p_codigo);end if;
 if pl.status<>'LIBERADO' then raise exception 'Pallet % não liberado pela Qualidade/MSAC (status %)',pl.codigo,pl.status;end if;
 if pv.pedido_pcp<>'' and erp_norm_pedido(pl.pedido)<>erp_norm_pedido(pv.pedido_pcp) then raise exception 'Pallet % pertence a outro pedido (%)',pl.codigo,pl.pedido;end if;
 if exists(select 1 from exp_remessa_pallets x where x.pallet_id=pl.id) then raise exception 'Pallet % já foi lido em uma remessa',pl.codigo;end if;
 insert into exp_remessa_pallets(remessa_id,pallet_id,lido_por) values(p_remessa,pl.id,p_ator);
 update exp_remessas set status='SEPARANDO' where id=p_remessa and status='ABERTA';
 return pl.id;
end$$;

-- Fecha a carga: todos os pallets do pedido lidos e liberados; baixa estoque (e reserva); gera evento de faturamento.
create or replace function exp_fechar_remessa(p_remessa uuid,p_ator text) returns uuid language plpgsql as $$
declare r exp_remessas%rowtype;pv crm_pedidos_venda%rowtype;it record;pl record;s est_saldos%rowtype;u text;res numeric;v_mov bigint;
 enviado numeric;pedido_qtd numeric;v_custo numeric;tudo boolean=true;ev uuid;falta text;payload jsonb;novo text;
begin
 select * into strict r from exp_remessas where id=p_remessa for update;
 if r.status not in ('ABERTA','SEPARANDO') then raise exception 'Remessa % não pode ser fechada',r.status;end if;
 select * into strict pv from crm_pedidos_venda where id=r.pedido_venda_id for update;
 if not exists(select 1 from exp_remessa_itens where remessa_id=p_remessa) then raise exception 'Remessa sem itens';end if;
 if not exists(select 1 from exp_remessa_pallets where remessa_id=p_remessa) then raise exception 'Nenhum pallet lido na remessa';end if;
 -- pallets do mesmo pedido ainda não expedidos precisam estar lidos nesta carga
 select string_agg(pl2.codigo||' ('||pl2.status||')',', ') into falta from pcp_pallets pl2
  where pv.pedido_pcp<>'' and erp_norm_pedido(pl2.pedido)=erp_norm_pedido(pv.pedido_pcp)
    and not exists(select 1 from exp_remessa_pallets x where x.pallet_id=pl2.id);
 if falta is not null then raise exception 'Pallets do pedido não lidos/liberados na carga: %',falta;end if;
 if exists(select 1 from exp_remessa_pallets x join pcp_pallets p on p.id=x.pallet_id where x.remessa_id=p_remessa and p.status<>'LIBERADO') then raise exception 'Há pallet na carga que deixou de estar liberado';end if;
 for it in select * from exp_remessa_itens where remessa_id=p_remessa order by linha loop
  select unidade_base into strict u from est_produtos where id=it.produto_id;
  select * into strict s from est_saldos where produto_id=it.produto_id and local_id=r.local_id for update;
  select greatest(0,coalesce(sum(case when tipo='RESERVA' then quantidade_base when tipo='LIBERA_RESERVA' or (tipo='SAIDA' and baixa_reserva) then -quantidade_base else 0 end),0)) into res
   from est_movimentos where pedido='PV-'||pv.numero and produto_id=it.produto_id and local_origem_id=r.local_id;
  if s.fisico-s.bloqueado-(s.reservado-least(res,it.quantidade))<it.quantidade then raise exception 'SALDO_INSUFICIENTE: item % da remessa',it.linha;end if;
  v_custo=round(coalesce(exp_custo_medio(it.produto_id,r.local_id),0)*it.quantidade,6);
  update est_saldos set fisico=fisico-it.quantidade,reservado=reservado-least(res,it.quantidade),atualizado_em=now() where produto_id=it.produto_id and local_id=r.local_id;
  insert into est_movimentos(tipo,produto_id,local_origem_id,quantidade_base,quantidade_informada,unidade_informada,baixa_reserva,documento,pedido,motivo,usuario,custo_total)
  values('SAIDA',it.produto_id,r.local_id,it.quantidade,it.quantidade,u,least(res,it.quantidade)>0,'REMESSA '||r.numero,'PV-'||pv.numero,'EXPEDICAO',p_ator,v_custo) returning id into v_mov;
  update exp_remessa_itens set movimento_id=v_mov where remessa_id=p_remessa and linha=it.linha;
 end loop;
 update exp_remessas set status='FECHADA',fechada_em=now() where id=p_remessa;
 -- status do pedido conforme quantidade expedida acumulada
 for it in select i.linha,i.quantidade from crm_pedido_venda_itens i where i.pedido_id=pv.id loop
  select coalesce(sum(ri.quantidade),0) into enviado from exp_remessa_itens ri join exp_remessas rr on rr.id=ri.remessa_id where rr.pedido_venda_id=pv.id and rr.status in ('FECHADA','ENTREGUE') and ri.pedido_linha=it.linha;
  if enviado<it.quantidade then tudo=false;end if;
 end loop;
 novo=case when tudo then 'ATENDIDO' else 'PARCIAL' end;
 if pv.status in ('APROVADO','EM_PRODUCAO','PARCIAL') and pv.status<>novo and (novo='ATENDIDO' or pv.status<>'PARCIAL') then
  update crm_pedidos_venda set status=novo,atualizado_por=p_ator,atualizado_em=now() where id=pv.id;
  insert into crm_pedido_venda_historico(pedido_id,evento,de,para,usuario) values(pv.id,'EXPEDIDO',pv.status,novo,p_ator);
 end if;
 select jsonb_build_object('remessa',r.numero,'pedido_venda',pv.numero,'pedido_cliente',pv.pedido_cliente,'cliente_id',pv.cliente_id,'frete',r.frete,
   'itens',(select jsonb_agg(jsonb_build_object('produto',p.codigo,'descricao',p.descricao,'quantidade',ri.quantidade,'preco_unitario',round(pi.total/nullif(pi.quantidade,0),4),'valor',round(pi.total/nullif(pi.quantidade,0)*ri.quantidade,2)) order by ri.linha)
     from exp_remessa_itens ri join est_produtos p on p.id=ri.produto_id left join crm_pedido_venda_itens pi on pi.pedido_id=pv.id and pi.linha=ri.pedido_linha where ri.remessa_id=p_remessa),
   'pallets',(select jsonb_agg(p.codigo order by p.codigo) from exp_remessa_pallets x join pcp_pallets p on p.id=x.pallet_id where x.remessa_id=p_remessa)) into payload;
 insert into exp_eventos_faturamento(remessa_id,payload) values(p_remessa,payload) returning id into ev;
 return ev;
end$$;

create or replace function exp_entregar(p_remessa uuid,p_nota text,p_ator text) returns void language plpgsql as $$
begin
 update exp_remessas set status='ENTREGUE',entregue_em=now(),nota_numero=coalesce(nullif(p_nota,''),nota_numero) where id=p_remessa and status='FECHADA';
 if not found then raise exception 'Somente remessa fechada pode ser marcada como entregue';end if;
 insert into exp_ocorrencias(remessa_id,tipo,descricao,criado_por) values(p_remessa,'ENTREGA','Entrega confirmada',p_ator);
end$$;

-- Devolução: volta ao estoque (ou quarentena), reduz o faturado líquido e estorna a comissão proporcional.
create or replace function exp_devolver(p_remessa uuid,p_prod uuid,p_qtd numeric,p_destino text,p_motivo text,p_local uuid,p_ator text) returns uuid language plpgsql as $$
declare r exp_remessas%rowtype;pv crm_pedidos_venda%rowtype;enviado numeric;devolvido numeric;preco numeric;v_valor numeric;aplicar numeric;nova_dev numeric;
 lib numeric;v_cu numeric;ja_est numeric;devido numeric;est numeric;prov uuid;rep uuid;bas text;v_mov bigint;did uuid;
begin
 select * into strict r from exp_remessas where id=p_remessa for update;
 if r.status not in ('FECHADA','ENTREGUE') then raise exception 'Devolução só de remessa expedida';end if;
 if p_destino not in ('ESTOQUE','QUARENTENA') then raise exception 'Destino inválido';end if;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 if length(trim(coalesce(p_motivo,'')))<5 then raise exception 'Informe o motivo da devolução';end if;
 select * into strict pv from crm_pedidos_venda where id=r.pedido_venda_id for update;
 select coalesce(sum(quantidade),0) into enviado from exp_remessa_itens where remessa_id=p_remessa and produto_id=p_prod;
 select coalesce(sum(quantidade),0) into devolvido from exp_devolucoes where remessa_id=p_remessa and produto_id=p_prod;
 if enviado=0 then raise exception 'Produto não consta na remessa';end if;
 if devolvido+p_qtd>enviado then raise exception 'Devolução maior que o expedido (já devolvido %, expedido %)',devolvido,enviado;end if;
 select coalesce(sum(pi.total/nullif(pi.quantidade,0)*ri.quantidade)/nullif(sum(ri.quantidade),0),0) into preco
  from exp_remessa_itens ri join crm_pedido_venda_itens pi on pi.pedido_id=pv.id and pi.linha=ri.pedido_linha where ri.remessa_id=p_remessa and ri.produto_id=p_prod;
 v_valor=round(preco*p_qtd,2);
 select coalesce(sum(m.custo_total)/nullif(sum(m.quantidade_base),0),0) into v_cu from exp_remessa_itens ri join est_movimentos m on m.id=ri.movimento_id where ri.remessa_id=p_remessa and ri.produto_id=p_prod;
 v_mov=cmp_mov_estoque('ENTRADA',p_prod,p_local,p_qtd,'DEV REMESSA '||r.numero,'DEVOLUCAO CLIENTE',round(v_cu*p_qtd,6),p_ator);
 if p_destino='QUARENTENA' then update est_saldos set bloqueado=bloqueado+p_qtd where produto_id=p_prod and local_id=p_local;end if;
 aplicar=least(v_valor,greatest(0,pv.faturado_valor-pv.devolvido_valor));
 nova_dev=pv.devolvido_valor+aplicar;
 if aplicar>0 then
  update crm_pedidos_venda set devolvido_valor=nova_dev,atualizado_por=p_ator,atualizado_em=now() where id=pv.id;
  select id,representante_id,valor into prov,rep,devido from crm_comissoes where pedido_id=pv.id and tipo='PROVISAO' and status<>'ESTORNADA' limit 1;
  if prov is not null and pv.faturado_valor>0 then
   select coalesce(sum(valor),0) into lib from crm_comissoes where pedido_id=pv.id and tipo='LIBERACAO';
   select coalesce(-sum(valor),0) into ja_est from crm_comissoes where pedido_id=pv.id and tipo='ESTORNO';
   est=round(lib*nova_dev/pv.faturado_valor,2)-ja_est;
   if est>0 then
    select base into bas from crm_comissoes where id=prov;
    insert into crm_comissoes(pedido_id,representante_id,tipo,base,valor_base,valor,status,competencia,referencia_id,motivo,criado_por)
    values(pv.id,rep,'ESTORNO',bas,aplicar,-est,'A_PAGAR',to_char(now(),'YYYY-MM'),prov,'Devolução remessa '||r.numero,p_ator);
   end if;
  end if;
  insert into crm_pedido_venda_historico(pedido_id,evento,usuario,detalhe) values(pv.id,'DEVOLVER',p_ator,jsonb_build_object('valor',aplicar,'origem','expedicao','remessa',r.numero));
 end if;
 insert into exp_devolucoes(remessa_id,pedido_venda_id,produto_id,quantidade,destino,valor,valor_aplicado,motivo,local_id,movimento_id,criado_por)
 values(p_remessa,pv.id,p_prod,p_qtd,p_destino,v_valor,aplicar,p_motivo,p_local,v_mov,p_ator) returning id into did;
 return did;
end$$;

-- migrate:down
drop function if exists exp_devolver(uuid,uuid,numeric,text,text,uuid,text);
drop function if exists exp_entregar(uuid,text,text);
drop function if exists exp_fechar_remessa(uuid,text);
drop function if exists exp_ler_pallet(uuid,text,text);
drop function if exists exp_reservar(uuid,uuid,uuid,numeric,text);
drop function if exists exp_custo_medio(uuid,uuid);
drop function if exists exp_atp(uuid,numeric,date);
drop table if exists exp_portal_tokens;
drop table if exists exp_eventos_faturamento;
drop table if exists exp_devolucoes;
drop table if exists exp_ocorrencias;
drop table if exists exp_remessa_pallets;
drop table if exists exp_remessa_itens;
drop table if exists exp_remessas;
drop table if exists exp_transportadoras;
