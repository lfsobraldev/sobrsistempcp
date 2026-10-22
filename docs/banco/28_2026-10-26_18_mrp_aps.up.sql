-- GERADO do arquivo canônico 2026-10-26_18_mrp_aps.sql; SHA256 ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-25_17_qualidade_inspecao.sql, 2026-10-22_09_historico_seguro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-26_18_mrp_aps.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-26_18_mrp_aps.sql' and checksum<>'ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create table if not exists erp_of_agenda(
 of_id uuid primary key references erp_ordens_fabricacao(id) on delete cascade,
 inicio_fixo date not null,
 motivo varchar(300) not null default '',
 atualizado_por varchar(160) not null,
 atualizado_em timestamptz not null default now()
);

-- Operações abertas das OFs integradas: base da carga por centro e do Gantt (ciclo em minutos por peça).
create or replace view erp_v_ops_abertas as
select o.id of_id,o.numero of_numero,o.prazo,o.status of_status,p.codigo produto,
 op.id operacao_id,op.sequencia,op.processo,
 nullif(op.roteiro_snapshot->>'centro_id','')::uuid centro_id,
 greatest(0,op.quantidade_planejada-coalesce(op.quantidade_produzida,0))::numeric restante,
 case when coalesce(op.quantidade_produzida,0)>0 then 0 else coalesce((op.roteiro_snapshot->>'setup')::numeric,0) end::numeric setup_min,
 coalesce((op.roteiro_snapshot->>'ciclo')::numeric,0)::numeric ciclo_min,
 (case when coalesce(op.quantidade_produzida,0)>0 then 0 else coalesce((op.roteiro_snapshot->>'setup')::numeric,0) end
  + greatest(0,op.quantidade_planejada-coalesce(op.quantidade_produzida,0))*coalesce((op.roteiro_snapshot->>'ciclo')::numeric,0))::numeric minutos
from erp_ordens_fabricacao o
join est_produtos p on p.id=o.produto_estoque_id
join pcp_operacoes op on op.of_id=o.id
where o.status in ('PLANEJADA','LIBERADA') and op.status<>'CONCLUIDA';

-- MRP de necessidade líquida: bruta (OFs abertas) − saldo livre − compras abertas − OFs em produção do próprio item.
create or replace function erp_mrp_liquido()
returns table(produto_id uuid,codigo text,descricao text,classificacao text,necessidade_bruta numeric,saldo_livre numeric,em_compra numeric,em_producao numeric,necessidade_liquida numeric,acao text,prazo_mais_cedo date)
language sql stable as $$
 with bruta as (
  select m.produto_id,
   sum(greatest(0,m.necessidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=m.of_id and x.produto_id=m.produto_id and x.tipo='SAIDA' and x.estorno_de is null),0))) q,
   min(o.prazo) prazo
  from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id where o.status in ('PLANEJADA','LIBERADA') group by 1),
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

-- Aprovar sugestão de OF: cria linha de programação "MRP" e gera a OF integrada (continua PLANEJADA até o CONFIRMAR).
create or replace function erp_mrp_gerar_of(p_emp uuid,p_fil uuid,p_prod uuid,p_qtd numeric,p_prazo date,p_local uuid,p_ator text) returns uuid language plpgsql as $$
declare cod text;des text;prog uuid;orig uuid;v_of uuid;
begin
 select codigo,descricao into strict cod,des from est_produtos where id=p_prod and ativo;
 if p_qtd<=0 then raise exception 'Quantidade inválida';end if;
 select id into prog from pcp_programacoes where origem='MRP' and status='ATIVA' and data_programacao=(now() at time zone 'America/Sao_Paulo')::date and not coalesce(arquivada,false) limit 1;
 if prog is null then
  insert into pcp_programacoes(pedido,cliente,origem,data_programacao,turno,status) values('MRP','MRP','MRP',(now() at time zone 'America/Sao_Paulo')::date,'A','ATIVA') returning id into prog;
 end if;
 insert into pcp_produtos(programacao_id,pedido,produto,descricao,quantidade,of)
 values(prog,'MRP-'||to_char(now() at time zone 'America/Sao_Paulo','YYYYMMDD'),cod,coalesce(nullif(des,''),cod),p_qtd,'MRP') returning id into orig;
 v_of=erp_ciclo_gerar(p_emp,p_fil,p_prod,p_qtd,p_prazo,p_local,'PENDENTE',true,orig,orig,null,p_ator);
 perform erp_ciclo_auditar(p_ator,'MRP_GERAR_OF','ORDEM_FABRICACAO',v_of::text,jsonb_build_object('produto',cod,'quantidade',p_qtd));
 return v_of;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-26_18_mrp_aps.sql','ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-26_18_mrp_aps.sql','ed352cf0db7557a3c9c5d36e6288e57c852f80abfb8019c55f1553944b435c48','APLICAR',current_user,'APLICADA');
COMMIT;
