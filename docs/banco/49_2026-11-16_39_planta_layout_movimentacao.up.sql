-- GERADO do arquivo canônico 2026-11-16_39_planta_layout_movimentacao.sql; SHA256 fbdefc85fa18b078c2fca8caa9a6a57c0e96c159af234893723474254e6a30ab
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-15_38_mapa_fabrica_rastro.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-16_39_planta_layout_movimentacao.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-11-16_39_planta_layout_movimentacao.sql' and checksum<>'fbdefc85fa18b078c2fca8caa9a6a57c0e96c159af234893723474254e6a30ab') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
-- Planta desenhada da fábrica (editável), posição de peças individuais e movimentação por leitura de QR.

-- ================================================================ A. Planta
create table if not exists wms_plantas(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique,
 nome varchar(120) not null,
 largura integer not null default 100 check(largura between 20 and 400),
 altura integer not null default 60 check(altura between 20 and 400)
);
insert into wms_plantas(codigo,nome) values('FABRICA','Planta da fábrica') on conflict(codigo) do nothing;

create table if not exists wms_layout_blocos(
 id uuid primary key default gen_random_uuid(),
 planta_id uuid not null references wms_plantas(id) on delete cascade,
 tipo varchar(10) not null default 'SETOR' check(tipo in('SETOR','MAQUINA','TRILHO','CORREDOR','PORTA','TEXTO')),
 nome varchar(80) not null default '',
 setor_id uuid references wms_setores(id) on delete set null,
 endereco_id uuid references est_enderecos(id) on delete set null,
 etapa varchar(40) not null default '',
 x numeric(7,2) not null default 0, y numeric(7,2) not null default 0,
 w numeric(7,2) not null default 10 check(w>0), h numeric(7,2) not null default 6 check(h>0),
 cor varchar(9) not null default '#e2e8f0',
 atualizado_em timestamptz not null default now()
);
create index if not exists ix_wms_layout_planta on wms_layout_blocos(planta_id);

create or replace function wms_layout_salvar(p_planta text,p_blocos jsonb,p_ator text) returns integer language plpgsql as $$
declare v_pl uuid; v_n integer:=0; b jsonb;
begin
 select id into v_pl from wms_plantas where codigo=p_planta;
 if v_pl is null then raise exception 'Planta inexistente';end if;
 if jsonb_typeof(p_blocos)<>'array' then raise exception 'Layout inválido';end if;
 if jsonb_array_length(p_blocos)>400 then raise exception 'Layout excede 400 blocos';end if;
 delete from wms_layout_blocos where planta_id=v_pl;
 for b in select * from jsonb_array_elements(p_blocos) loop
  insert into wms_layout_blocos(planta_id,tipo,nome,setor_id,endereco_id,etapa,x,y,w,h,cor)
  values(v_pl,coalesce(nullif(b->>'tipo',''),'SETOR'),left(coalesce(b->>'nome',''),80),
   nullif(b->>'setor_id','')::uuid,nullif(b->>'endereco_id','')::uuid,left(coalesce(b->>'etapa',''),40),
   greatest(0,(b->>'x')::numeric),greatest(0,(b->>'y')::numeric),greatest(1,(b->>'w')::numeric),greatest(1,(b->>'h')::numeric),
   case when (b->>'cor') ~ '^#[0-9a-fA-F]{6}$' then b->>'cor' else '#e2e8f0' end);
  v_n:=v_n+1;
 end loop;
 return v_n;
end$$;

-- ================================================================ B. Peças com posição e histórico de movimentação
create table if not exists wms_peca_posicoes(
 pedido varchar(60) not null,
 peca varchar(120) not null,
 endereco_id uuid not null references est_enderecos(id) on delete restrict,
 desde timestamptz not null default now(),
 por varchar(160) not null,
 primary key(pedido,peca)
);
create index if not exists ix_wms_peca_pos_end on wms_peca_posicoes(endereco_id);

create table if not exists wms_movimentacoes(
 id bigserial primary key,
 tipo varchar(8) not null check(tipo in('PALLET','SOBRA','PECA')),
 ref varchar(180) not null,
 de_id uuid references est_enderecos(id), para_id uuid references est_enderecos(id),
 obs varchar(200) not null default '',
 por varchar(160) not null, em timestamptz not null default now()
);
create index if not exists ix_wms_mov_ref on wms_movimentacoes(tipo,ref,em desc);

