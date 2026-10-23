-- depends-on: 2026-11-14_37_certificados_cadeia_custodia.sql
-- scope: operational
-- migrate:up
-- Mapa da fábrica: localizador unificado (pallets, sobras e estoque por endereço) e rastro de peças por setor (leitura de QR).

-- ================================================================ A. Localizador unificado
create or replace view wms_v_localizador as
 select 'PALLET'::text tipo, p.id::text ref, p.codigo codigo, ('Pallet ' || p.codigo)::text descricao, coalesce(p.quantidade,0)::numeric quantidade,
        p.pedido::text pedido, pp.endereco_id, pp.desde
   from pcp_pallets p join wms_pallet_posicoes pp on pp.pallet_id=p.id
 union all
 select 'SOBRA', s.id::text, ('S' || s.numero)::text,
        trim(concat_ws(' ', s.descricao, nullif(s.medida,''), nullif(s.material,''), nullif(s.acabamento,''), nullif(s.mao,'')))::text,
        s.quantidade, s.origem_pedido::text, s.endereco_id, s.criado_em
   from wms_sobras s where s.status in('DISPONIVEL','RESERVADA') and s.endereco_id is not null
 union all
 select 'ESTOQUE', pr.id::text, pr.codigo::text, pr.descricao::text, es.quantidade, ''::text, es.endereco_id, es.atualizado_em
   from est_endereco_saldos es join est_produtos pr on pr.id=es.produto_id where es.quantidade>0;

create or replace view wms_v_localizador_end as
 select l.tipo, l.ref, l.codigo, l.descricao, l.quantidade, l.pedido, l.desde,
        greatest(0, (current_date - l.desde::date))::int dias,
        e.id endereco_id, e.codigo endereco, e.rua, e.modulo, e.nivel, s.codigo setor, s.nome setor_nome
   from wms_v_localizador l
   join est_enderecos e on e.id=l.endereco_id
   left join wms_setores s on s.id=e.setor_id;

-- Peças sem endereço: sobras disponíveis e pallets ativos que ninguém sabe onde estão
create or replace view wms_v_sem_endereco as
 select 'SOBRA'::text tipo, s.id::text ref, ('S' || s.numero)::text codigo,
        trim(concat_ws(' ', s.descricao, nullif(s.medida,''), nullif(s.material,'')))::text descricao,
        s.quantidade, s.origem_pedido::text pedido, s.criado_em desde
   from wms_sobras s where s.status='DISPONIVEL' and s.endereco_id is null
 union all
 select 'PALLET', p.id::text, p.codigo::text, ('Pallet ' || p.codigo)::text, coalesce(p.quantidade,0), p.pedido::text, p.criado_em
   from pcp_pallets p
  where p.status in('LIBERADO','EM_LIBERACAO','AGUARDANDO_INSPECAO','BLOQUEADO')
    and not exists(select 1 from wms_pallet_posicoes pp where pp.pallet_id=p.id);

-- ================================================================ B. Rastro de peças por setor
create table if not exists pcp_rastro_leituras(
 id bigserial primary key,
 pedido varchar(60) not null,
 peca varchar(120) not null,
 setor_id uuid not null references wms_setores(id),
 evento varchar(10) not null check(evento in('ENTRADA','SAIDA','PROBLEMA')),
 quantidade numeric(16,3) not null default 1 check(quantidade>0),
 obs varchar(300) not null default '',
 por varchar(160) not null,
 em timestamptz not null default now()
);
create index if not exists ix_rastro_pedido on pcp_rastro_leituras(pedido,em);
create index if not exists ix_rastro_peca on pcp_rastro_leituras(pedido,peca,em);

create or replace function pcp_rastro_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Leitura de rastro é imutável';end$$;
drop trigger if exists pcp_rastro_imutavel_t on pcp_rastro_leituras;
create trigger pcp_rastro_imutavel_t before update or delete on pcp_rastro_leituras for each row execute function pcp_rastro_imutavel();

create or replace function pcp_rastro_ler(p_pedido text,p_peca text,p_setor text,p_evento text,p_qtd numeric,p_obs text,p_ator text) returns bigint language plpgsql as $$
declare v_set uuid; v_id bigint;
begin
 if coalesce(trim(p_pedido),'')='' or coalesce(trim(p_peca),'')='' then raise exception 'Informe pedido e peça';end if;
 select id into v_set from wms_setores where codigo=upper(trim(p_setor)) and ativo;
 if v_set is null then raise exception 'Setor inválido';end if;
 if upper(p_evento) not in('ENTRADA','SAIDA','PROBLEMA') then raise exception 'Evento inválido';end if;
 if upper(p_evento)='PROBLEMA' and length(trim(coalesce(p_obs,'')))<5 then raise exception 'Descreva o problema (mínimo 5 caracteres)';end if;
 insert into pcp_rastro_leituras(pedido,peca,setor_id,evento,quantidade,obs,por)
  values(trim(p_pedido),trim(p_peca),v_set,upper(p_evento),coalesce(nullif(p_qtd,0),1),coalesce(p_obs,''),p_ator) returning id into v_id;
 return v_id;
end$$;

-- Onde cada peça está agora (última leitura)
create or replace view pcp_v_rastro_atual as
 select distinct on (l.pedido,l.peca) l.pedido,l.peca,s.codigo setor,s.nome setor_nome,l.evento,l.quantidade,l.obs,l.por,l.em,
        greatest(0, extract(epoch from (now()-l.em))/86400)::numeric(10,1) dias_parada
   from pcp_rastro_leituras l join wms_setores s on s.id=l.setor_id
  order by l.pedido,l.peca,l.em desc,l.id desc;

-- Datas reais por pedido e setor (primeira entrada, última saída)
create or replace view pcp_v_rastro_setor_datas as
 select l.pedido,s.codigo setor,s.nome setor_nome,
        min(l.em) filter(where l.evento='ENTRADA') inicio_real,
        max(l.em) filter(where l.evento='SAIDA') fim_real,
        count(distinct l.peca) pecas,
        count(*) filter(where l.evento='PROBLEMA') problemas
   from pcp_rastro_leituras l join wms_setores s on s.id=l.setor_id
  group by l.pedido,s.codigo,s.nome;

-- Peças paradas: última leitura foi ENTRADA/PROBLEMA e já passaram mais de 2 dias
create or replace view pcp_v_rastro_paradas as
 select * from pcp_v_rastro_atual where evento in('ENTRADA','PROBLEMA') and dias_parada>=2;

-- migrate:down
drop view if exists pcp_v_rastro_paradas;
drop view if exists pcp_v_rastro_setor_datas;
drop view if exists pcp_v_rastro_atual;
drop function if exists pcp_rastro_ler(text,text,text,text,numeric,text,text);
drop trigger if exists pcp_rastro_imutavel_t on pcp_rastro_leituras;
drop function if exists pcp_rastro_imutavel();
drop table if exists pcp_rastro_leituras;
drop view if exists wms_v_sem_endereco;
drop view if exists wms_v_localizador_end;
drop view if exists wms_v_localizador;
