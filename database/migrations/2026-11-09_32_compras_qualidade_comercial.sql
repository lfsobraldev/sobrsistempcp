-- depends-on: 2026-11-08_31_embalagem_mrp_horizonte.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

-- ============ A. Cotação comparativa (menor preço x prazo x condição) com justificativa da escolha
alter table cmp_cotacao_propostas add column if not exists frete numeric(16,2) not null default 0 check(frete>=0);
alter table cmp_cotacao_propostas add column if not exists condicao_pagamento varchar(120) not null default '';
alter table cmp_cotacao_propostas add column if not exists validade date;
alter table cmp_cotacao_propostas add column if not exists motivo_escolha text not null default '';

create or replace view cmp_v_cotacao_comparativa as
select p.solicitacao_id,p.linha,p.fornecedor_id,f.razao_social fornecedor,p.preco_unitario,p.frete,p.prazo_dias,p.condicao_pagamento,p.validade,p.escolhida,p.motivo_escolha,
 i.quantidade,(p.preco_unitario*i.quantidade+p.frete)::numeric(16,2) total_proposta,
 rank() over(partition by p.solicitacao_id,p.linha order by p.preco_unitario*i.quantidade+p.frete) pos_preco,
 rank() over(partition by p.solicitacao_id,p.linha order by p.prazo_dias) pos_prazo,
 (p.preco_unitario*i.quantidade+p.frete)=min(p.preco_unitario*i.quantidade+p.frete) over(partition by p.solicitacao_id,p.linha) menor_preco
from cmp_cotacao_propostas p join cmp_solicitacao_itens i on i.solicitacao_id=p.solicitacao_id and i.linha=p.linha
join cmp_fornecedores f on f.id=p.fornecedor_id;

create or replace function cmp_cotacao_escolher(p_sol uuid,p_linha int,p_forn uuid,p_motivo text,p_ator text) returns void language plpgsql as $$
declare v_menor boolean;v_n int;
begin
 select count(*) into v_n from cmp_cotacao_propostas where solicitacao_id=p_sol and linha=p_linha;
 if v_n<2 then raise exception 'COTACAO_INSUFICIENTE: cotação comparativa exige ao menos 2 propostas';end if;
 select menor_preco into v_menor from cmp_v_cotacao_comparativa where solicitacao_id=p_sol and linha=p_linha and fornecedor_id=p_forn;
 if v_menor is null then raise exception 'Proposta inexistente';end if;
 if not v_menor and length(trim(coalesce(p_motivo,'')))<5 then raise exception 'JUSTIFICATIVA: escolha fora do menor preço exige justificativa';end if;
 update cmp_cotacao_propostas set escolhida=false where solicitacao_id=p_sol and linha=p_linha;
 update cmp_cotacao_propostas set escolhida=true,motivo_escolha=coalesce(p_motivo,'') where solicitacao_id=p_sol and linha=p_linha and fornecedor_id=p_forn;
end$$;

-- ============ B. Avaliação de fornecedores (OTD, qualidade, preço) + notas manuais
alter table qld_nao_conformidades add column if not exists fornecedor_id uuid references cmp_fornecedores(id) on delete set null;
create table if not exists cmp_fornecedor_avaliacoes(
 id uuid primary key default gen_random_uuid(),
 fornecedor_id uuid not null references cmp_fornecedores(id) on delete cascade,
 competencia char(7) not null check(competencia ~ '^\d{4}-\d{2}$'),
 nota_atendimento numeric(4,1) not null default 0 check(nota_atendimento between 0 and 10),
 nota_documentacao numeric(4,1) not null default 0 check(nota_documentacao between 0 and 10),
 observacao text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(fornecedor_id,competencia)
);
create or replace view cmp_v_fornecedor_score as
with ent as (
 select p.fornecedor_id,count(*) n,count(*) filter (where p.previsao is null or r.criado_em::date<=p.previsao) no_prazo
 from cmp_recebimentos r join cmp_pedidos p on p.id=r.pedido_id group by p.fornecedor_id),
