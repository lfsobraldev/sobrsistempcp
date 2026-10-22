-- GERADO do arquivo canônico 2026-11-01_24_indicadores_integracoes.sql; SHA256 4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-31_23_manutencao_documentos.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-01_24_indicadores_integracoes.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-01_24_indicadores_integracoes.sql' and checksum<>'4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- Alertas proativos
create table if not exists sys_alertas(
 id uuid primary key default gen_random_uuid(),
 tipo varchar(20) not null check(tipo in ('OF_ATRASADA','RUPTURA','CALIBRACAO','CREDITO')),
 chave varchar(120) not null,
 severidade varchar(8) not null default 'MEDIA' check(severidade in ('BAIXA','MEDIA','ALTA')),
 mensagem text not null,
 link varchar(120) not null default '',
 criado_em timestamptz not null default now(),
 resolvido_em timestamptz
);
create unique index if not exists ux_sys_alertas_aberto on sys_alertas(tipo,chave) where resolvido_em is null;
create index if not exists ix_sys_alertas_aberto on sys_alertas(severidade,criado_em desc) where resolvido_em is null;

create or replace function sys_alertas_candidatos(p_hoje date) returns table(tipo text,chave text,severidade text,mensagem text,link text) language sql stable as $$
 select 'OF_ATRASADA','OF'||o.numero, case when p_hoje-o.prazo>7 then 'ALTA' else 'MEDIA' end,
  'OF '||o.numero||' atrasada '||(p_hoje-o.prazo)||' dia(s) (prazo '||to_char(o.prazo,'DD/MM/YYYY')||')','/ordens-fabricacao'
  from erp_ordens_fabricacao o where o.status in ('PLANEJADA','LIBERADA') and o.prazo<p_hoje
 union all
 select 'RUPTURA','P'||p.codigo,case when coalesce(s.disp,0)<=0 then 'ALTA' else 'MEDIA' end,
  'Estoque de '||p.codigo||' abaixo do mínimo ('||coalesce(s.disp,0)||' < '||p.estoque_minimo||')','/estoque'
  from est_produtos p left join lateral(select sum(fisico-reservado-bloqueado) disp from est_saldos where produto_id=p.id) s on true
  where p.ativo and p.estoque_minimo>0 and coalesce(s.disp,0)<p.estoque_minimo
 union all
 select 'CALIBRACAO','I'||i.codigo,case when i.calibracao_validade<p_hoje then 'ALTA' else 'MEDIA' end,
  case when i.calibracao_validade<p_hoje then 'Calibração VENCIDA: ' else 'Calibração vence em '||(i.calibracao_validade-p_hoje)||' dia(s): ' end||i.codigo,'/qualidade-inspecao'
  from qld_instrumentos i where i.ativo and i.calibracao_validade<=p_hoje+15
 union all
 select 'CREDITO','PV'||v.numero,'ALTA','Pedido de venda '||v.numero||' bloqueado por crédito (excedente R$ '||v.credito_excedente||')','/vendas'
  from crm_pedidos_venda v where v.bloqueio_credito and v.status='EM_APROVACAO'
$$;

create or replace function sys_emitir_evento(p_evento text,p_payload jsonb) returns integer language plpgsql as $$
declare v_n integer;
begin
 insert into sys_webhook_fila(webhook_id,evento,payload)
  select w.id,p_evento,p_payload from sys_webhooks w where w.ativo and p_evento=any(w.eventos);
 get diagnostics v_n=row_count;return v_n;
end$$;

create or replace function sys_gerar_alertas(p_hoje date) returns integer language plpgsql as $$
declare v_novos integer:=0;r record;
begin
 for r in select c.* from sys_alertas_candidatos(p_hoje) c
  where not exists(select 1 from sys_alertas a where a.tipo=c.tipo and a.chave=c.chave and a.resolvido_em is null)
 loop
  insert into sys_alertas(tipo,chave,severidade,mensagem,link) values(r.tipo,r.chave,r.severidade,r.mensagem,r.link);
  perform sys_emitir_evento('alerta.criado',jsonb_build_object('tipo',r.tipo,'chave',r.chave,'severidade',r.severidade,'mensagem',r.mensagem));
  v_novos:=v_novos+1;
 end loop;
 update sys_alertas a set resolvido_em=now() where a.resolvido_em is null
  and not exists(select 1 from sys_alertas_candidatos(p_hoje) c where c.tipo=a.tipo and c.chave=a.chave);
 return v_novos;
end$$;

-- ---------------------------------------------------------------- Tokens de API e webhooks
create table if not exists sys_tokens_api(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null,
 token_hash char(64) not null unique,
 prefixo varchar(10) not null,
 escopos text[] not null default array['leitura']::text[] check(escopos<@array['leitura','indicadores','alertas']::text[]),
 ativo boolean not null default true,
 expira_em timestamptz,
 ultimo_uso timestamptz,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 revogado_por varchar(160), revogado_em timestamptz
);

create table if not exists sys_webhooks(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null,
 url varchar(500) not null check(url ~ '^https://'),
 segredo varchar(80) not null,
 eventos text[] not null check(array_length(eventos,1)>0 and eventos<@array['alerta.criado','pedido.status','remessa.entregue']::text[]),
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

create table if not exists sys_webhook_fila(
 id bigserial primary key,
 webhook_id uuid not null references sys_webhooks(id) on delete cascade,
 evento varchar(40) not null,
 payload jsonb not null,
 status varchar(10) not null default 'PENDENTE' check(status in ('PENDENTE','ENVIADO','FALHA')),
 tentativas integer not null default 0,
 proxima_em timestamptz not null default now(),
 ultimo_erro text not null default '',
 criado_em timestamptz not null default now(),
 enviado_em timestamptz
);
create index if not exists ix_sys_webhook_fila on sys_webhook_fila(status,proxima_em);

create or replace function sys_trg_evento_pedido() returns trigger language plpgsql as $$
begin
 if new.status is distinct from old.status then
  perform sys_emitir_evento('pedido.status',jsonb_build_object('numero',new.numero,'de',old.status,'para',new.status,'total',new.total));
 end if;
 return new;
end$$;
drop trigger if exists sys_trg_evento_pedido_t on crm_pedidos_venda;
create trigger sys_trg_evento_pedido_t after update of status on crm_pedidos_venda for each row execute function sys_trg_evento_pedido();

create or replace function sys_trg_evento_remessa() returns trigger language plpgsql as $$
begin
 if new.status='ENTREGUE' and old.status is distinct from 'ENTREGUE' then
  perform sys_emitir_evento('remessa.entregue',jsonb_build_object('numero',new.numero,'pedido_venda_id',new.pedido_venda_id,'entregue_em',new.entregue_em));
 end if;
 return new;
end$$;
drop trigger if exists sys_trg_evento_remessa_t on exp_remessas;
create trigger sys_trg_evento_remessa_t after update of status on exp_remessas for each row execute function sys_trg_evento_remessa();

-- ---------------------------------------------------------------- Painel de indicadores (somente leitura)
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-01_24_indicadores_integracoes.sql','4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-01_24_indicadores_integracoes.sql','4caf9e1bf5252376bbd28a35db20e00899a470aa5d7d21c7f8a79e97b09935a3','APLICAR',current_user,'APLICADA');
COMMIT;
