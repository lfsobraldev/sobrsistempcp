-- depends-on: 2026-11-12_35_pessoas_ehs_projetos.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

-- ============ A. Naturezas de estoque e classificação dos almoxarifados
create table if not exists est_naturezas(
 codigo varchar(20) primary key, nome varchar(80) not null, ordem integer not null default 0,
 descricao varchar(200) not null default ''
);
insert into est_naturezas(codigo,nome,ordem,descricao) values
 ('MATERIA_PRIMA','Matéria-prima',10,'Madeira, MDF, finger e demais insumos recebidos'),
 ('COMPONENTE','Componentes e ferragens',20,'Itens comprados que entram na montagem'),
 ('EMBALAGEM','Embalagens',30,'Filme, cantoneira, pallet, fita'),
 ('EM_PROCESSO','Em processo (linha)',40,'Material já requisitado e em produção'),
 ('SEMIACABADO','Semiacabado',50,'Peças prontas de uma etapa, aguardando a próxima'),
 ('ACABADO','Produto acabado',60,'Pronto para expedição'),
 ('REVENDA','Revenda',70,'Itens comprados para revender'),
 ('QUARENTENA','Quarentena / bloqueado',80,'Aguardando decisão de qualidade'),
 ('REFUGO','Refugo e sucata',90,'Perdas e sobras sem reaproveitamento'),
 ('TERCEIROS','Em poder de terceiros',100,'Material enviado para beneficiamento')
on conflict(codigo) do nothing;
alter table est_locais add column if not exists natureza varchar(20) references est_naturezas(codigo);
alter table est_locais add column if not exists tipo_local varchar(14) not null default 'ALMOXARIFADO' check(tipo_local in('ALMOXARIFADO','LINHA','EXPEDICAO','EXTERNO','QUARENTENA'));
alter table est_locais add column if not exists responsavel varchar(160) not null default '';

create or replace function est_local_classificar(p_local uuid,p_natureza text,p_tipo text,p_resp text,p_ator text) returns void language plpgsql as $$
begin
 if p_natureza is not null and p_natureza<>'' and not exists(select 1 from est_naturezas where codigo=p_natureza) then raise exception 'Natureza inválida';end if;
 if p_tipo not in('ALMOXARIFADO','LINHA','EXPEDICAO','EXTERNO','QUARENTENA') then raise exception 'Tipo de local inválido';end if;
 update est_locais set natureza=nullif(p_natureza,''),tipo_local=p_tipo,responsavel=left(coalesce(p_resp,''),160) where id=p_local;
 if not found then raise exception 'Local inexistente';end if;
 perform erp_ciclo_auditar(p_ator,'CLASSIFICAR_LOCAL','EST_LOCAL',p_local::text,jsonb_build_object('natureza',p_natureza,'tipo',p_tipo));
end$$;

create or replace view est_v_saldo_natureza as
select coalesce(l.natureza,'SEM_NATUREZA') natureza,coalesce(n.nome,'Sem natureza definida') nome_natureza,coalesce(n.ordem,999) ordem,
 count(distinct l.id)::int locais,count(distinct s.produto_id) filter (where s.fisico<>0)::int produtos,
 coalesce(sum(s.fisico),0)::numeric(18,3) fisico,coalesce(sum(s.reservado),0)::numeric(18,3) reservado,coalesce(sum(s.bloqueado),0)::numeric(18,3) bloqueado,
 coalesce(sum(s.fisico-s.reservado-s.bloqueado),0)::numeric(18,3) disponivel
from est_locais l left join est_naturezas n on n.codigo=l.natureza left join est_saldos s on s.local_id=l.id
where l.ativo group by coalesce(l.natureza,'SEM_NATUREZA'),coalesce(n.nome,'Sem natureza definida'),coalesce(n.ordem,999);

-- ============ B. Conferência do consumo baixado por apontamento (teórico x físico)
create or replace view est_v_consumo_of as
select m.of_id,o.numero of_numero,o.pedido,m.produto_id,p.codigo,p.descricao,p.unidade_base unidade,
 coalesce(m.local_origem_id,m.local_destino_id) local_id,
 sum(case when m.tipo='SAIDA' then m.quantidade_base when m.tipo='ENTRADA' and m.estorno_de is not null then -m.quantidade_base else 0 end)::numeric(16,3) qtd_sistema,
 max(m.criado_em) ultimo_movimento
from est_movimentos m join erp_ordens_fabricacao o on o.id=m.of_id join est_produtos p on p.id=m.produto_id
where m.apontamento_id is not null and m.tipo in('SAIDA','ENTRADA')
group by m.of_id,o.numero,o.pedido,m.produto_id,p.codigo,p.descricao,p.unidade_base,coalesce(m.local_origem_id,m.local_destino_id)
having sum(case when m.tipo='SAIDA' then m.quantidade_base when m.tipo='ENTRADA' and m.estorno_de is not null then -m.quantidade_base else 0 end)>0;

create table if not exists est_consumo_conferencias(
 id uuid primary key default gen_random_uuid(),
 of_id uuid not null references erp_ordens_fabricacao(id),
 produto_id uuid not null references est_produtos(id),
 local_id uuid not null references est_locais(id),
 qtd_sistema numeric(16,3) not null check(qtd_sistema>=0),
 qtd_fisica numeric(16,3) not null check(qtd_fisica>=0),
 diferenca numeric(16,3) generated always as (qtd_fisica-qtd_sistema) stored,
 status varchar(10) not null check(status in('CONFERIDO','DIVERGENTE','AJUSTADO')),
 observacao varchar(400) not null default '',
 conferido_por varchar(160) not null, conferido_em timestamptz not null default now(),
 ajuste_movimento_id bigint, ajustado_por varchar(160), ajustado_em timestamptz,
 unique(of_id,produto_id,local_id)
);

