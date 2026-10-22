-- depends-on: 2026-11-02_25_pendencias_producao_estoque_financeiro.sql
-- scope: operational
-- migrate:up

-- ================================================================ A. SAC: anexos (fotos/PDF) e índice de reclamação
create table if not exists sac_anexos(
 id uuid primary key default gen_random_uuid(),
 atendimento_id uuid not null references pcp_sac_atendimentos(id) on delete cascade,
 nome varchar(160) not null,
 mime varchar(40) not null check(mime in('image/jpeg','image/png','image/webp','application/pdf')),
 tamanho integer not null check(tamanho>0 and tamanho<=3145728),
 conteudo bytea not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(octet_length(conteudo)=tamanho)
);
create index if not exists ix_sac_anexos_atend on sac_anexos(atendimento_id,criado_em);
create or replace function sac_anexos_limite() returns trigger language plpgsql as $$
begin
 if (select count(*) from sac_anexos where atendimento_id=new.atendimento_id)>=10 then raise exception 'Limite de 10 anexos por atendimento';end if;
 return new;
end$$;
drop trigger if exists sac_anexos_limite_t on sac_anexos;
create trigger sac_anexos_limite_t before insert on sac_anexos for each row execute function sac_anexos_limite();

-- Índice de reclamação: atendimentos do tipo reclamação por 100 pedidos entregues, tempo de resolução, prazo e reincidência.
create or replace function sac_indice_reclamacao(p_ini date,p_fim date) returns jsonb language plpgsql stable as $$
declare v_tot integer;v_rec integer;v_ent integer;v_res jsonb;v_tipos jsonb;v_reinc integer;
begin
 if p_fim<p_ini then raise exception 'Período inválido';end if;
 select count(*),count(*) filter(where upper(tipo) in('RECLAMACAO','RECLAMAÇÃO','DEFEITO','GARANTIA')) into v_tot,v_rec from pcp_sac_atendimentos where criado_em::date between p_ini and p_fim;
 select count(distinct r.pedido_venda_id) into v_ent from exp_remessas r where r.status='ENTREGUE' and r.entregue_em::date between p_ini and p_fim;
 select jsonb_build_object('concluidos',count(*),'diasMedios',round(avg(extract(epoch from concluido_em-criado_em)/86400)::numeric,2),
  'noPrazo',count(*) filter(where prazo is null or concluido_em::date<=prazo)) into v_res
  from pcp_sac_atendimentos where status='CONCLUIDO' and concluido_em is not null and criado_em::date between p_ini and p_fim;
 select coalesce(jsonb_agg(jsonb_build_object('tipo',tipo,'total',c) order by c desc),'[]'::jsonb) into v_tipos from(select tipo,count(*) c from pcp_sac_atendimentos where criado_em::date between p_ini and p_fim group by 1) x;
 select count(*) into v_reinc from(select cliente from pcp_sac_atendimentos where criado_em::date between p_ini and p_fim group by cliente having count(*)>1) x;
 return jsonb_build_object('periodo',jsonb_build_array(p_ini,p_fim),'atendimentos',v_tot,'reclamacoes',v_rec,'pedidosEntregues',v_ent,
  'por100Pedidos',case when v_ent>0 then round(100.0*v_rec/v_ent,2) end,'resolucao',v_res,'porTipo',v_tipos,'clientesReincidentes',v_reinc);
end$$;

-- ================================================================ B. Qualidade: importação de medições em lote (tudo ou nada)
create or replace function qld_medir_lote(p_lote uuid,p_medicoes jsonb,p_instr uuid,p_ator text) returns integer language plpgsql as $$
declare m jsonb;n integer:=0;
begin
 if jsonb_typeof(p_medicoes)<>'array' or jsonb_array_length(p_medicoes)=0 then raise exception 'Nenhuma medição para importar';end if;
 if jsonb_array_length(p_medicoes)>2000 then raise exception 'Máximo de 2000 medições por importação';end if;
 for m in select value from jsonb_array_elements(p_medicoes) loop
  begin
   perform qld_medir(p_lote,(m->>'linha')::integer,(m->>'valor')::numeric,coalesce(nullif(m->>'instrumentoId','')::uuid,p_instr),p_ator);
  exception when others then
   raise exception 'Linha % (característica %): %',n+1,m->>'linha',sqlerrm;
  end;
  n:=n+1;
 end loop;
 return n;
