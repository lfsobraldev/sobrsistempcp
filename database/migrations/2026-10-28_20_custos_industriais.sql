-- depends-on: 2026-10-27_19_expedicao_logistica.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

create table if not exists cst_taxas(
 id uuid primary key default gen_random_uuid(),
 centro_id uuid not null references pcp_capacidades_maquina(id) on delete cascade,
 custo_hora_mo numeric(14,4) not null default 0 check(custo_hora_mo>=0),
 custo_hora_maq numeric(14,4) not null default 0 check(custo_hora_maq>=0),
 gg_percentual numeric(8,4) not null default 0 check(gg_percentual between 0 and 1000),
 vigencia_inicio date not null default current_date,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(centro_id,vigencia_inicio)
);
create table if not exists cst_precos_padrao(
 produto_id uuid not null references est_produtos(id) on delete cascade,
 vigencia_inicio date not null default current_date,
 custo_unitario numeric(16,6) not null check(custo_unitario>=0),
 origem varchar(120) not null default 'MANUAL',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(produto_id,vigencia_inicio)
);
create table if not exists cst_padrao(
 id uuid primary key default gen_random_uuid(),
 produto_id uuid not null references est_produtos(id),
 data_ref date not null, lote numeric(16,3) not null default 1,
 material numeric(16,6) not null, mao_obra numeric(16,6) not null, maquina numeric(16,6) not null, gastos_gerais numeric(16,6) not null, total numeric(16,6) not null,
 detalhe jsonb not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_cst_padrao_prod on cst_padrao(produto_id,criado_em desc);
create table if not exists cst_horas_of(
 of_id uuid not null references erp_ordens_fabricacao(id) on delete cascade,
 operacao_id uuid not null references pcp_operacoes(id) on delete cascade,
 minutos numeric(12,2) not null check(minutos>=0),
 informado_por varchar(160) not null, informado_em timestamptz not null default now(),
 primary key(of_id,operacao_id)
);
create table if not exists cst_of_resultados(
 of_id uuid primary key references erp_ordens_fabricacao(id) on delete cascade,
 analise jsonb not null, calculado_em timestamptz not null default now(), calculado_por varchar(160) not null
);
create or replace function cst_padrao_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Custo padrão calculado é imutável; calcule uma nova versão';end$$;
drop trigger if exists cst_padrao_imutavel_t on cst_padrao;
create trigger cst_padrao_imutavel_t before update or delete on cst_padrao for each row execute function cst_padrao_imutavel();

create or replace function cst_preco(p_prod uuid,p_data date) returns numeric language sql stable as $$
 select custo_unitario from cst_precos_padrao where produto_id=p_prod and vigencia_inicio<=p_data order by vigencia_inicio desc limit 1
$$;
create or replace function cst_taxa(p_centro uuid,p_data date) returns table(mo numeric,maq numeric,gg numeric) language sql stable as $$
 select custo_hora_mo,custo_hora_maq,gg_percentual from cst_taxas where centro_id=p_centro and vigencia_inicio<=p_data order by vigencia_inicio desc limit 1
$$;

-- Custo padrão unitário da versão de produção vigente (BOM + roteiro): material + mão de obra + máquina + gastos gerais.
create or replace function cst_calc(p_prod uuid,p_data date,p_nivel int default 0,p_lote numeric default 1) returns jsonb language plpgsql stable as $$
declare v erp_versoes_producao%rowtype;it record;op jsonb;t record;mat numeric:=0;mo numeric:=0;maq numeric:=0;gg numeric:=0;preco numeric;sub jsonb;comps jsonb:='[]'::jsonb;ops jsonb:='[]'::jsonb;falt jsonb:='[]'::jsonb;
 min_un numeric;v_mo numeric;v_maq numeric;v_gg numeric;v_ops jsonb;
begin
 if p_nivel>8 then raise exception 'Estrutura com nível excessivo ou ciclo';end if;
 if p_lote<=0 then raise exception 'Lote inválido';end if;
 select * into v from erp_versoes_producao where produto_id=p_prod and inicio<=p_data and (fim is null or fim>=p_data) and minimo<=p_lote and (maximo is null or maximo>=p_lote) order by inicio desc limit 1;
 if not found then return null;end if;
 for it in select i.componente_id,i.quantidade,i.perda_percentual,pr.codigo,pr.classificacao from erp_estrutura_itens i join est_produtos pr on pr.id=i.componente_id where i.estrutura_id=v.estrutura_id order by pr.codigo loop
  sub=null;preco=null;
  if it.classificacao='SEMIACABADO' then sub=cst_calc(it.componente_id,p_data,p_nivel+1,greatest(1,p_lote*it.quantidade));preco=(sub->>'total')::numeric;end if;
  if preco is null then preco=cst_preco(it.componente_id,p_data);end if;
  if preco is null then falt=falt||to_jsonb(it.codigo);preco=0;end if;
  mat=mat+it.quantidade*(1+it.perda_percentual/100)*preco;
  comps=comps||jsonb_build_object('codigo',it.codigo,'quantidade',it.quantidade,'perda_percentual',it.perda_percentual,'preco',round(preco,6),'origem',case when sub is not null then 'SEMIACABADO' else 'PRECO_PADRAO' end);
 end loop;
 select operacoes into v_ops from erp_roteiros where id=v.roteiro_id;
 for op in select value from jsonb_array_elements(coalesce(v_ops,'[]'::jsonb)) loop
  min_un=coalesce((op->>'setup')::numeric,0)/p_lote+coalesce((op->>'ciclo')::numeric,0);
  select * into t from cst_taxa(nullif(op->>'centro_id','')::uuid,p_data);
  v_mo=min_un/60*coalesce(t.mo,0);v_maq=min_un/60*coalesce(t.maq,0);v_gg=(v_mo+v_maq)*coalesce(t.gg,0)/100;
  mo=mo+v_mo;maq=maq+v_maq;gg=gg+v_gg;
  if t.mo is null then falt=falt||to_jsonb('TAXA:'||coalesce(op->>'processo','?'));end if;
  ops=ops||jsonb_build_object('processo',op->>'processo','minutos_unitarios',round(min_un,6),'mao_obra',round(v_mo,6),'maquina',round(v_maq,6),'gastos_gerais',round(v_gg,6));
 end loop;
 return jsonb_build_object('produto_id',p_prod,'lote',p_lote,'material',round(mat,6),'mao_obra',round(mo,6),'maquina',round(maq,6),'gastos_gerais',round(gg,6),'total',round(mat+mo+maq+gg,6),
  'componentes',comps,'operacoes',ops,'pendencias',falt);
end$$;

create or replace function cst_calcular_padrao(p_prod uuid,p_data date,p_lote numeric,p_ator text) returns uuid language plpgsql as $$
declare c jsonb;v_id uuid;
begin
 c=cst_calc(p_prod,p_data,0,p_lote);
 if c is null then raise exception 'Produto sem versão de produção vigente (BOM + roteiro aprovados)';end if;
 insert into cst_padrao(produto_id,data_ref,lote,material,mao_obra,maquina,gastos_gerais,total,detalhe,criado_por)
 values(p_prod,p_data,p_lote,(c->>'material')::numeric,(c->>'mao_obra')::numeric,(c->>'maquina')::numeric,(c->>'gastos_gerais')::numeric,(c->>'total')::numeric,c,p_ator) returning id into v_id;
 return v_id;
end$$;

-- Padrão × real de uma OF, com variação de preço, quantidade (refugo × outros) e eficiência. Reconcilia: real - padrão = soma das variações.
create or replace function cst_of_analise(p_of uuid) returns jsonb language plpgsql stable as $$
declare o erp_ordens_fabricacao%rowtype;v_data date;v_boas numeric;v_refugo numeric;comp jsonb;op record;t record;
 v_comp uuid;v_q numeric;v_perda numeric;v_stdq numeric;v_realq numeric;v_realc numeric;v_price numeric;v_ref_units numeric;v_vp numeric;v_vq numeric;v_cref numeric;v_cout numeric;
 v_boa_k numeric;v_std_min numeric;v_real_min numeric;v_est boolean;v_std_c numeric;v_real_c numeric;v_efic numeric;v_cod text;
 mats jsonb:='[]'::jsonb;ops jsonb:='[]'::jsonb;sem jsonb:='[]'::jsonb;est_any boolean:=false;
 t_pad numeric:=0;t_real numeric:=0;t_preco numeric:=0;t_ref numeric:=0;t_out numeric:=0;t_efic numeric:=0;
begin
 select * into strict o from erp_ordens_fabricacao where id=p_of;
 if o.snapshot is null then raise exception 'OF sem snapshot do ciclo industrial: custo não disponível';end if;
 v_data=o.criado_em::date;
 select coalesce(sum(case when tipo='ENTRADA' and estorno_de is null then quantidade_base when tipo='SAIDA' and estorno_de is not null then -quantidade_base else 0 end),0) into v_boas from est_movimentos where of_id=o.id and produto_id=o.produto_estoque_id;
 select coalesce(sum((a.ciclo_payload->>'refugo')::numeric),0) into v_refugo from pcp_apontamentos a join pcp_operacoes po on po.id=a.operacao_id where po.of_id=o.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO';
 for comp in select value from jsonb_array_elements(coalesce(o.snapshot->'componentes','[]'::jsonb)) loop
  v_comp=(comp->>'componente_id')::uuid;v_q=(comp->>'quantidade')::numeric;v_perda=coalesce((comp->>'perda_percentual')::numeric,0);
  select codigo into v_cod from est_produtos where id=v_comp;
  v_stdq=v_boas*v_q*(1+v_perda/100);
  select coalesce(sum(case when tipo='SAIDA' and estorno_de is null then quantidade_base when tipo='ENTRADA' and estorno_de is not null then -quantidade_base else 0 end),0),
         coalesce(sum(case when tipo='SAIDA' and estorno_de is null then custo_total when tipo='ENTRADA' and estorno_de is not null then -custo_total else 0 end),0)
   into v_realq,v_realc from est_movimentos where of_id=o.id and produto_id=v_comp;
  v_price=cst_preco(v_comp,v_data);
  if v_price is null then sem=sem||to_jsonb(v_cod);v_price=case when v_realq>0 then v_realc/v_realq else 0 end;end if;
  select coalesce(sum(greatest(0,x.cons-v_boas)),0) into v_ref_units from (
   select coalesce((select sum((a.ciclo_payload->>'boa')::numeric+case when coalesce((a.ciclo_payload->>'consumirRefugo')::boolean,true) then (a.ciclo_payload->>'refugo')::numeric else 0 end) from pcp_apontamentos a where a.operacao_id=po.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO'),0) cons
   from pcp_operacoes po where po.of_id=o.id and exists(select 1 from jsonb_array_elements(coalesce(po.roteiro_snapshot->'componentes','[]'::jsonb)) z where (z->>'produto_id')::uuid=v_comp)) x;
  v_vp=v_realc-v_realq*v_price;v_vq=(v_realq-v_stdq)*v_price;
  if v_vq>0 then v_cref=least(v_vq,v_ref_units*v_q*(1+v_perda/100)*v_price);else v_cref=0;end if;
  v_cout=v_vq-v_cref;
  t_pad=t_pad+v_stdq*v_price;t_real=t_real+v_realc;t_preco=t_preco+v_vp;t_ref=t_ref+v_cref;t_out=t_out+v_cout;
  mats=mats||jsonb_build_object('codigo',v_cod,'qtd_padrao',round(v_stdq,3),'qtd_real',round(v_realq,3),'preco_padrao',round(v_price,6),'custo_padrao',round(v_stdq*v_price,2),'custo_real',round(v_realc,2),'var_preco',round(v_vp,2),'var_quantidade',round(v_vq,2),'causa_refugo',round(v_cref,2),'causa_outros',round(v_cout,2));
 end loop;
 for op in select po.id,po.processo,po.sequencia,po.roteiro_snapshot rs from pcp_operacoes po where po.of_id=o.id order by po.sequencia loop
  select coalesce(sum((a.ciclo_payload->>'boa')::numeric),0) into v_boa_k from pcp_apontamentos a where a.operacao_id=op.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO';
  continue when v_boa_k=0 and not exists(select 1 from cst_horas_of h where h.of_id=o.id and h.operacao_id=op.id);
  v_std_min=coalesce((op.rs->>'setup')::numeric,0)+v_boa_k*coalesce((op.rs->>'ciclo')::numeric,0);
  select minutos into v_real_min from cst_horas_of where of_id=o.id and operacao_id=op.id;
  v_est=v_real_min is null;if v_est then v_real_min=v_std_min;est_any=true;end if;
  select * into t from cst_taxa(nullif(op.rs->>'centro_id','')::uuid,v_data);
  v_std_c=v_std_min/60*(coalesce(t.mo,0)+coalesce(t.maq,0))*(1+coalesce(t.gg,0)/100);
  v_real_c=v_real_min/60*(coalesce(t.mo,0)+coalesce(t.maq,0))*(1+coalesce(t.gg,0)/100);
  v_efic=v_real_c-v_std_c;
  t_pad=t_pad+v_std_c;t_real=t_real+v_real_c;t_efic=t_efic+v_efic;
  if t.mo is null then sem=sem||to_jsonb('TAXA:'||op.processo);end if;
  ops=ops||jsonb_build_object('processo',op.processo,'sequencia',op.sequencia,'min_padrao',round(v_std_min,2),'min_real',round(v_real_min,2),'estimado',v_est,'custo_padrao',round(v_std_c,2),'custo_real',round(v_real_c,2),'var_eficiencia',round(v_efic,2));
 end loop;
 return jsonb_build_object('of',o.numero,'status',o.status,'boas',v_boas,'refugo',v_refugo,'material',mats,'operacoes',ops,'estimado',est_any,'pendencias',sem,
  'totais',jsonb_build_object('padrao',round(t_pad,2),'real',round(t_real,2),'variacao',round(t_real-t_pad,2),
    'padrao_unitario',case when v_boas>0 then round(t_pad/v_boas,4) end,'real_unitario',case when v_boas>0 then round(t_real/v_boas,4) end,
    'causas',jsonb_build_object('PRECO',round(t_preco,2),'REFUGO',round(t_ref,2),'PERDA_OUTROS',round(t_out,2),'EFICIENCIA',round(t_efic,2))));
end$$;

create or replace function cst_of_registrar(p_of uuid,p_ator text) returns jsonb language plpgsql as $$
declare a jsonb;
begin
 a=cst_of_analise(p_of);
 insert into cst_of_resultados(of_id,analise,calculado_por) values(p_of,a,p_ator)
 on conflict(of_id) do update set analise=excluded.analise,calculado_em=now(),calculado_por=excluded.calculado_por;
 return a;
end$$;

-- Valorização de estoque pelo razão de movimentos (entradas - saídas) × físico atual.
create or replace view cst_v_valorizacao as
select p.id produto_id,p.codigo,p.descricao,p.classificacao,coalesce(s.fisico,0) fisico,
 case when coalesce(s.fisico,0)>0 then greatest(0,coalesce(m.liq,0)) else 0 end valor,
 case when coalesce(s.fisico,0)>0 then greatest(0,coalesce(m.liq,0))/s.fisico end custo_medio,
 coalesce(cst_preco(p.id,current_date),(select pd.total/nullif(pd.lote,0) from cst_padrao pd where pd.produto_id=p.id order by pd.criado_em desc limit 1)) custo_padrao,
 (coalesce(s.fisico,0)>0 and coalesce(m.liq,0)<=0) sem_custo
from est_produtos p
left join (select produto_id,sum(fisico) fisico from est_saldos group by produto_id) s on s.produto_id=p.id
left join (select produto_id,sum(case when tipo='ENTRADA' then custo_total when tipo='SAIDA' then -custo_total else 0 end) liq from est_movimentos group by produto_id) m on m.produto_id=p.id
where p.ativo and (coalesce(s.fisico,0)>0 or m.liq is not null);

-- Margem real por pedido: receita líquida - custo expedido líquido de devoluções - comissão realizada.
create or replace view cst_v_margem_pedidos as
select p.id pedido_id,p.numero,p.cliente_id,c.razao_social cliente,p.representante_id,r.nome representante,p.data_emissao,
 (p.faturado_valor-p.devolvido_valor) receita,
 coalesce((select sum(m.custo_total) from exp_remessa_itens ri join exp_remessas rr on rr.id=ri.remessa_id join est_movimentos m on m.id=ri.movimento_id where rr.pedido_venda_id=p.id),0)
 -coalesce((select sum(m.custo_total) from exp_devolucoes d join est_movimentos m on m.id=d.movimento_id where d.pedido_venda_id=p.id),0) custo,
 coalesce((select sum(cm.valor) from crm_comissoes cm where cm.pedido_id=p.id and cm.tipo in('LIBERACAO','ESTORNO')),0) comissao
from crm_pedidos_venda p join crm_clientes c on c.id=p.cliente_id left join crm_representantes r on r.id=p.representante_id
where p.faturado_valor>0;

-- migrate:down
drop view if exists cst_v_margem_pedidos;
drop view if exists cst_v_valorizacao;
drop function if exists cst_of_registrar(uuid,text);
drop function if exists cst_of_analise(uuid);
drop function if exists cst_calcular_padrao(uuid,date,numeric,text);
drop function if exists cst_calc(uuid,date,int,numeric);
drop function if exists cst_taxa(uuid,date);
drop function if exists cst_preco(uuid,date);
drop table if exists cst_of_resultados;
drop table if exists cst_horas_of;
drop trigger if exists cst_padrao_imutavel_t on cst_padrao;
drop table if exists cst_padrao;
drop function if exists cst_padrao_imutavel();
drop table if exists cst_precos_padrao;
drop table if exists cst_taxas;