nc as (select fornecedor_id,count(*) n from qld_nao_conformidades where fornecedor_id is not null and origem='FORNECEDOR' group by fornecedor_id),
av as (select fornecedor_id,avg((nota_atendimento+nota_documentacao)/2) nota from cmp_fornecedor_avaliacoes group by fornecedor_id)
select f.id fornecedor_id,f.razao_social,f.ativo,coalesce(e.n,0) recebimentos,
 case when coalesce(e.n,0)=0 then null else round(100.0*e.no_prazo/e.n,1) end otd_pct,
 coalesce(nc.n,0) ncs,
 round(av.nota,1) nota_manual,
 case when coalesce(e.n,0)=0 and av.nota is null then null else
  round(greatest(0,least(10,
   (case when coalesce(e.n,0)=0 then 7 else 10.0*e.no_prazo/e.n end)*0.45
   +greatest(0,10-coalesce(nc.n,0)*2)*0.35
   +coalesce(av.nota,7)*0.20)),1) end score,
 case when coalesce(e.n,0)=0 and av.nota is null then 'SEM_DADOS'
  when (case when coalesce(e.n,0)=0 then 7 else 10.0*e.no_prazo/e.n end)*0.45+greatest(0,10-coalesce(nc.n,0)*2)*0.35+coalesce(av.nota,7)*0.20>=8 then 'A'
  when (case when coalesce(e.n,0)=0 then 7 else 10.0*e.no_prazo/e.n end)*0.45+greatest(0,10-coalesce(nc.n,0)*2)*0.35+coalesce(av.nota,7)*0.20>=6 then 'B' else 'C' end classe
from cmp_fornecedores f left join ent e on e.fornecedor_id=f.id left join nc on nc.fornecedor_id=f.id left join av on av.fornecedor_id=f.id;

-- ============ C. CAPA com verificação de eficácia
alter table qld_nao_conformidades add column if not exists eficacia_prazo date;
alter table qld_nao_conformidades add column if not exists eficacia_ok boolean;
alter table qld_nao_conformidades add column if not exists eficacia_obs text not null default '';
alter table qld_nao_conformidades add column if not exists eficacia_por varchar(160);
alter table qld_nao_conformidades add column if not exists eficacia_em timestamptz;
alter table qld_nao_conformidades add column if not exists reincidencia_de uuid references qld_nao_conformidades(id) on delete set null;

create or replace function qld_encerrar_nc(p_nc uuid,p_ator text) returns void language plpgsql as $$
declare n qld_nao_conformidades%rowtype;pend int;tot int;
begin
 select * into strict n from qld_nao_conformidades where id=p_nc for update;
 if n.status='ENCERRADA' then raise exception 'NC já encerrada';end if;
 if length(trim(n.causa_raiz))<5 then raise exception 'Registre a causa raiz antes de encerrar';end if;
 select count(*),count(*) filter (where concluida_em is null) into tot,pend from qld_acoes where nc_id=p_nc;
 if tot=0 then raise exception 'Registre ao menos uma ação (corretiva/preventiva)';end if;
 if pend>0 then raise exception 'Há % ação(ões) pendente(s)',pend;end if;
 if n.eficacia_prazo is not null and n.eficacia_ok is null then raise exception 'EFICACIA_PENDENTE: verifique a eficácia da ação (prazo %) antes de encerrar',n.eficacia_prazo;end if;
 if n.eficacia_ok is false then raise exception 'EFICACIA_REPROVADA: ação ineficaz; registre nova ação e reabra a verificação';end if;
 update qld_nao_conformidades set status='ENCERRADA',encerrado_por=p_ator,encerrado_em=now() where id=p_nc;
end$$;

create or replace function qld_eficacia_definir_prazo(p_nc uuid,p_prazo date,p_ator text) returns void language plpgsql as $$
begin
 if p_prazo is null or p_prazo<current_date then raise exception 'Prazo de eficácia inválido';end if;
 update qld_nao_conformidades set eficacia_prazo=p_prazo,eficacia_ok=null,eficacia_em=null where id=p_nc and status<>'ENCERRADA';
 if not found then raise exception 'NC inexistente ou encerrada';end if;
end$$;

