-- depends-on: 2026-11-03_26_sac_qualidade_oee.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

-- ================================================================ A. Setores do armazém e posições
create table if not exists wms_setores(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique,
 nome varchar(120) not null,
 tipo varchar(14) not null check(tipo in('RECEBIMENTO','ESTOQUE','PRODUCAO','EMBALAGEM','EXPEDICAO','REVISAO','SOBRAS','QUARENTENA')),
 responsavel varchar(160) not null default '',
 ativo boolean not null default true,
 criado_por varchar(160) not null default 'sistema', criado_em timestamptz not null default now()
);
insert into wms_setores(codigo,nome,tipo) values
 ('RECEB','Recebimento','RECEBIMENTO'),('ESTOQUE','Estoque geral','ESTOQUE'),('PROD','Produção acabada','PRODUCAO'),
 ('EMB','Embalagem','EMBALAGEM'),('EXPED','Expedição','EXPEDICAO'),('REV','Revisão / aguardando decisão','REVISAO'),
 ('SOBRAS','Sobras de peças','SOBRAS'),('QUAR','Quarentena / bloqueado','QUARENTENA')
on conflict(codigo) do nothing;

alter table est_enderecos add column if not exists setor_id uuid references wms_setores(id);
alter table est_enderecos add column if not exists rua varchar(20) not null default '';
alter table est_enderecos add column if not exists modulo varchar(20) not null default '';
alter table est_enderecos add column if not exists nivel varchar(20) not null default '';
alter table est_enderecos add column if not exists tipo_posicao varchar(12) not null default 'PRATELEIRA';
alter table est_enderecos add column if not exists capacidade_pallets integer;
alter table est_enderecos add column if not exists bloqueado boolean not null default false;
alter table est_enderecos add column if not exists motivo_bloqueio varchar(200) not null default '';
do $$ begin
 if not exists(select 1 from pg_constraint where conname='ck_est_enderecos_tipo_posicao') then
  alter table est_enderecos add constraint ck_est_enderecos_tipo_posicao check(tipo_posicao in('PALLET','PRATELEIRA','CHAO','DOCA'));
 end if;
 if not exists(select 1 from pg_constraint where conname='ck_est_enderecos_cap_pallets') then
  alter table est_enderecos add constraint ck_est_enderecos_cap_pallets check(capacidade_pallets is null or capacidade_pallets>0);
 end if;
end $$;
create index if not exists ix_est_enderecos_setor on est_enderecos(setor_id);