create or replace function est_consumo_conferir(p_of uuid,p_prod uuid,p_local uuid,p_fisico numeric,p_obs text,p_ator text) returns text language plpgsql as $$
declare v_sis numeric;v_st text;c est_consumo_conferencias%rowtype;
begin
 if p_fisico is null or p_fisico<0 or p_fisico<>round(p_fisico,3) then raise exception 'Quantidade física inválida';end if;
 select qtd_sistema into v_sis from est_v_consumo_of where of_id=p_of and produto_id=p_prod and local_id=p_local;
 if v_sis is null then raise exception 'Não há consumo por apontamento para este item na OF';end if;
 select * into c from est_consumo_conferencias where of_id=p_of and produto_id=p_prod and local_id=p_local;
 if found and c.status='AJUSTADO' then raise exception 'AJUSTE_APLICADO: este consumo já foi ajustado';end if;
 v_st=case when p_fisico=v_sis then 'CONFERIDO' else 'DIVERGENTE' end;
 if v_st='DIVERGENTE' and length(trim(coalesce(p_obs,'')))<5 then raise exception 'DIVERGENCIA: explique a diferença (mín. 5 caracteres)';end if;
 insert into est_consumo_conferencias(of_id,produto_id,local_id,qtd_sistema,qtd_fisica,status,observacao,conferido_por) values(p_of,p_prod,p_local,v_sis,p_fisico,v_st,coalesce(p_obs,''),p_ator)
  on conflict(of_id,produto_id,local_id) do update set qtd_sistema=excluded.qtd_sistema,qtd_fisica=excluded.qtd_fisica,status=excluded.status,observacao=excluded.observacao,conferido_por=excluded.conferido_por,conferido_em=now();
 return v_st;
end$$;

-- Aplica o ajuste: consumo menor que o baixado devolve ao estoque; maior baixa a diferença. Passa pelo mesmo livro-razão (sem editar histórico).
create or replace function est_consumo_ajustar(p_conf uuid,p_ator text) returns bigint language plpgsql as $$
declare c est_consumo_conferencias%rowtype;v_id bigint;v_dif numeric;
begin
 select * into strict c from est_consumo_conferencias where id=p_conf for update;
 if c.status='AJUSTADO' then raise exception 'AJUSTE_APLICADO: já ajustado';end if;
 if c.status<>'DIVERGENTE' then raise exception 'Só divergências podem ser ajustadas';end if;
 v_dif=c.qtd_fisica-c.qtd_sistema;
 v_id=erp_ciclo_mov(case when v_dif<0 then 'ENTRADA' else 'SAIDA' end,c.produto_id,c.local_id,abs(v_dif),c.of_id,null,null,null,'CONF:'||c.id,p_ator);
 update est_consumo_conferencias set status='AJUSTADO',ajuste_movimento_id=v_id,ajustado_por=p_ator,ajustado_em=now() where id=p_conf;
 return v_id;
end$$;

create or replace view est_v_consumo_conferir as
select v.of_id,v.of_numero,v.pedido,v.produto_id,v.codigo,v.descricao,v.unidade,v.local_id,l.codigo local_codigo,v.qtd_sistema,
 c.id conferencia_id,coalesce(c.status,'PENDENTE') status,c.qtd_fisica,c.diferenca,c.observacao,c.conferido_por,c.conferido_em,v.ultimo_movimento
from est_v_consumo_of v join est_locais l on l.id=v.local_id left join est_consumo_conferencias c on c.of_id=v.of_id and c.produto_id=v.produto_id and c.local_id=v.local_id;

-- ============ C. Detecção de apontamentos em lote (muitos OFs pelo mesmo usuário em poucos minutos)
create or replace view est_v_apontamentos_em_lote as
select a.usuario,
 (date_trunc('hour',a.criado_em)+floor(extract(minute from a.criado_em)/10)*interval '10 minutes') janela,
 count(*)::int apontamentos,count(distinct a.of)::int ofs,min(a.criado_em) primeiro,max(a.criado_em) ultimo
from pcp_apontamentos a where a.tipo='CICLO' and coalesce(a.estoque_status,'')<>'ESTORNADO' and a.estorno_de is null
group by a.usuario,(date_trunc('hour',a.criado_em)+floor(extract(minute from a.criado_em)/10)*interval '10 minutes')
having count(distinct a.of)>=5;

-- migrate:down
drop view if exists est_v_apontamentos_em_lote;
drop view if exists est_v_consumo_conferir;
drop function if exists est_consumo_ajustar(uuid,text);
drop function if exists est_consumo_conferir(uuid,uuid,uuid,numeric,text,text);
drop table if exists est_consumo_conferencias;
drop view if exists est_v_consumo_of;
drop view if exists est_v_saldo_natureza;
drop function if exists est_local_classificar(uuid,text,text,text,text);
alter table est_locais drop column if exists responsavel;
alter table est_locais drop column if exists tipo_local;
alter table est_locais drop column if exists natureza;
drop table if exists est_naturezas;