create or replace function qld_eficacia_verificar(p_nc uuid,p_ok boolean,p_obs text,p_ator text) returns void language plpgsql as $$
declare n qld_nao_conformidades%rowtype;
begin
 select * into strict n from qld_nao_conformidades where id=p_nc for update;
 if n.eficacia_prazo is null then raise exception 'Defina o prazo de verificação de eficácia';end if;
 if exists(select 1 from qld_acoes where nc_id=p_nc and concluida_em is null) then raise exception 'Conclua as ações antes de verificar a eficácia';end if;
 if length(trim(coalesce(p_obs,'')))<5 then raise exception 'Descreva a evidência da verificação';end if;
 update qld_nao_conformidades set eficacia_ok=p_ok,eficacia_obs=p_obs,eficacia_por=p_ator,eficacia_em=now() where id=p_nc;
end$$;

create or replace view qld_v_capa_eficacia as
select n.id,n.numero,n.origem,n.descricao,n.status,n.eficacia_prazo,n.eficacia_ok,
 case when n.status='ENCERRADA' then 'ENCERRADA' when n.eficacia_ok is false then 'INEFICAZ'
  when n.eficacia_prazo is not null and n.eficacia_ok is null and n.eficacia_prazo<current_date then 'VERIFICACAO_ATRASADA'
  when n.eficacia_prazo is not null and n.eficacia_ok is null then 'AGUARDANDO_VERIFICACAO' else 'EM_TRATAMENTO' end situacao
from qld_nao_conformidades n;

-- ============ D. Orçamento -> pedido -> revisão integrados
create or replace view vnd_v_pedido_revisoes as
select v.id pedido_venda_id,v.numero,v.pedido_pcp,v.status,v.total,
 (select count(*) from pcp_pedido_revisoes r where r.pedido=v.pedido_pcp) revisoes,
 exists(select 1 from pcp_pedido_revisoes r where r.pedido=v.pedido_pcp and r.status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA')) revisao_aberta,
 v.proposta_id
from crm_pedidos_venda v where v.pedido_pcp<>'';

-- ============ E. Funil comercial (orçamento -> pedido) para o painel
create or replace view vnd_v_funil as
select (select count(*) from crm_propostas where status in('ENVIADA','NEGOCIACAO')) propostas_abertas,
 (select coalesce(sum(total),0) from crm_propostas where status in('ENVIADA','NEGOCIACAO')) valor_propostas,
 (select count(*) from crm_propostas where status='ACEITA') aceitas,
 (select count(*) from crm_propostas p where status='ACEITA' and exists(select 1 from crm_pedidos_venda v where v.proposta_id=p.id and v.status<>'CANCELADO')) viraram_pedido,
 (select count(*) from crm_propostas where status='RECUSADA') recusadas;

-- migrate:down
drop view if exists vnd_v_funil;
drop view if exists vnd_v_pedido_revisoes;
drop view if exists qld_v_capa_eficacia;
create or replace function qld_encerrar_nc(p_nc uuid,p_ator text) returns void language plpgsql as $f$
declare n qld_nao_conformidades%rowtype;pend int;tot int;
begin
 select * into strict n from qld_nao_conformidades where id=p_nc for update;
 if n.status='ENCERRADA' then raise exception 'NC já encerrada';end if;
 if length(trim(n.causa_raiz))<5 then raise exception 'Registre a causa raiz antes de encerrar';end if;
 select count(*),count(*) filter (where concluida_em is null) into tot,pend from qld_acoes where nc_id=p_nc;
 if tot=0 then raise exception 'Registre ao menos uma ação (corretiva/preventiva)';end if;
 if pend>0 then raise exception 'Há % ação(ões) pendente(s)',pend;end if;
 update qld_nao_conformidades set status='ENCERRADA',encerrado_por=p_ator,encerrado_em=now() where id=p_nc;
end$f$;
drop function if exists qld_eficacia_verificar(uuid,boolean,text,text);
drop function if exists qld_eficacia_definir_prazo(uuid,date,text);
drop view if exists cmp_v_fornecedor_score;
drop table if exists cmp_fornecedor_avaliacoes;
drop function if exists cmp_cotacao_escolher(uuid,int,uuid,text,text);
drop view if exists cmp_v_cotacao_comparativa;