-- ================================================================ B. Localização de pallets
create table if not exists wms_pallet_posicoes(
 pallet_id uuid primary key references pcp_pallets(id) on delete cascade,
 endereco_id uuid not null references est_enderecos(id) on delete restrict,
 desde timestamptz not null default now(), por varchar(160) not null
);
create index if not exists ix_wms_pallet_pos_end on wms_pallet_posicoes(endereco_id);
create table if not exists wms_pallet_movs(
 id bigserial primary key,
 pallet_id uuid not null references pcp_pallets(id) on delete cascade,
 de_id uuid references est_enderecos(id), para_id uuid references est_enderecos(id),
 motivo varchar(200) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

-- Revisão de pedido (declarada antes das funções que a consultam)
create table if not exists pcp_pedido_revisoes(
 id uuid primary key default gen_random_uuid(),
 pedido varchar(60) not null,
 numero integer not null check(numero>0),
 motivo text not null,
 solicitante varchar(160) not null default '',
 responsavel varchar(160) not null default '',
 prazo date not null,
 status varchar(20) not null default 'ABERTA' check(status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA','APLICADA','REJEITADA')),
 parecer text not null default '',
 aberta_em timestamptz not null default now(), atualizada_em timestamptz not null default now(),
 encerrada_em timestamptz, encerrada_por varchar(160) not null default '',
 criado_por varchar(160) not null,
 unique(pedido,numero)
);
create unique index if not exists ux_pcp_revisao_aberta on pcp_pedido_revisoes(pedido) where status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA');
create table if not exists pcp_pedido_revisao_itens(
 id uuid primary key default gen_random_uuid(),
 revisao_id uuid not null references pcp_pedido_revisoes(id) on delete cascade,
 linha integer not null check(linha>0),
 acao varchar(10) not null check(acao in('ACRESCENTA','SUBTRAI','ALTERA')),
 descricao varchar(300) not null,
 medida varchar(80) not null default '', material varchar(80) not null default '', acabamento varchar(80) not null default '', mao varchar(10) not null default '',
 qtd_antes numeric(16,3) not null default 0 check(qtd_antes>=0), qtd_depois numeric(16,3) not null default 0 check(qtd_depois>=0),
 destino varchar(14) not null default 'PENDENTE' check(destino in('PENDENTE','CANCELAR_OF','SOBRA','REFUGO','NAO_SE_APLICA')),
 endereco_destino_id uuid references est_enderecos(id),
 sobra_id uuid,
 unique(revisao_id,linha)
);

create or replace function wms_pedido_em_revisao(p_pedido text) returns boolean language sql stable as $$
 select exists(select 1 from pcp_pedido_revisoes where pedido=p_pedido and status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA'))
$$;

create or replace function wms_pallet_alocar(p_pallet uuid,p_endereco uuid,p_ator text,p_motivo text default '') returns bigint language plpgsql as $$
declare v_pal record;v_end record;v_tipo text;v_cap integer;v_ocup integer;v_de uuid;v_id bigint;
begin
 select * into v_pal from pcp_pallets where id=p_pallet for update;
 if not found then raise exception 'Pallet não encontrado';end if;
 select e.*,s.tipo setor_tipo into v_end from est_enderecos e left join wms_setores s on s.id=e.setor_id where e.id=p_endereco;
 if not found or not v_end.ativo then raise exception 'Endereço inválido ou inativo';end if;
 if v_end.bloqueado then raise exception 'Endereço bloqueado: %',coalesce(nullif(v_end.motivo_bloqueio,''),'sem motivo informado');end if;
 v_tipo:=coalesce(v_end.setor_tipo,'ESTOQUE');
 if v_pal.status='BLOQUEADO' and v_tipo not in('QUARENTENA','REVISAO') then raise exception 'PALLET_BLOQUEADO: pallet bloqueado só pode ir para Quarentena ou Revisão';end if;
 if v_tipo in('EMBALAGEM','EXPEDICAO') and wms_pedido_em_revisao(v_pal.pedido) then raise exception 'REVISAO_ABERTA: o pedido % tem revisão aberta e não pode ser embalado nem expedido',v_pal.pedido;end if;
 v_cap:=coalesce(v_end.capacidade_pallets,case when v_end.tipo_posicao='PALLET' then 1 end);
 select endereco_id into v_de from wms_pallet_posicoes where pallet_id=p_pallet;
 if v_de is not distinct from p_endereco then raise exception 'O pallet já está neste endereço';end if;
 if v_cap is not null then
  select count(*) into v_ocup from wms_pallet_posicoes where endereco_id=p_endereco;
  if v_ocup>=v_cap then raise exception 'Endereço cheio (% de % pallets)',v_ocup,v_cap;end if;
 end if;
 insert into wms_pallet_posicoes(pallet_id,endereco_id,por) values(p_pallet,p_endereco,p_ator)
  on conflict(pallet_id) do update set endereco_id=excluded.endereco_id,desde=now(),por=excluded.por;
 insert into wms_pallet_movs(pallet_id,de_id,para_id,motivo,criado_por) values(p_pallet,v_de,p_endereco,coalesce(p_motivo,''),p_ator) returning id into v_id;
 return v_id;
end$$;

create or replace function wms_pallet_retirar(p_pallet uuid,p_ator text,p_motivo text default '') returns void language plpgsql as $$
declare v_de uuid;
begin
 select endereco_id into v_de from wms_pallet_posicoes where pallet_id=p_pallet for update;
 if v_de is null then raise exception 'O pallet não está alocado';end if;
 delete from wms_pallet_posicoes where pallet_id=p_pallet;
 insert into wms_pallet_movs(pallet_id,de_id,para_id,motivo,criado_por) values(p_pallet,v_de,null,coalesce(p_motivo,'Retirada'),p_ator);
end$$;

-- Guarda sugerida: endereço livre do setor pedido, o menos ocupado.
create or replace function wms_sugerir_endereco(p_setor_tipo text) returns uuid language sql stable as $$
 select e.id from est_enderecos e join wms_setores s on s.id=e.setor_id
 where s.tipo=p_setor_tipo and s.ativo and e.ativo and not e.bloqueado
  and coalesce(e.capacidade_pallets,case when e.tipo_posicao='PALLET' then 1 end,2147483647)>(select count(*) from wms_pallet_posicoes pp where pp.endereco_id=e.id)
 order by (select count(*) from wms_pallet_posicoes pp where pp.endereco_id=e.id),e.rua,e.modulo,e.nivel,e.codigo limit 1
$$;

-- ================================================================ C. Revisão de pedido (versionada, soma e subtrai)
create or replace function wms_revisao_abrir(p_pedido text,p_motivo text,p_solicitante text,p_prazo date,p_itens jsonb,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_num integer;v_i jsonb;v_l integer:=0;v_acao text;v_a numeric;v_d numeric;
begin
 if coalesce(trim(p_pedido),'')='' then raise exception 'Informe o pedido';end if;
 if coalesce(trim(p_motivo),'')='' then raise exception 'Informe o motivo da revisão';end if;
 if p_prazo is null then raise exception 'Informe o prazo de resposta';end if;
 if jsonb_typeof(p_itens)<>'array' or jsonb_array_length(p_itens)=0 then raise exception 'Informe ao menos uma linha de diferença (acrescenta, subtrai ou altera)';end if;
 if wms_pedido_em_revisao(p_pedido) then raise exception 'REVISAO_ABERTA: o pedido % já tem revisão aberta',p_pedido;end if;
 select coalesce(max(numero),0)+1 into v_num from pcp_pedido_revisoes where pedido=p_pedido;
 insert into pcp_pedido_revisoes(pedido,numero,motivo,solicitante,prazo,criado_por) values(p_pedido,v_num,p_motivo,coalesce(p_solicitante,''),p_prazo,p_ator) returning id into v_id;
 for v_i in select * from jsonb_array_elements(p_itens) loop
  v_l:=v_l+1;v_acao:=upper(coalesce(v_i->>'acao',''));v_a:=coalesce(nullif(v_i->>'qtdAntes','')::numeric,0);v_d:=coalesce(nullif(v_i->>'qtdDepois','')::numeric,0);
  if v_acao not in('ACRESCENTA','SUBTRAI','ALTERA') then raise exception 'Linha %: ação inválida',v_l;end if;
  if coalesce(trim(v_i->>'descricao'),'')='' then raise exception 'Linha %: informe a descrição da peça',v_l;end if;
  if v_acao='ACRESCENTA' and v_d<=v_a then raise exception 'Linha %: acrescentar exige quantidade depois maior que antes',v_l;end if;
  if v_acao='SUBTRAI' and v_d>=v_a then raise exception 'Linha %: subtrair exige quantidade depois menor que antes',v_l;end if;
  if v_acao='ALTERA' and v_d=v_a and coalesce(v_i->>'medida','')='' and coalesce(v_i->>'material','')='' and coalesce(v_i->>'acabamento','')='' then raise exception 'Linha %: alteração sem mudança informada',v_l;end if;
  insert into pcp_pedido_revisao_itens(revisao_id,linha,acao,descricao,medida,material,acabamento,mao,qtd_antes,qtd_depois,destino)
  values(v_id,v_l,v_acao,left(v_i->>'descricao',300),left(coalesce(v_i->>'medida',''),80),left(coalesce(v_i->>'material',''),80),left(coalesce(v_i->>'acabamento',''),80),left(coalesce(v_i->>'mao',''),10),v_a,v_d,
   case when v_acao='ACRESCENTA' or (v_acao='ALTERA' and v_d>=v_a) then 'NAO_SE_APLICA' else 'PENDENTE' end);
 end loop;
 return v_id;
end$$;

create or replace function wms_revisao_avancar(p_rev uuid,p_status text,p_responsavel text,p_parecer text,p_ator text) returns void language plpgsql as $$
declare v_atual text;
begin
 select status into v_atual from pcp_pedido_revisoes where id=p_rev for update;
 if v_atual is null then raise exception 'Revisão não encontrada';end if;
 if v_atual in('APLICADA','REJEITADA') then raise exception 'Revisão já encerrada';end if;
 if p_status not in('EM_ANALISE','AGUARDANDO_FABRICA','REJEITADA') then raise exception 'Status inválido';end if;
 if p_status='REJEITADA' and coalesce(trim(p_parecer),'')='' then raise exception 'Informe o parecer da rejeição';end if;
 if p_status='EM_ANALISE' and v_atual<>'ABERTA' then raise exception 'Só uma revisão aberta vai para análise';end if;
 if p_status='AGUARDANDO_FABRICA' and v_atual not in('ABERTA','EM_ANALISE') then raise exception 'Transição inválida';end if;
 update pcp_pedido_revisoes set status=p_status,responsavel=coalesce(nullif(p_responsavel,''),responsavel),parecer=case when coalesce(p_parecer,'')='' then parecer else p_parecer end,atualizada_em=now(),
  encerrada_em=case when p_status='REJEITADA' then now() end,encerrada_por=case when p_status='REJEITADA' then p_ator else '' end where id=p_rev;
end$$;

create or replace function wms_revisao_destino(p_rev uuid,p_linha integer,p_destino text,p_endereco uuid,p_ator text) returns void language plpgsql as $$
declare v_it record;v_st text;
begin
 select status into v_st from pcp_pedido_revisoes where id=p_rev;
 if v_st is null or v_st in('APLICADA','REJEITADA') then raise exception 'Revisão encerrada ou inexistente';end if;
 select * into v_it from pcp_pedido_revisao_itens where revisao_id=p_rev and linha=p_linha for update;
 if not found then raise exception 'Linha não encontrada';end if;
 if v_it.acao='ACRESCENTA' or v_it.qtd_depois>=v_it.qtd_antes then raise exception 'Esta linha não subtrai peças: não tem destino';end if;
 if p_destino not in('CANCELAR_OF','SOBRA','REFUGO') then raise exception 'Destino inválido';end if;
 if p_destino='SOBRA' then
  if p_endereco is null or not exists(select 1 from est_enderecos e join wms_setores s on s.id=e.setor_id where e.id=p_endereco and s.tipo='SOBRAS' and e.ativo) then raise exception 'Escolha um endereço da zona de SOBRAS';end if;
 end if;
 update pcp_pedido_revisao_itens set destino=p_destino,endereco_destino_id=case when p_destino='SOBRA' then p_endereco end where id=v_it.id;
end$$;

create table if not exists wms_sobras(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 descricao varchar(300) not null, medida varchar(80) not null default '', material varchar(80) not null default '', acabamento varchar(80) not null default '', mao varchar(10) not null default '',
 quantidade numeric(16,3) not null check(quantidade>0),
 origem_pedido varchar(60) not null default '', origem_revisao integer,
 endereco_id uuid references est_enderecos(id),
 status varchar(12) not null default 'DISPONIVEL' check(status in('DISPONIVEL','RESERVADA','CONSUMIDA','REFUGO')),
 reservada_pedido varchar(60) not null default '',
 custo numeric(16,2) not null default 0 check(custo>=0),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create index if not exists ix_wms_sobras_busca on wms_sobras(status,lower(medida),lower(material),lower(acabamento));

create table if not exists wms_etiquetas(
 id uuid primary key default gen_random_uuid(),
 tipo varchar(10) not null check(tipo in('PALLET','PECA','SOBRA','LISTA')),
 referencia varchar(80) not null,
 pedido varchar(60) not null default '', revisao integer,
 conteudo jsonb not null default '{}'::jsonb,
 valida boolean not null default true,
 impressa_por varchar(160) not null, impressa_em timestamptz not null default now()
);
create index if not exists ix_wms_etiquetas_pedido on wms_etiquetas(pedido,revisao);

create or replace function wms_revisao_aplicar(p_rev uuid,p_ator text) returns jsonb language plpgsql as $$
declare v_r record;v_it record;v_pend integer;v_sobras integer:=0;v_ref integer:=0;v_canc integer:=0;v_sid uuid;v_qtd numeric;
begin
 select * into v_r from pcp_pedido_revisoes where id=p_rev for update;
 if not found then raise exception 'Revisão não encontrada';end if;
 if v_r.status not in('EM_ANALISE','AGUARDANDO_FABRICA') then raise exception 'Coloque a revisão em análise antes de aplicar';end if;
 select count(*) into v_pend from pcp_pedido_revisao_itens where revisao_id=p_rev and destino='PENDENTE';
 if v_pend>0 then raise exception 'DESTINO_PENDENTE: defina o destino de % peça(s) subtraída(s) antes de aplicar',v_pend;end if;
 for v_it in select * from pcp_pedido_revisao_itens where revisao_id=p_rev and destino in('SOBRA','REFUGO','CANCELAR_OF') order by linha loop
  v_qtd:=v_it.qtd_antes-v_it.qtd_depois;
  if v_it.destino='SOBRA' then
   insert into wms_sobras(descricao,medida,material,acabamento,mao,quantidade,origem_pedido,origem_revisao,endereco_id,criado_por)
   values(v_it.descricao,v_it.medida,v_it.material,v_it.acabamento,v_it.mao,v_qtd,v_r.pedido,v_r.numero,v_it.endereco_destino_id,p_ator) returning id into v_sid;
   update pcp_pedido_revisao_itens set sobra_id=v_sid where id=v_it.id;v_sobras:=v_sobras+1;
  elsif v_it.destino='REFUGO' then
   insert into wms_sobras(descricao,medida,material,acabamento,mao,quantidade,origem_pedido,origem_revisao,status,criado_por)
   values(v_it.descricao,v_it.medida,v_it.material,v_it.acabamento,v_it.mao,v_qtd,v_r.pedido,v_r.numero,'REFUGO',p_ator) returning id into v_sid;
   update pcp_pedido_revisao_itens set sobra_id=v_sid where id=v_it.id;v_ref:=v_ref+1;
  else v_canc:=v_canc+1;end if;
 end loop;
 update wms_etiquetas set valida=false where pedido=v_r.pedido and coalesce(revisao,0)<v_r.numero and valida;
 update pcp_pedido_revisoes set status='APLICADA',encerrada_em=now(),encerrada_por=p_ator,atualizada_em=now() where id=p_rev;
 return jsonb_build_object('revisao',v_r.numero,'sobras',v_sobras,'refugo',v_ref,'ofsCanceladas',v_canc);
end$$;

create or replace function wms_sobra_reservar(p_sobra uuid,p_pedido text,p_ator text) returns void language plpgsql as $$
begin
 if coalesce(trim(p_pedido),'')='' then raise exception 'Informe o pedido que vai aproveitar a sobra';end if;
 update wms_sobras set status='RESERVADA',reservada_pedido=p_pedido,atualizado_em=now() where id=p_sobra and status='DISPONIVEL';
 if not found then raise exception 'Sobra indisponível';end if;
end$$;
create or replace function wms_sobra_baixar(p_sobra uuid,p_status text,p_ator text) returns void language plpgsql as $$
begin
 if p_status not in('CONSUMIDA','REFUGO','DISPONIVEL') then raise exception 'Status inválido';end if;
 update wms_sobras set status=p_status,reservada_pedido=case when p_status='DISPONIVEL' then '' else reservada_pedido end,atualizado_em=now() where id=p_sobra and status in('DISPONIVEL','RESERVADA');
 if not found then raise exception 'Sobra não está em aberto';end if;
end$$;

-- ================================================================ D. Separação (picking) e conferência de pallet
create table if not exists wms_picking_listas(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 pedido varchar(60) not null,
 remessa_id uuid references exp_remessas(id),
 status varchar(12) not null default 'ABERTA' check(status in('ABERTA','EM_SEPARACAO','CONCLUIDA','CANCELADA')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), concluida_em timestamptz
);
create table if not exists wms_picking_itens(
 lista_id uuid not null references wms_picking_listas(id) on delete cascade,
 ordem integer not null,
 pallet_id uuid not null references pcp_pallets(id),
 endereco_codigo varchar(40) not null default '',
 conferido boolean not null default false, conferido_por varchar(160) not null default '', conferido_em timestamptz,
 primary key(lista_id,pallet_id)
);

create or replace function wms_picking_criar(p_pedido text,p_remessa uuid,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_n integer;
begin
 if wms_pedido_em_revisao(p_pedido) then raise exception 'REVISAO_ABERTA: o pedido % tem revisão aberta e não pode ser separado',p_pedido;end if;
 insert into wms_picking_listas(pedido,remessa_id,criado_por) values(p_pedido,p_remessa,p_ator) returning id into v_id;
 insert into wms_picking_itens(lista_id,ordem,pallet_id,endereco_codigo)
 select v_id,row_number() over(order by coalesce(e.rua,''),coalesce(e.modulo,''),coalesce(e.nivel,''),coalesce(e.codigo,'~'),p.codigo),p.id,coalesce(e.codigo,'')
 from pcp_pallets p left join wms_pallet_posicoes pp on pp.pallet_id=p.id left join est_enderecos e on e.id=pp.endereco_id
 where p.pedido=p_pedido and p.status='LIBERADO'
  and not exists(select 1 from exp_remessa_pallets rp where rp.pallet_id=p.id)
  and not exists(select 1 from wms_picking_itens i join wms_picking_listas l on l.id=i.lista_id where i.pallet_id=p.id and l.status in('ABERTA','EM_SEPARACAO','CONCLUIDA'));
 get diagnostics v_n=row_count;
 if v_n=0 then raise exception 'Nenhum pallet liberado e disponível para o pedido %',p_pedido;end if;
 return v_id;
end$$;

create or replace function wms_picking_conferir(p_lista uuid,p_codigo text,p_ator text) returns jsonb language plpgsql as $$
declare v_pal uuid;v_tot integer;v_ok integer;v_st text;
begin
 select status into v_st from wms_picking_listas where id=p_lista for update;
 if v_st is null then raise exception 'Lista não encontrada';end if;
 if v_st in('CONCLUIDA','CANCELADA') then raise exception 'Lista já encerrada';end if;
 select i.pallet_id into v_pal from wms_picking_itens i join pcp_pallets p on p.id=i.pallet_id where i.lista_id=p_lista and upper(p.codigo)=upper(trim(p_codigo));
 if v_pal is null then raise exception 'FORA_DA_LISTA: o pallet % não pertence a esta separação',p_codigo;end if;
 update wms_picking_itens set conferido=true,conferido_por=p_ator,conferido_em=now() where lista_id=p_lista and pallet_id=v_pal and not conferido;
 select count(*),count(*) filter(where conferido) into v_tot,v_ok from wms_picking_itens where lista_id=p_lista;
 update wms_picking_listas set status=case when v_ok=v_tot then 'CONCLUIDA' else 'EM_SEPARACAO' end,concluida_em=case when v_ok=v_tot then now() end where id=p_lista;
 return jsonb_build_object('conferidos',v_ok,'total',v_tot,'concluida',v_ok=v_tot);
end$$;

-- ================================================================ E. Recebimento com conferência
create table if not exists wms_recebimentos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 documento varchar(60) not null default '', fornecedor varchar(200) not null default '',
 status varchar(12) not null default 'ABERTO' check(status in('ABERTO','CONFERIDO','DIVERGENTE')),
 observacao text not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), fechado_em timestamptz
);
create table if not exists wms_recebimento_itens(
 recebimento_id uuid not null references wms_recebimentos(id) on delete cascade,
 linha integer not null check(linha>0),
 produto_id uuid not null references est_produtos(id),
 qtd_esperada numeric(16,3) not null check(qtd_esperada>0),
 qtd_conferida numeric(16,3) check(qtd_conferida is null or qtd_conferida>=0),
 endereco_id uuid references est_enderecos(id),
 primary key(recebimento_id,linha)
);
create or replace function wms_recebimento_fechar(p_rec uuid,p_ator text) returns text language plpgsql as $$
declare v_pend integer;v_div integer;v_st text;
begin
 select status into v_st from wms_recebimentos where id=p_rec for update;
 if v_st is null then raise exception 'Recebimento não encontrado';end if;
 if v_st<>'ABERTO' then raise exception 'Recebimento já fechado';end if;
 select count(*) filter(where qtd_conferida is null),count(*) filter(where qtd_conferida is not null and qtd_conferida<>qtd_esperada) into v_pend,v_div from wms_recebimento_itens where recebimento_id=p_rec;
 if v_pend>0 then raise exception 'Confira todos os itens (% sem contagem)',v_pend;end if;
 v_st:=case when v_div>0 then 'DIVERGENTE' else 'CONFERIDO' end;
 update wms_recebimentos set status=v_st,fechado_em=now() where id=p_rec;
 return v_st;
end$$;

-- ================================================================ F. Visões e indicadores
create or replace view wms_v_revisoes_paradas as
 select r.id,r.pedido,r.numero,r.status,r.motivo,r.solicitante,r.responsavel,r.prazo,r.aberta_em,
  (current_date-r.aberta_em::date) dias_espera,(r.prazo<current_date) vencida,
  (select count(*) from pcp_pedido_revisao_itens i where i.revisao_id=r.id and i.destino='PENDENTE') destinos_pendentes
 from pcp_pedido_revisoes r where r.status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA');

create or replace view wms_v_mapa as
 select e.id,e.codigo,e.descricao,e.rua,e.modulo,e.nivel,e.tipo_posicao,e.bloqueado,e.ativo,l.codigo deposito,s.codigo setor,s.nome setor_nome,s.tipo setor_tipo,
  coalesce(e.capacidade_pallets,case when e.tipo_posicao='PALLET' then 1 end) capacidade_pallets,
  (select count(*) from wms_pallet_posicoes pp where pp.endereco_id=e.id) pallets
 from est_enderecos e join est_locais l on l.id=e.local_id left join wms_setores s on s.id=e.setor_id;

create or replace function wms_indicadores() returns jsonb language sql stable as $$
 select jsonb_build_object(
  'revisoesAbertas',(select count(*) from wms_v_revisoes_paradas),
  'revisoesVencidas',(select count(*) from wms_v_revisoes_paradas where vencida),
  'diasMedioParado',coalesce((select round(avg(dias_espera)::numeric,1) from wms_v_revisoes_paradas),0),
  'sobrasDisponiveis',(select count(*) from wms_sobras where status='DISPONIVEL'),
  'valorSobras',coalesce((select sum(custo) from wms_sobras where status in('DISPONIVEL','RESERVADA')),0),
  'sobrasReaproveitadas',(select count(*) from wms_sobras where status in('RESERVADA','CONSUMIDA')),
  'sobrasTotal',(select count(*) from wms_sobras where status<>'REFUGO'),
  'palletsSemEndereco',(select count(*) from pcp_pallets p where not exists(select 1 from wms_pallet_posicoes pp where pp.pallet_id=p.id) and p.status in('LIBERADO','EM_LIBERACAO','AGUARDANDO_INSPECAO')),
  'embaladosComRevisao',(select count(*) from wms_pallet_posicoes pp join pcp_pallets p on p.id=pp.pallet_id join est_enderecos e on e.id=pp.endereco_id join wms_setores s on s.id=e.setor_id where s.tipo in('EMBALAGEM','EXPEDICAO') and wms_pedido_em_revisao(p.pedido)),
  'pickingAbertos',(select count(*) from wms_picking_listas where status in('ABERTA','EM_SEPARACAO')),
  'recebimentosDivergentes',(select count(*) from wms_recebimentos where status='DIVERGENTE')
 )
$$;

-- migrate:down
drop function if exists wms_indicadores();
drop view if exists wms_v_mapa;
drop view if exists wms_v_revisoes_paradas;
drop function if exists wms_recebimento_fechar(uuid,text);
drop table if exists wms_recebimento_itens;
drop table if exists wms_recebimentos;
drop function if exists wms_picking_conferir(uuid,text,text);
drop function if exists wms_picking_criar(text,uuid,text);
drop table if exists wms_picking_itens;
drop table if exists wms_picking_listas;
drop function if exists wms_sobra_baixar(uuid,text,text);
drop function if exists wms_sobra_reservar(uuid,text,text);
drop function if exists wms_revisao_aplicar(uuid,text);
drop table if exists wms_etiquetas;
drop table if exists wms_sobras;
drop function if exists wms_revisao_destino(uuid,integer,text,uuid,text);
drop function if exists wms_revisao_avancar(uuid,text,text,text,text);
drop function if exists wms_revisao_abrir(text,text,text,date,jsonb,text);
drop function if exists wms_sugerir_endereco(text);
drop function if exists wms_pallet_retirar(uuid,text,text);
drop function if exists wms_pallet_alocar(uuid,uuid,text,text);
drop function if exists wms_pedido_em_revisao(text);
drop table if exists pcp_pedido_revisao_itens;
drop table if exists pcp_pedido_revisoes;
drop table if exists wms_pallet_movs;
drop table if exists wms_pallet_posicoes;
alter table est_enderecos drop constraint if exists ck_est_enderecos_cap_pallets;
alter table est_enderecos drop constraint if exists ck_est_enderecos_tipo_posicao;
drop index if exists ix_est_enderecos_setor;
alter table est_enderecos drop column if exists motivo_bloqueio;
alter table est_enderecos drop column if exists bloqueado;
alter table est_enderecos drop column if exists capacidade_pallets;
alter table est_enderecos drop column if exists tipo_posicao;
alter table est_enderecos drop column if exists nivel;
alter table est_enderecos drop column if exists modulo;
alter table est_enderecos drop column if exists rua;
alter table est_enderecos drop column if exists setor_id;
drop table if exists wms_setores;