end$$;

-- ================================================================ C. OEE completo no painel (disponibilidade x desempenho x qualidade)
create or replace function ind_painel(p_ini date,p_fim date) returns jsonb language plpgsql stable as $$
declare
 v_otif jsonb;v_lead jsonb;v_giro jsonb;v_ppm jsonb;v_oee jsonb;v_com jsonb;v_cart jsonb;
 v_dias integer:=greatest(1,p_fim-p_ini+1);
 v_hoje date:=p_fim;
begin
 if p_fim<p_ini then raise exception 'Período inválido';end if;
 -- OTIF: pedidos com entrega prevista no período; no prazo = última entrega <= data prevista; completo = entregue >= pedido
 with ped as(
  select v.id,v.data_entrega,
   (select coalesce(sum(quantidade),0) from crm_pedido_venda_itens i where i.pedido_id=v.id) qtd,
   (select coalesce(sum(ri.quantidade),0) from exp_remessa_itens ri join exp_remessas r on r.id=ri.remessa_id where r.pedido_venda_id=v.id and r.status='ENTREGUE') ent,
   (select max(r.entregue_em)::date from exp_remessas r where r.pedido_venda_id=v.id and r.status='ENTREGUE') ult
  from crm_pedidos_venda v where v.data_entrega between p_ini and p_fim and v.status not in ('RASCUNHO','EM_APROVACAO','CANCELADO')),
 f as(select *,(ult is not null and ult<=data_entrega) ot,(qtd>0 and ent>=qtd) inf from ped)
 select jsonb_build_object('pedidos',count(*),'noPrazo',count(*) filter(where ot),'completos',count(*) filter(where inf),
  'otif',count(*) filter(where ot and inf),'percentual',case when count(*)>0 then round(100.0*count(*) filter(where ot and inf)/count(*),1) end) into v_otif from f;
 select jsonb_build_object('ofsConcluidas',count(*),'leadTimeDias',round(avg(extract(epoch from concluido_em-liberado_em)/86400)::numeric,2),
  'noPrazo',count(*) filter(where concluido_em::date<=prazo)) into v_lead
  from erp_ordens_fabricacao where status='CONCLUIDA' and liberado_em is not null and concluido_em::date between p_ini and p_fim;
 -- Giro (anualizado) = custo das saídas no período / valor atual em estoque
 with sai as(select coalesce(sum(custo_total),0) v from est_movimentos where tipo='SAIDA' and criado_em::date between p_ini and p_fim),
 est as(select coalesce(sum(s.fisico*coalesce(exp_custo_medio(s.produto_id,s.local_id),0)),0) v from est_saldos s)
 select jsonb_build_object('custoSaidas',round(sai.v,2),'valorEstoque',round(est.v,2),
  'giroAnualizado',case when est.v>0 then round(sai.v*365.0/v_dias/est.v,2) end) into v_giro from sai,est;
 select jsonb_build_object('inspecionado',coalesce(sum(quantidade),0),'bloqueado',coalesce(sum(qtd_bloqueada),0),
  'ppm',case when sum(quantidade)>0 then round(1000000*sum(qtd_bloqueada)/sum(quantidade)) end) into v_ppm
  from qld_lotes_inspecao where status in('APROVADO','REPROVADO','SUCATEADO','QUARENTENA') and criado_em::date between p_ini and p_fim;
 -- OEE parcial: disponibilidade (paradas registradas) x qualidade (refugo); desempenho não é medido
 with at as(select count(*) n from mnt_ativos where ativo),
 par as(select coalesce(sum(extract(epoch from least(coalesce(fim,(p_fim+1)::timestamptz),(p_fim+1)::timestamptz)-greatest(inicio,p_ini::timestamptz))/3600),0) h
   from mnt_paradas where inicio<(p_fim+1)::timestamptz and coalesce(fim,(p_fim+1)::timestamptz)>p_ini::timestamptz),
 pf as(
   select case when sum(x.min_real)>0 then round(least(1,sum(x.min_ideal)/sum(x.min_real))::numeric,4) end perf,
    case when count(*)>0 then round(100.0*count(*) filter(where x.min_real>0)/count(*),1) end cob
   from(select h.minutos min_real,
     coalesce((po.roteiro_snapshot->>'setup')::numeric,0)+coalesce((select sum((a.ciclo_payload->>'boa')::numeric) from pcp_apontamentos a where a.operacao_id=po.id and a.tipo='CICLO' and a.estoque_status='PROCESSADO'),0)*coalesce((po.roteiro_snapshot->>'ciclo')::numeric,0) min_ideal
    from cst_horas_of h join pcp_operacoes po on po.id=h.operacao_id where h.informado_em::date between p_ini and p_fim) x),
 ap as(select coalesce(sum(quantidade) filter(where tipo in('PRODUCAO','FINALIZACAO')),0) bom,coalesce(sum(quantidade) filter(where tipo='REFUGO'),0) ref
   from pcp_apontamentos where data_producao between p_ini and p_fim)
 select jsonb_build_object('disponibilidade',case when at.n>0 then round(greatest(0,1-par.h/(at.n*24.0*v_dias))::numeric,4) end,
  'qualidade',case when ap.bom+ap.ref>0 then round((ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'desempenho',pf.perf,'coberturaDesempenho',pf.cob,
  'oeeParcial',case when at.n>0 and ap.bom+ap.ref>0 then round((greatest(0,1-par.h/(at.n*24.0*v_dias))*ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'oee',case when at.n>0 and ap.bom+ap.ref>0 and pf.perf is not null then round((greatest(0,1-par.h/(at.n*24.0*v_dias))*ap.bom/(ap.bom+ap.ref)*pf.perf)::numeric,4) end,
  'observacao','Desempenho = minutos padrão (setup + boas x ciclo) / minutos reais apontados em cst_horas_of; cobertura = operações com horas informadas.') into v_oee from at,par,ap,pf;
 select coalesce(jsonb_object_agg(status,v),'{}'::jsonb) into v_com from(select status,round(sum(valor),2) v from crm_comissoes where competencia between to_char(p_ini,'YYYY-MM') and to_char(p_fim,'YYYY-MM') group by status) x;
 select jsonb_build_object('pedidosAbertos',count(*),'saldoAFaturar',coalesce(round(sum(total-faturado_valor),2),0),
  'atrasados',count(*) filter(where data_entrega<v_hoje),'saldoAtrasado',coalesce(round(sum(total-faturado_valor) filter(where data_entrega<v_hoje),2),0)) into v_cart
  from crm_pedidos_venda where status in('APROVADO','EM_PRODUCAO','PARCIAL');
 return jsonb_build_object('periodo',jsonb_build_array(p_ini,p_fim),'otif',v_otif,'leadTime',v_lead,'giro',v_giro,'ppm',v_ppm,'oee',v_oee,'comissoes',v_com,'carteira',v_cart);
end$$;

-- migrate:down
drop function if exists qld_medir_lote(uuid,jsonb,uuid,text);
drop function if exists sac_indice_reclamacao(date,date);
drop trigger if exists sac_anexos_limite_t on sac_anexos;
drop function if exists sac_anexos_limite();
drop table if exists sac_anexos;
create or replace function ind_painel(p_ini date,p_fim date) returns jsonb language plpgsql stable as $$
declare
 v_otif jsonb;v_lead jsonb;v_giro jsonb;v_ppm jsonb;v_oee jsonb;v_com jsonb;v_cart jsonb;
 v_dias integer:=greatest(1,p_fim-p_ini+1);
 v_hoje date:=p_fim;
begin
 if p_fim<p_ini then raise exception 'Período inválido';end if;
 -- OTIF: pedidos com entrega prevista no período; no prazo = última entrega <= data prevista; completo = entregue >= pedido
 with ped as(
  select v.id,v.data_entrega,
   (select coalesce(sum(quantidade),0) from crm_pedido_venda_itens i where i.pedido_id=v.id) qtd,
   (select coalesce(sum(ri.quantidade),0) from exp_remessa_itens ri join exp_remessas r on r.id=ri.remessa_id where r.pedido_venda_id=v.id and r.status='ENTREGUE') ent,
   (select max(r.entregue_em)::date from exp_remessas r where r.pedido_venda_id=v.id and r.status='ENTREGUE') ult
  from crm_pedidos_venda v where v.data_entrega between p_ini and p_fim and v.status not in ('RASCUNHO','EM_APROVACAO','CANCELADO')),
 f as(select *,(ult is not null and ult<=data_entrega) ot,(qtd>0 and ent>=qtd) inf from ped)
 select jsonb_build_object('pedidos',count(*),'noPrazo',count(*) filter(where ot),'completos',count(*) filter(where inf),
  'otif',count(*) filter(where ot and inf),'percentual',case when count(*)>0 then round(100.0*count(*) filter(where ot and inf)/count(*),1) end) into v_otif from f;
 select jsonb_build_object('ofsConcluidas',count(*),'leadTimeDias',round(avg(extract(epoch from concluido_em-liberado_em)/86400)::numeric,2),
  'noPrazo',count(*) filter(where concluido_em::date<=prazo)) into v_lead
  from erp_ordens_fabricacao where status='CONCLUIDA' and liberado_em is not null and concluido_em::date between p_ini and p_fim;
 -- Giro (anualizado) = custo das saídas no período / valor atual em estoque
 with sai as(select coalesce(sum(custo_total),0) v from est_movimentos where tipo='SAIDA' and criado_em::date between p_ini and p_fim),
 est as(select coalesce(sum(s.fisico*coalesce(exp_custo_medio(s.produto_id,s.local_id),0)),0) v from est_saldos s)
 select jsonb_build_object('custoSaidas',round(sai.v,2),'valorEstoque',round(est.v,2),
  'giroAnualizado',case when est.v>0 then round(sai.v*365.0/v_dias/est.v,2) end) into v_giro from sai,est;
 select jsonb_build_object('inspecionado',coalesce(sum(quantidade),0),'bloqueado',coalesce(sum(qtd_bloqueada),0),
  'ppm',case when sum(quantidade)>0 then round(1000000*sum(qtd_bloqueada)/sum(quantidade)) end) into v_ppm
  from qld_lotes_inspecao where status in('APROVADO','REPROVADO','SUCATEADO','QUARENTENA') and criado_em::date between p_ini and p_fim;
 -- OEE parcial: disponibilidade (paradas registradas) x qualidade (refugo); desempenho não é medido
 with at as(select count(*) n from mnt_ativos where ativo),
 par as(select coalesce(sum(extract(epoch from least(coalesce(fim,(p_fim+1)::timestamptz),(p_fim+1)::timestamptz)-greatest(inicio,p_ini::timestamptz))/3600),0) h
   from mnt_paradas where inicio<(p_fim+1)::timestamptz and coalesce(fim,(p_fim+1)::timestamptz)>p_ini::timestamptz),
 ap as(select coalesce(sum(quantidade) filter(where tipo in('PRODUCAO','FINALIZACAO')),0) bom,coalesce(sum(quantidade) filter(where tipo='REFUGO'),0) ref
   from pcp_apontamentos where data_producao between p_ini and p_fim)
 select jsonb_build_object('disponibilidade',case when at.n>0 then round(greatest(0,1-par.h/(at.n*24.0*v_dias))::numeric,4) end,
  'qualidade',case when ap.bom+ap.ref>0 then round((ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'oeeParcial',case when at.n>0 and ap.bom+ap.ref>0 then round((greatest(0,1-par.h/(at.n*24.0*v_dias))*ap.bom/(ap.bom+ap.ref))::numeric,4) end,
  'observacao','Sem medição de desempenho (velocidade); OEE parcial = disponibilidade x qualidade') into v_oee from at,par,ap;
 select coalesce(jsonb_object_agg(status,v),'{}'::jsonb) into v_com from(select status,round(sum(valor),2) v from crm_comissoes where competencia between to_char(p_ini,'YYYY-MM') and to_char(p_fim,'YYYY-MM') group by status) x;
 select jsonb_build_object('pedidosAbertos',count(*),'saldoAFaturar',coalesce(round(sum(total-faturado_valor),2),0),
  'atrasados',count(*) filter(where data_entrega<v_hoje),'saldoAtrasado',coalesce(round(sum(total-faturado_valor) filter(where data_entrega<v_hoje),2),0)) into v_cart
  from crm_pedidos_venda where status in('APROVADO','EM_PRODUCAO','PARCIAL');
 return jsonb_build_object('periodo',jsonb_build_array(p_ini,p_fim),'otif',v_otif,'leadTime',v_lead,'giro',v_giro,'ppm',v_ppm,'oee',v_oee,'comissoes',v_com,'carteira',v_cart);
end$$;
