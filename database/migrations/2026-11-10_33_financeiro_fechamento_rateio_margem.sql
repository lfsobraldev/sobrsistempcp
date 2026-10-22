-- depends-on: 2026-11-09_32_compras_qualidade_comercial.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

-- ============ A. Fechamento de período contábil/financeiro
create table if not exists fin_periodos(
 competencia char(7) primary key check(competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 status varchar(8) not null default 'ABERTO' check(status in('ABERTO','FECHADO')),
 fechado_por varchar(160), fechado_em timestamptz,
 observacao text not null default ''
);
create table if not exists fin_periodo_historico(
 id bigserial primary key, competencia char(7) not null, acao varchar(10) not null check(acao in('FECHOU','REABRIU')),
 motivo text not null default '', ator varchar(160) not null, em timestamptz not null default now()
);
create or replace function fin_periodo_fechado(p_comp text) returns boolean language sql stable as $$
 select exists(select 1 from fin_periodos where competencia=p_comp and status='FECHADO')$$;

create or replace function fin_periodo_fechar(p_comp text,p_obs text,p_ator text) returns jsonb language plpgsql as $$
declare v_pend int;v_d numeric;v_c numeric;v_ext int;v_ant text;
begin
 if p_comp !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida (AAAA-MM)';end if;
 if fin_periodo_fechado(p_comp) then raise exception 'PERIODO_FECHADO: % já está fechado',p_comp;end if;
 v_ant=to_char((p_comp||'-01')::date-interval '1 month','YYYY-MM');
 if exists(select 1 from fin_periodos where competencia<p_comp and status='ABERTO') then raise exception 'Feche os períodos anteriores primeiro (%)',(select min(competencia) from fin_periodos where competencia<p_comp and status='ABERTO');end if;
 select count(*) into v_pend from ctb_pendencias where to_char(data,'YYYY-MM')=p_comp;
 if v_pend>0 then raise exception 'PENDENCIA_CONTABIL: % evento(s) sem lançamento no período; reprocesse antes de fechar',v_pend;end if;
 select coalesce(sum(pa.debito),0),coalesce(sum(pa.credito),0) into v_d,v_c from ctb_partidas pa join ctb_lancamentos l on l.id=pa.lancamento_id where l.competencia=p_comp;
 if v_d<>v_c then raise exception 'DESBALANCEADO: débitos % x créditos %',v_d,v_c;end if;
 select count(*) into v_ext from fin_extratos where to_char(data,'YYYY-MM')=p_comp and baixa_id is null;
 insert into fin_periodos(competencia,status,fechado_por,fechado_em,observacao) values(p_comp,'FECHADO',p_ator,now(),coalesce(p_obs,''))
  on conflict(competencia) do update set status='FECHADO',fechado_por=p_ator,fechado_em=now(),observacao=coalesce(p_obs,'');
 insert into fin_periodo_historico(competencia,acao,motivo,ator) values(p_comp,'FECHOU',coalesce(p_obs,''),p_ator);
 return jsonb_build_object('competencia',p_comp,'debitos',v_d,'creditos',v_c,'extratos_sem_conciliar',v_ext);
end$$;

create or replace function fin_periodo_reabrir(p_comp text,p_motivo text,p_ator text) returns void language plpgsql as $$
begin
 if length(trim(coalesce(p_motivo,'')))<10 then raise exception 'Informe o motivo da reabertura (mín. 10 caracteres)';end if;
 if exists(select 1 from fin_periodos where competencia>p_comp and status='FECHADO') then raise exception 'Reabra primeiro os períodos posteriores';end if;
 update fin_periodos set status='ABERTO',fechado_por=null,fechado_em=null where competencia=p_comp and status='FECHADO';
 if not found then raise exception 'Período não está fechado';end if;
 insert into fin_periodo_historico(competencia,acao,motivo,ator) values(p_comp,'REABRIU',p_motivo,p_ator);
end$$;

create or replace function fin_trg_periodo_ctb() returns trigger language plpgsql as $$
begin
 if fin_periodo_fechado(new.competencia) then raise exception 'PERIODO_FECHADO: a competência % está fechada; reabra para lançar',new.competencia;end if;
 return new;
end$$;
drop trigger if exists fin_periodo_ctb_t on ctb_lancamentos;
create trigger fin_periodo_ctb_t before insert on ctb_lancamentos for each row execute function fin_trg_periodo_ctb();

create or replace function fin_trg_periodo_baixa() returns trigger language plpgsql as $$
begin
 if fin_periodo_fechado(to_char(new.data,'YYYY-MM')) then raise exception 'PERIODO_FECHADO: baixa em % bloqueada',to_char(new.data,'YYYY-MM');end if;
 return new;
end$$;
drop trigger if exists fin_periodo_baixa_t on fin_baixas;
create trigger fin_periodo_baixa_t before insert on fin_baixas for each row execute function fin_trg_periodo_baixa();

-- ============ B. Rateio de custos indiretos entre centros de custo
create table if not exists fin_rateio_regras(
 id uuid primary key default gen_random_uuid(),
 origem_id uuid not null references fin_centros_custo(id),
 destino_id uuid not null references fin_centros_custo(id),
 percentual numeric(7,4) not null check(percentual>0 and percentual<=100),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(origem_id,destino_id), check(origem_id<>destino_id)
);
create table if not exists fin_rateio_apuracoes(
 competencia char(7) not null, origem_id uuid not null references fin_centros_custo(id), destino_id uuid not null references fin_centros_custo(id),
 valor_origem numeric(16,2) not null, percentual numeric(7,4) not null, valor numeric(16,2) not null,
 apurado_por varchar(160) not null, apurado_em timestamptz not null default now(),
 primary key(competencia,origem_id,destino_id)
);
create or replace function fin_rateio_salvar(p_origem uuid,p_destinos jsonb,p_ator text) returns void language plpgsql as $$
declare t numeric;d jsonb;
begin
 if jsonb_typeof(p_destinos)<>'array' or jsonb_array_length(p_destinos)=0 then raise exception 'Informe os centros de destino';end if;
 select coalesce(sum((x->>'percentual')::numeric),0) into t from jsonb_array_elements(p_destinos) x;
 if round(t,4)<>100 then raise exception 'RATEIO_INVALIDO: percentuais somam % (deve ser 100)',t;end if;
 delete from fin_rateio_regras where origem_id=p_origem;
 for d in select value from jsonb_array_elements(p_destinos) loop
  insert into fin_rateio_regras(origem_id,destino_id,percentual,criado_por) values(p_origem,(d->>'destino')::uuid,(d->>'percentual')::numeric,p_ator);
 end loop;
end$$;
create or replace function fin_rateio_apurar(p_comp text,p_ator text) returns integer language plpgsql as $$
declare r record;v numeric;n int:=0;acc numeric;ult uuid;rr record;
begin
 if fin_periodo_fechado(p_comp) then raise exception 'PERIODO_FECHADO: % está fechado',p_comp;end if;
 delete from fin_rateio_apuracoes where competencia=p_comp;
 for r in select distinct origem_id from fin_rateio_regras loop
  select coalesce(sum(pa.debito-pa.credito),0) into v from ctb_partidas pa join ctb_lancamentos l on l.id=pa.lancamento_id
   where l.competencia=p_comp and pa.centro_custo_id=r.origem_id;
  acc=0;
  for rr in select destino_id,percentual from fin_rateio_regras where origem_id=r.origem_id order by percentual desc,destino_id loop
   ult=rr.destino_id;
   insert into fin_rateio_apuracoes(competencia,origem_id,destino_id,valor_origem,percentual,valor,apurado_por) values(p_comp,r.origem_id,rr.destino_id,v,rr.percentual,round(v*rr.percentual/100,2),p_ator);
   acc=acc+round(v*rr.percentual/100,2);n=n+1;
  end loop;
  if acc<>v then update fin_rateio_apuracoes set valor=valor+(v-acc) where competencia=p_comp and origem_id=r.origem_id and destino_id=ult;end if;
 end loop;
 return n;
end$$;

-- ============ C. Margem por pedido e por cliente
create or replace view fin_v_margem_pedido as
select v.id pedido_venda_id,v.numero,v.pedido_pcp,v.cliente_id,c.razao_social cliente,v.status,
 greatest(v.faturado_valor-v.devolvido_valor,0)::numeric(16,2) receita,
 coalesce((select sum(m.custo_total*m.sinal*-1) from est_movimentos m where m.pedido<>'' and m.pedido=v.pedido_pcp and m.tipo='SAIDA'),0)::numeric(16,2) custo_material,
 coalesce((select sum(cm.valor) from crm_comissoes cm where cm.pedido_id=v.id and cm.status<>'ESTORNADA'),0)::numeric(16,2) comissao,
 v.total::numeric(16,2) valor_pedido
from crm_pedidos_venda v join crm_clientes c on c.id=v.cliente_id where v.status<>'CANCELADO';
create or replace view fin_v_margem_pedido_calc as
select *,(receita-custo_material-comissao)::numeric(16,2) margem,
 case when receita>0 then round(100*(receita-custo_material-comissao)/receita,1) end margem_pct from fin_v_margem_pedido;
create or replace view fin_v_margem_cliente as
select cliente_id,cliente,count(*)::int pedidos,sum(receita)::numeric(16,2) receita,sum(custo_material)::numeric(16,2) custo,sum(comissao)::numeric(16,2) comissao,
 sum(margem)::numeric(16,2) margem,case when sum(receita)>0 then round(100*sum(margem)/sum(receita),1) end margem_pct
from fin_v_margem_pedido_calc group by cliente_id,cliente;

-- ============ D. Sugestão de conciliação (valor igual, sentido certo, vencimento próximo)
create or replace function fin_conciliar_sugestoes(p_conta uuid,p_tol_dias int default 7) returns table(extrato_id uuid,extrato_data date,extrato_desc text,valor numeric,titulo_id uuid,titulo_numero bigint,parceiro text,vencimento date,saldo_titulo numeric,dias int) language sql stable as $$
 select e.id,e.data,e.descricao::text,e.valor,t.id,t.numero,t.parceiro::text,t.vencimento,(t.valor-t.valor_baixado),abs(e.data-t.vencimento)::int
 from fin_extratos e join fin_titulos t on t.status in('ABERTO','PARCIAL')
  and ((e.valor>0 and t.tipo='RECEBER') or (e.valor<0 and t.tipo='PAGAR'))
  and abs(e.valor)=(t.valor-t.valor_baixado) and abs(e.data-t.vencimento)<=p_tol_dias
 where e.conta_id=p_conta and e.baixa_id is null
 order by e.data,abs(e.data-t.vencimento)$$;

-- ============ E. Prontidão fiscal para NF-e em homologação
create or replace function fis_prontidao() returns jsonb language plpgsql stable as $$
declare r jsonb:='[]'::jsonb;
begin
 r=r||jsonb_build_object('item','Emitente cadastrado','ok',exists(select 1 from fis_emitente));
 r=r||jsonb_build_object('item','Provedor ativo','ok',exists(select 1 from fis_provedores where ativo));
 r=r||jsonb_build_object('item','Ambiente em HOMOLOGAÇÃO','ok',not exists(select 1 from fis_provedores where ativo and ambiente='PRODUCAO'));
 r=r||jsonb_build_object('item','CFOPs cadastrados','ok',exists(select 1 from fis_cfop));
 r=r||jsonb_build_object('item','Regras fiscais ativas','ok',exists(select 1 from fis_regras));
 r=r||jsonb_build_object('item','Produtos com classificação fiscal','ok',exists(select 1 from fis_produto_fiscal));
 return r;
end$$;

-- migrate:down
drop function if exists fis_prontidao();
drop function if exists fin_conciliar_sugestoes(uuid,int);
drop view if exists fin_v_margem_cliente;
drop view if exists fin_v_margem_pedido_calc;
drop view if exists fin_v_margem_pedido;
drop function if exists fin_rateio_apurar(text,text);
drop function if exists fin_rateio_salvar(uuid,jsonb,text);
drop table if exists fin_rateio_apuracoes;
drop table if exists fin_rateio_regras;
drop trigger if exists fin_periodo_baixa_t on fin_baixas;
drop trigger if exists fin_periodo_ctb_t on ctb_lancamentos;
drop function if exists fin_trg_periodo_baixa();
drop function if exists fin_trg_periodo_ctb();
drop function if exists fin_periodo_reabrir(text,text,text);
drop function if exists fin_periodo_fechar(text,text,text);
drop function if exists fin_periodo_fechado(text);
drop table if exists fin_periodo_historico;
drop table if exists fin_periodos;