-- Leitura do QR da peça/pallet/sobra + QR do endereço = localização atualizada, histórico e rastro por setor.
create or replace function wms_mover(p_tipo text,p_ref text,p_endereco text,p_ator text,p_pedido text default '',p_obs text default '') returns jsonb language plpgsql as $$
declare v_end record; v_tipo text:=upper(coalesce(p_tipo,'')); v_de uuid; v_de_setor text; v_pal uuid; v_sob uuid;
begin
 select e.id,e.codigo,e.bloqueado,e.motivo_bloqueio,e.ativo,s.codigo setor into v_end
  from est_enderecos e left join wms_setores s on s.id=e.setor_id where upper(e.codigo)=upper(trim(p_endereco)) order by e.ativo desc limit 1;
 if not found or not v_end.ativo then raise exception 'Endereço não encontrado ou inativo';end if;
 if v_end.bloqueado then raise exception 'Endereço bloqueado: %',coalesce(nullif(v_end.motivo_bloqueio,''),'sem motivo');end if;
 if v_tipo='PALLET' then
  select id into v_pal from pcp_pallets where codigo=trim(p_ref);
  if v_pal is null then raise exception 'Pallet não encontrado';end if;
  perform wms_pallet_alocar(v_pal,v_end.id,p_ator,coalesce(p_obs,''));
 elsif v_tipo='SOBRA' then
  select id,endereco_id into v_sob,v_de from wms_sobras where numero=nullif(regexp_replace(p_ref,'\D','','g'),'')::bigint and status in('DISPONIVEL','RESERVADA');
  if v_sob is null then raise exception 'Sobra não encontrada ou já baixada';end if;
  if v_de is not distinct from v_end.id then raise exception 'A sobra já está neste endereço';end if;
  update wms_sobras set endereco_id=v_end.id,atualizado_em=now() where id=v_sob;
  insert into wms_movimentacoes(tipo,ref,de_id,para_id,obs,por) values('SOBRA',trim(p_ref),v_de,v_end.id,coalesce(p_obs,''),p_ator);
 elsif v_tipo='PECA' then
  if coalesce(trim(p_pedido),'')='' or coalesce(trim(p_ref),'')='' then raise exception 'Peça exige pedido e código';end if;
  select pp.endereco_id,s.codigo into v_de,v_de_setor from wms_peca_posicoes pp join est_enderecos e on e.id=pp.endereco_id left join wms_setores s on s.id=e.setor_id where pp.pedido=trim(p_pedido) and pp.peca=trim(p_ref);
  if v_de is not distinct from v_end.id then raise exception 'A peça já está neste endereço';end if;
  insert into wms_peca_posicoes(pedido,peca,endereco_id,por) values(trim(p_pedido),trim(p_ref),v_end.id,p_ator)
   on conflict(pedido,peca) do update set endereco_id=excluded.endereco_id,desde=now(),por=excluded.por;
  insert into wms_movimentacoes(tipo,ref,de_id,para_id,obs,por) values('PECA',trim(p_pedido)||'|'||trim(p_ref),v_de,v_end.id,coalesce(p_obs,''),p_ator);
  if v_de_setor is not null and v_de_setor is distinct from v_end.setor then perform pcp_rastro_ler(p_pedido,p_ref,v_de_setor,'SAIDA',1,'',p_ator);end if;
  if v_end.setor is not null and v_end.setor is distinct from v_de_setor then perform pcp_rastro_ler(p_pedido,p_ref,v_end.setor,'ENTRADA',1,'',p_ator);end if;
 else raise exception 'Tipo inválido (PALLET, SOBRA ou PECA)';end if;
 return jsonb_build_object('tipo',v_tipo,'ref',p_ref,'endereco',v_end.codigo,'setor',v_end.setor);
end$$;

-- Localizador passa a incluir peças individuais
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
   from est_endereco_saldos es join est_produtos pr on pr.id=es.produto_id where es.quantidade>0
 union all
 select 'PECA', (pc.pedido || '|' || pc.peca)::text, pc.peca::text, ('Peça ' || pc.peca)::text, 1::numeric, pc.pedido::text, pc.endereco_id, pc.desde
   from wms_peca_posicoes pc;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-16_39_planta_layout_movimentacao.sql','fbdefc85fa18b078c2fca8caa9a6a57c0e96c159af234893723474254e6a30ab',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-16_39_planta_layout_movimentacao.sql','fbdefc85fa18b078c2fca8caa9a6a57c0e96c159af234893723474254e6a30ab','APLICAR',current_user,'APLICADA');
COMMIT;
