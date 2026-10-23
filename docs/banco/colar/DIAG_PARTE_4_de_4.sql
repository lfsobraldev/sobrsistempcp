-- DIAGNÓSTICO — PARTE 4 de 4. Rode na ordem. Ao final aparece uma tabela: me envie as linhas que começam com ERRO.
-- RUNNER COM DIAGNÓSTICO: roda cada migração isolada e, no FINAL, mostra o resultado de cada uma.
create table if not exists _erros_migracao(id bigserial primary key,migracao text,erro text,em timestamptz default now());
delete from _erros_migracao where em<now()-interval '1 day';

-- >>>>> 2026-11-04_27_wms_revisoes_sobras
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-04_27_wms_revisoes_sobras.sql; SHA256 7a68606915a4426f256b0f1f9a1413e179234743a826169b0fed9525709042e6
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-03_26_sac_qualidade_oee.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-04_27_wms_revisoes_sobras.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-04_27_wms_revisoes_sobras.sql' and checksum<>'7a68606915a4426f256b0f1f9a1413e179234743a826169b0fed9525709042e6') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-04_27_wms_revisoes_sobras.sql','7a68606915a4426f256b0f1f9a1413e179234743a826169b0fed9525709042e6',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-04_27_wms_revisoes_sobras.sql','7a68606915a4426f256b0f1f9a1413e179234743a826169b0fed9525709042e6','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-04_27_wms_revisoes_sobras','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-04_27_wms_revisoes_sobras','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-05_28_rh_ehs_projetos
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-05_28_rh_ehs_projetos.sql; SHA256 1ea072a4844c5b994ac4b52ee50c3c8d15e97470707d498b691450128bef8af1
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-04_27_wms_revisoes_sobras.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-05_28_rh_ehs_projetos.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-05_28_rh_ehs_projetos.sql' and checksum<>'1ea072a4844c5b994ac4b52ee50c3c8d15e97470707d498b691450128bef8af1') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ================================================================ A. RH (HCM): cargos, colaboradores, ausências, ponto, folha simplificada
create table if not exists rh_cargos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(120) not null,
 nivel integer not null default 1 check(nivel between 1 and 9),
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists rh_colaboradores(
 id uuid primary key default gen_random_uuid(),
 matricula varchar(30) not null unique, nome varchar(200) not null,
 cargo_id uuid references rh_cargos(id), setor varchar(80) not null default '',
 admissao date not null, desligamento date,
 salario_base numeric(14,2) not null default 0 check(salario_base>=0),
 status varchar(10) not null default 'ATIVO' check(status in('ATIVO','FERIAS','AFASTADO','DESLIGADO')),
 usuario_login varchar(160) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(desligamento is null or desligamento>=admissao)
);
create index if not exists ix_rh_colab_status on rh_colaboradores(status,setor);
create table if not exists rh_ausencias(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 tipo varchar(10) not null check(tipo in('FERIAS','ATESTADO','FALTA','LICENCA')),
 inicio date not null, fim date not null, observacao varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(fim>=inicio)
);
create index if not exists ix_rh_aus_periodo on rh_ausencias(colaborador_id,inicio,fim);
create table if not exists rh_ponto(
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 data date not null,
 entrada time, saida time,
 horas numeric(5,2) not null default 0 check(horas>=0 and horas<=24),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(colaborador_id,data)
);
create table if not exists rh_folha(
 competencia char(7) not null check(competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 colaborador_id uuid not null references rh_colaboradores(id),
 bruto numeric(14,2) not null default 0, desconto_faltas numeric(14,2) not null default 0,
 outros_descontos numeric(14,2) not null default 0 check(outros_descontos>=0),
 horas_extras numeric(14,2) not null default 0 check(horas_extras>=0),
 liquido numeric(14,2) generated always as (bruto-desconto_faltas-outros_descontos+horas_extras) stored,
 status varchar(10) not null default 'RASCUNHO' check(status in('RASCUNHO','FECHADA')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(competencia,colaborador_id)
);

-- Folha simplificada (gerencial): salário - faltas (dias/30) + horas extras a 50% sobre a hora de 220h. Não substitui eSocial/INSS/IRRF.
create or replace function rh_folha_gerar(p_comp text,p_ator text) returns integer language plpgsql as $$
declare v_ini date;v_fim date;v_n integer:=0;c record;v_faltas integer;v_extra numeric;v_hora numeric;
begin
 if p_comp !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Competência inválida (use AAAA-MM)';end if;
 if exists(select 1 from rh_folha where competencia=p_comp and status='FECHADA') then raise exception 'Competência já fechada';end if;
 v_ini:=(p_comp||'-01')::date;v_fim:=(v_ini+interval '1 month - 1 day')::date;
 delete from rh_folha where competencia=p_comp and status='RASCUNHO';
 for c in select * from rh_colaboradores where status<>'DESLIGADO' or desligamento>=v_ini loop
  select coalesce(sum(least(fim,v_fim)-greatest(inicio,v_ini)+1),0) into v_faltas from rh_ausencias where colaborador_id=c.id and tipo='FALTA' and inicio<=v_fim and fim>=v_ini;
  select coalesce(sum(greatest(horas-8,0)),0) into v_extra from rh_ponto where colaborador_id=c.id and data between v_ini and v_fim;
  v_hora:=c.salario_base/220;
  insert into rh_folha(competencia,colaborador_id,bruto,desconto_faltas,horas_extras,criado_por)
  values(p_comp,c.id,c.salario_base,round(c.salario_base/30*v_faltas,2),round(v_extra*v_hora*1.5,2),p_ator);
  v_n:=v_n+1;
 end loop;
 return v_n;
end$$;
create or replace function rh_folha_fechar(p_comp text,p_ator text) returns void language plpgsql as $$
begin
 update rh_folha set status='FECHADA' where competencia=p_comp and status='RASCUNHO';
 if not found then raise exception 'Nada a fechar em %',p_comp;end if;
end$$;

-- ================================================================ B. EHS: ocorrências, EPI e treinamentos
create table if not exists ehs_ocorrencias(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(14) not null check(tipo in('ACIDENTE','QUASE_ACIDENTE','INCIDENTE','AMBIENTAL')),
 data date not null, setor varchar(80) not null default '',
 colaborador_id uuid references rh_colaboradores(id),
 gravidade varchar(8) not null default 'LEVE' check(gravidade in('LEVE','MODERADA','GRAVE')),
 descricao text not null, acao_corretiva text not null default '',
 emitiu_cat boolean not null default false,
 status varchar(12) not null default 'ABERTA' check(status in('ABERTA','EM_TRATAMENTO','ENCERRADA')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), encerrada_em timestamptz
);
create table if not exists ehs_epis(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(160) not null,
 ca varchar(20) not null default '', validade_ca date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists ehs_epi_entregas(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 epi_id uuid not null references ehs_epis(id),
 entregue_em date not null, vence_em date, quantidade integer not null default 1 check(quantidade>0),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vence_em is null or vence_em>=entregue_em)
);
create table if not exists ehs_treinamentos(
 id uuid primary key default gen_random_uuid(),
 nome varchar(160) not null unique, validade_meses integer not null default 12 check(validade_meses>0),
 obrigatorio boolean not null default false, ativo boolean not null default true
);
create table if not exists ehs_treinamento_registros(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 treinamento_id uuid not null references ehs_treinamentos(id),
 realizado_em date not null, vence_em date not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vence_em>=realizado_em)
);
create or replace function ehs_registrar_treinamento(p_colab uuid,p_trein uuid,p_data date,p_ator text) returns uuid language plpgsql as $$
declare v_m integer;v_id uuid;
begin
 select validade_meses into v_m from ehs_treinamentos where id=p_trein and ativo;
 if v_m is null then raise exception 'Treinamento inválido';end if;
 insert into ehs_treinamento_registros(colaborador_id,treinamento_id,realizado_em,vence_em,criado_por) values(p_colab,p_trein,p_data,(p_data+make_interval(months=>v_m))::date,p_ator) returning id into v_id;
 return v_id;
end$$;

create or replace view ehs_v_vencimentos as
 select 'EPI'::text tipo,c.id colaborador_id,c.nome colaborador,e.nome item,d.vence_em,(d.vence_em-current_date) dias
 from ehs_epi_entregas d join ehs_epis e on e.id=d.epi_id join rh_colaboradores c on c.id=d.colaborador_id
 where c.status<>'DESLIGADO' and d.vence_em is not null and d.vence_em<=current_date+30
  and d.entregue_em=(select max(x.entregue_em) from ehs_epi_entregas x where x.colaborador_id=d.colaborador_id and x.epi_id=d.epi_id)
 union all
 select 'TREINAMENTO',c.id,c.nome,t.nome,r.vence_em,(r.vence_em-current_date)
 from ehs_treinamento_registros r join ehs_treinamentos t on t.id=r.treinamento_id join rh_colaboradores c on c.id=r.colaborador_id
 where c.status<>'DESLIGADO' and r.vence_em<=current_date+30
  and r.realizado_em=(select max(x.realizado_em) from ehs_treinamento_registros x where x.colaborador_id=r.colaborador_id and x.treinamento_id=r.treinamento_id);

create or replace function ehs_indicadores() returns jsonb language sql stable as $$
 select jsonb_build_object(
  'diasSemAcidente',coalesce(current_date-(select max(data) from ehs_ocorrencias where tipo='ACIDENTE'),(select current_date-min(admissao) from rh_colaboradores),0),
  'acidentesAno',(select count(*) from ehs_ocorrencias where tipo='ACIDENTE' and data>=date_trunc('year',current_date)),
  'quaseAcidentesAno',(select count(*) from ehs_ocorrencias where tipo='QUASE_ACIDENTE' and data>=date_trunc('year',current_date)),
  'abertas',(select count(*) from ehs_ocorrencias where status<>'ENCERRADA'),
  'vencidos',(select count(*) from ehs_v_vencimentos where dias<0),
  'aVencer30',(select count(*) from ehs_v_vencimentos where dias>=0)
 )
$$;

-- ================================================================ C. Projetos (PS): projeto, tarefas (WBS) e custos
create table if not exists ps_projetos(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(200) not null,
 responsavel varchar(160) not null default '', pedido varchar(60) not null default '',
 inicio date not null, fim_previsto date not null,
 orcamento numeric(16,2) not null default 0 check(orcamento>=0),
 status varchar(12) not null default 'PLANEJADO' check(status in('PLANEJADO','EM_ANDAMENTO','CONCLUIDO','CANCELADO')),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(fim_previsto>=inicio)
);
create table if not exists ps_tarefas(
 id uuid primary key default gen_random_uuid(),
 projeto_id uuid not null references ps_projetos(id) on delete cascade,
 wbs varchar(30) not null, nome varchar(200) not null, responsavel varchar(160) not null default '',
 inicio date not null, fim date not null,
 percentual integer not null default 0 check(percentual between 0 and 100),
 predecessora_id uuid references ps_tarefas(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(projeto_id,wbs), check(fim>=inicio)
);
create table if not exists ps_custos(
 id uuid primary key default gen_random_uuid(),
 projeto_id uuid not null references ps_projetos(id) on delete cascade,
 data date not null, descricao varchar(300) not null, valor numeric(16,2) not null check(valor>0),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create or replace function ps_resumo() returns table(id uuid,codigo text,nome text,status text,responsavel text,inicio date,fim_previsto date,orcamento numeric,realizado numeric,pct_orcamento numeric,pct_fisico numeric,tarefas_atrasadas bigint,atrasado boolean) language sql stable as $$
 select p.id,p.codigo::text,p.nome::text,p.status::text,p.responsavel::text,p.inicio,p.fim_previsto,p.orcamento,
  coalesce((select sum(c.valor) from ps_custos c where c.projeto_id=p.id),0),
  case when p.orcamento>0 then round(coalesce((select sum(c.valor) from ps_custos c where c.projeto_id=p.id),0)/p.orcamento*100,1) else 0 end,
  coalesce((select round(avg(t.percentual),1) from ps_tarefas t where t.projeto_id=p.id),0),
  (select count(*) from ps_tarefas t where t.projeto_id=p.id and t.fim<current_date and t.percentual<100),
  (p.status in('PLANEJADO','EM_ANDAMENTO') and p.fim_previsto<current_date)
 from ps_projetos p order by p.fim_previsto
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-05_28_rh_ehs_projetos.sql','1ea072a4844c5b994ac4b52ee50c3c8d15e97470707d498b691450128bef8af1',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-05_28_rh_ehs_projetos.sql','1ea072a4844c5b994ac4b52ee50c3c8d15e97470707d498b691450128bef8af1','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-05_28_rh_ehs_projetos','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-05_28_rh_ehs_projetos','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-07_30_seguranca_aprovacoes_auditoria
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-07_30_seguranca_aprovacoes_auditoria.sql; SHA256 5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-06_29_cargos_identidade.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-07_30_seguranca_aprovacoes_auditoria.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-07_30_seguranca_aprovacoes_auditoria.sql' and checksum<>'5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ================================================================ A. Hierarquia de cargos e matriz de autorização
create table if not exists erp_cargos_nivel(
 cargo varchar(30) primary key, nivel integer not null check(nivel between 1 and 9), descricao varchar(120) not null default ''
);
insert into erp_cargos_nivel(cargo,nivel,descricao) values
 ('APONTADOR',1,'Operador / apontador'),('LIDER',2,'Líder'),('LIDER_ENTREGAS',2,'Líder de entregas'),('QUALIDADE',3,'Qualidade'),('LOGISTICA',3,'Logística'),('COMERCIAL',3,'Comercial'),('SAC',3,'SAC'),
 ('ENCARREGADO',4,'Encarregado'),('SUPERVISOR',5,'Supervisor'),('PCP',6,'PCP'),('GERENTE',7,'Gerente'),('DIRETOR',8,'Diretor'),('ADMINISTRADOR',9,'Administrador')
on conflict(cargo) do nothing;

-- Objeto de autorização: cargo x módulo x ação (+ limite de valor). Ausência de linha = negado.
create table if not exists erp_autorizacoes(
 cargo varchar(30) not null references erp_cargos_nivel(cargo),
 modulo varchar(30) not null,
 acao varchar(10) not null check(acao in('VER','CRIAR','EDITAR','APROVAR','CANCELAR','EXPORTAR')),
 permitido boolean not null default true,
 limite_valor numeric(16,2) check(limite_valor is null or limite_valor>=0),
 atualizado_por varchar(160) not null default 'sistema', atualizado_em timestamptz not null default now(),
 primary key(cargo,modulo,acao)
);
insert into erp_autorizacoes(cargo,modulo,acao,limite_valor)
select c.cargo,m.modulo,a.acao,
 case when a.acao='APROVAR' then (case c.cargo when 'ENCARREGADO' then 5000 when 'SUPERVISOR' then 10000 when 'PCP' then 20000 when 'GERENTE' then 50000 else null end) end
from (values('ENCARREGADO'),('SUPERVISOR'),('PCP'),('GERENTE'),('DIRETOR'),('ADMINISTRADOR')) c(cargo)
cross join (values('COMPRAS'),('VENDAS'),('FINANCEIRO'),('ESTOQUE'),('WMS'),('PRODUCAO'),('QUALIDADE'),('RH'),('FISCAL'),('PROJETOS')) m(modulo)
cross join (values('APROVAR'),('CANCELAR'),('EXPORTAR')) a(acao)
where not (c.cargo in('ENCARREGADO') and a.acao in('CANCELAR'))
 and not (c.cargo in('ENCARREGADO','SUPERVISOR') and m.modulo in('FINANCEIRO','FISCAL','RH'))
on conflict do nothing;

create or replace function erp_cargo_nivel(p_cargo text) returns integer language sql stable as $$
 select coalesce((select nivel from erp_cargos_nivel where cargo=p_cargo),0)
$$;
create or replace function erp_pode(p_cargo text,p_modulo text,p_acao text,p_valor numeric default null) returns boolean language sql stable as $$
 select coalesce((select a.permitido and (p_valor is null or a.limite_valor is null or p_valor<=a.limite_valor)
  from erp_autorizacoes a where a.cargo=p_cargo and a.modulo=p_modulo and a.acao=p_acao),false)
$$;

-- ================================================================ B. Alçadas e aprovação em múltiplos níveis
create table if not exists erp_aprovacao_regras(
 id uuid primary key default gen_random_uuid(),
 modulo varchar(30) not null, tipo_documento varchar(40) not null,
 valor_min numeric(16,2) not null default 0 check(valor_min>=0),
 valor_max numeric(16,2) check(valor_max is null or valor_max>=valor_min),
 nivel integer not null check(nivel between 1 and 5),
 cargo_aprovador varchar(30) not null references erp_cargos_nivel(cargo),
 ativo boolean not null default true,
 criado_por varchar(160) not null default 'sistema', criado_em timestamptz not null default now(),
 unique(modulo,tipo_documento,valor_min,nivel)
);
insert into erp_aprovacao_regras(modulo,tipo_documento,valor_min,valor_max,nivel,cargo_aprovador) values
 ('COMPRAS','PEDIDO_COMPRA',0,5000,1,'ENCARREGADO'),
 ('COMPRAS','PEDIDO_COMPRA',5000.01,20000,1,'GERENTE'),
 ('COMPRAS','PEDIDO_COMPRA',20000.01,null,1,'GERENTE'),
 ('COMPRAS','PEDIDO_COMPRA',20000.01,null,2,'DIRETOR'),
 ('VENDAS','DESCONTO',0,null,1,'GERENTE'),
 ('FINANCEIRO','PAGAMENTO',0,10000,1,'GERENTE'),
 ('FINANCEIRO','PAGAMENTO',10000.01,null,1,'GERENTE'),
 ('FINANCEIRO','PAGAMENTO',10000.01,null,2,'DIRETOR'),
 ('ESTOQUE','AJUSTE_INVENTARIO',0,null,1,'GERENTE'),
 ('WMS','REVISAO_APLICAR',0,null,1,'PCP')
on conflict do nothing;

create table if not exists erp_aprovacoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 modulo varchar(30) not null, tipo_documento varchar(40) not null,
 documento_id varchar(80) not null, documento_ref varchar(160) not null default '',
 valor numeric(16,2) not null default 0 check(valor>=0),
 descricao text not null default '',
 solicitante varchar(160) not null,
 status varchar(10) not null default 'PENDENTE' check(status in('PENDENTE','APROVADO','REJEITADO','CANCELADO')),
 nivel_atual integer not null default 1, niveis_total integer not null check(niveis_total>0),
 criado_em timestamptz not null default now(), encerrado_em timestamptz
);
create unique index if not exists ux_erp_aprovacao_aberta on erp_aprovacoes(modulo,tipo_documento,documento_id) where status='PENDENTE';
create table if not exists erp_aprovacao_etapas(
 aprovacao_id uuid not null references erp_aprovacoes(id) on delete cascade,
 nivel integer not null, cargo_exigido varchar(30) not null,
 status varchar(10) not null default 'PENDENTE' check(status in('PENDENTE','APROVADO','REJEITADO')),
 decidido_por varchar(160) not null default '', decidido_em timestamptz, parecer text not null default '',
 primary key(aprovacao_id,nivel)
);
create table if not exists erp_delegacoes(
 id uuid primary key default gen_random_uuid(),
 de_usuario varchar(160) not null, para_usuario varchar(160) not null,
 cargo_delegado varchar(30) not null references erp_cargos_nivel(cargo),
 inicio date not null, fim date not null, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(fim>=inicio), check(de_usuario<>para_usuario)
);

create or replace function erp_aprovacao_solicitar(p_modulo text,p_tipo text,p_doc text,p_ref text,p_valor numeric,p_desc text,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_n integer;
begin
 if coalesce(trim(p_doc),'')='' then raise exception 'Informe o documento a aprovar';end if;
 if p_valor is null or p_valor<0 then raise exception 'Valor inválido';end if;
 select count(*) into v_n from erp_aprovacao_regras where ativo and modulo=p_modulo and tipo_documento=p_tipo and p_valor>=valor_min and (valor_max is null or p_valor<=valor_max);
 if v_n=0 then raise exception 'SEM_REGRA: não há alçada cadastrada para % / % neste valor',p_modulo,p_tipo;end if;
 insert into erp_aprovacoes(modulo,tipo_documento,documento_id,documento_ref,valor,descricao,solicitante,niveis_total)
 values(p_modulo,p_tipo,p_doc,coalesce(p_ref,''),p_valor,coalesce(p_desc,''),p_ator,v_n) returning id into v_id;
 insert into erp_aprovacao_etapas(aprovacao_id,nivel,cargo_exigido)
 select v_id,row_number() over(order by nivel),cargo_aprovador from erp_aprovacao_regras
 where ativo and modulo=p_modulo and tipo_documento=p_tipo and p_valor>=valor_min and (valor_max is null or p_valor<=valor_max) order by nivel;
 return v_id;
end$$;

-- Decisão: o cargo efetivo é o maior entre o próprio e o delegado vigente; solicitante não aprova a própria solicitação;
-- a mesma pessoa não aprova dois níveis do mesmo documento (quatro olhos).
create or replace function erp_aprovacao_decidir(p_id uuid,p_decisao text,p_parecer text,p_ator text,p_cargo text) returns text language plpgsql as $$
declare v_a record;v_e record;v_nivel integer;v_deleg integer;v_novo text;
begin
 if p_decisao not in('APROVAR','REJEITAR') then raise exception 'Decisão inválida';end if;
 select * into v_a from erp_aprovacoes where id=p_id for update;
 if not found then raise exception 'Aprovação não encontrada';end if;
 if v_a.status<>'PENDENTE' then raise exception 'Aprovação já encerrada';end if;
 if v_a.solicitante=p_ator then raise exception 'SEPARACAO_DE_FUNCOES: quem solicita não pode aprovar';end if;
 if exists(select 1 from erp_aprovacao_etapas where aprovacao_id=p_id and decidido_por=p_ator) then raise exception 'SEPARACAO_DE_FUNCOES: você já decidiu um nível deste documento';end if;
 select * into v_e from erp_aprovacao_etapas where aprovacao_id=p_id and nivel=v_a.nivel_atual;
 v_nivel:=erp_cargo_nivel(p_cargo);
 select coalesce(max(erp_cargo_nivel(cargo_delegado)),0) into v_deleg from erp_delegacoes where ativo and para_usuario=p_ator and current_date between inicio and fim;
 if greatest(v_nivel,v_deleg)<erp_cargo_nivel(v_e.cargo_exigido) then raise exception 'Este nível exige o cargo % ou superior',v_e.cargo_exigido;end if;
 if p_decisao='APROVAR' and not erp_pode(case when v_deleg>v_nivel then (select cargo_delegado from erp_delegacoes where ativo and para_usuario=p_ator and current_date between inicio and fim order by erp_cargo_nivel(cargo_delegado) desc limit 1) else p_cargo end,v_a.modulo,'APROVAR',case when v_a.nivel_atual>=v_a.niveis_total then v_a.valor end) then
  raise exception 'O cargo não tem alçada para aprovar este valor em %',v_a.modulo;
 end if;
 if p_decisao='REJEITAR' and coalesce(trim(p_parecer),'')='' then raise exception 'Informe o parecer da rejeição';end if;
 update erp_aprovacao_etapas set status=case when p_decisao='APROVAR' then 'APROVADO' else 'REJEITADO' end,decidido_por=p_ator,decidido_em=now(),parecer=coalesce(p_parecer,'') where aprovacao_id=p_id and nivel=v_a.nivel_atual;
 if p_decisao='REJEITAR' then
  update erp_aprovacoes set status='REJEITADO',encerrado_em=now() where id=p_id;v_novo:='REJEITADO';
 elsif v_a.nivel_atual>=v_a.niveis_total then
  update erp_aprovacoes set status='APROVADO',encerrado_em=now() where id=p_id;v_novo:='APROVADO';
 else
  update erp_aprovacoes set nivel_atual=nivel_atual+1 where id=p_id;v_novo:='PENDENTE';
 end if;
 return v_novo;
end$$;

create or replace function erp_aprovacao_cancelar(p_id uuid,p_ator text) returns void language plpgsql as $$
begin
 update erp_aprovacoes set status='CANCELADO',encerrado_em=now() where id=p_id and status='PENDENTE' and solicitante=p_ator;
 if not found then raise exception 'Só o solicitante cancela uma aprovação pendente';end if;
end$$;

create or replace view erp_v_aprovacoes_pendentes as
 select a.id,a.numero,a.modulo,a.tipo_documento,a.documento_ref,a.valor,a.descricao,a.solicitante,a.criado_em,a.nivel_atual,a.niveis_total,e.cargo_exigido,(current_date-a.criado_em::date) dias
 from erp_aprovacoes a join erp_aprovacao_etapas e on e.aprovacao_id=a.id and e.nivel=a.nivel_atual where a.status='PENDENTE';

-- ================================================================ C. Auditoria (quem, quando, o quê, antes/depois)
create table if not exists erp_auditoria(
 id bigserial primary key,
 ator varchar(160) not null, acao varchar(20) not null,
 entidade varchar(80) not null, entidade_id varchar(120) not null default '',
 antes jsonb, depois jsonb,
 criado_em timestamptz not null default now()
);
create index if not exists ix_erp_auditoria_ent on erp_auditoria(entidade,entidade_id,criado_em desc);
create index if not exists ix_erp_auditoria_ator on erp_auditoria(ator,criado_em desc);
create or replace function erp_auditoria_imutavel() returns trigger language plpgsql as $$ begin raise exception 'erp_auditoria é um histórico auditável: não pode ser alterado nem apagado'; end $$;
drop trigger if exists tr_erp_auditoria_imutavel on erp_auditoria;
create trigger tr_erp_auditoria_imutavel before update or delete on erp_auditoria for each row execute function erp_auditoria_imutavel();

-- Trigger genérico: o ator vem das colunas atualizado_por / criado_por / encerrada_por da própria linha.
create or replace function erp_auditar() returns trigger language plpgsql as $$
declare v_novo jsonb;v_vel jsonb;v_ator text;v_id text;
begin
 v_novo:=case when TG_OP='DELETE' then null else to_jsonb(NEW) end;
 v_vel:=case when TG_OP='INSERT' then null else to_jsonb(OLD) end;
 v_ator:=coalesce(v_novo->>'atualizado_por',v_novo->>'encerrada_por',nullif(v_novo->>'encerrado_por',''),v_novo->>'criado_por',v_vel->>'criado_por','sistema');
 if v_ator='' then v_ator:=coalesce(v_novo->>'criado_por',v_vel->>'criado_por','sistema');end if;
 v_id:=coalesce(v_novo->>'id',v_vel->>'id','');
 if TG_OP='UPDATE' and v_novo=v_vel then return NEW;end if;
 insert into erp_auditoria(ator,acao,entidade,entidade_id,antes,depois) values(v_ator,TG_OP,TG_TABLE_NAME,v_id,v_vel,v_novo);
 return case when TG_OP='DELETE' then OLD else NEW end;
end$$;
do $$
declare t text;
begin
 foreach t in array array['crm_pedidos_venda','cmp_pedidos','fin_titulos','exp_remessas','est_inventarios','pcp_pedido_revisoes','wms_sobras','wms_picking_listas','wms_recebimentos','erp_aprovacoes','erp_autorizacoes','erp_aprovacao_regras','rh_colaboradores','ehs_ocorrencias','ps_projetos'] loop
  if to_regclass('public.'||t) is not null then
   execute format('drop trigger if exists tr_erp_auditar on %I',t);
   execute format('create trigger tr_erp_auditar after insert or update or delete on %I for each row execute function erp_auditar()',t);
  end if;
 end loop;
end $$;

-- ================================================================ D. Configuração por unidade
create table if not exists erp_config(
 chave varchar(60) primary key, valor text not null, descricao varchar(200) not null default '',
 atualizado_por varchar(160) not null default 'sistema', atualizado_em timestamptz not null default now()
);
insert into erp_config(chave,valor,descricao) values
 ('empresa.nome','Famossul','Nome exibido no login, cabeçalho e documentos impressos'),
 ('revisao.prazo_dias','2','Prazo padrão (dias) para responder uma revisão de pedido')
on conflict do nothing;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-07_30_seguranca_aprovacoes_auditoria.sql','5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-07_30_seguranca_aprovacoes_auditoria.sql','5943c3c806d7fa3b41f36924fec2f388bda55b94f06edc8f1f1762e79f24a444','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-07_30_seguranca_aprovacoes_auditoria','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-07_30_seguranca_aprovacoes_auditoria','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-08_31_embalagem_mrp_horizonte
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-08_31_embalagem_mrp_horizonte.sql; SHA256 1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-07_30_seguranca_aprovacoes_auditoria.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-08_31_embalagem_mrp_horizonte.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-08_31_embalagem_mrp_horizonte.sql' and checksum<>'1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ================================================================ A. Plano de embalagem com lista por pallet e conferência
create table if not exists emb_planos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 pedido varchar(60) not null,
 montagem varchar(30) not null default 'MONTADO_HS',
 status varchar(12) not null default 'RASCUNHO' check(status in('RASCUNHO','EM_EMBALAGEM','FECHADO','CANCELADO')),
 origem varchar(20) not null default 'ROMANEIO',
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 atualizado_por varchar(160) not null default ''
);
create unique index if not exists ux_emb_plano_aberto on emb_planos(pedido) where status in('RASCUNHO','EM_EMBALAGEM');
create table if not exists emb_pallets(
 plano_id uuid not null references emb_planos(id) on delete cascade,
 numero integer not null check(numero>0),
 tipo varchar(30) not null default 'PORTA',
 limite_m3 numeric(10,4), volume_m3 numeric(10,4) not null default 0,
 limite_qtd numeric(12,3), regra text not null default '',
 status varchar(10) not null default 'VALIDO' check(status in('VALIDO','ATENCAO','INVALIDO')),
 pallet_id uuid references pcp_pallets(id),
 fechado_por varchar(160) not null default '', fechado_em timestamptz,
 primary key(plano_id,numero)
);
create table if not exists emb_itens(
 plano_id uuid not null, pallet_numero integer not null, linha integer not null check(linha>0),
 descricao varchar(300) not null, medida varchar(80) not null default '',
 quantidade numeric(12,3) not null check(quantidade>0),
 qtd_conferida numeric(12,3) check(qtd_conferida is null or qtd_conferida>=0),
 observacao varchar(300) not null default '',
 conferido_por varchar(160) not null default '', conferido_em timestamptz,
 primary key(plano_id,pallet_numero,linha),
 foreign key(plano_id,pallet_numero) references emb_pallets(plano_id,numero) on delete cascade
);

create or replace function emb_plano_criar(p_pedido text,p_montagem text,p_pallets jsonb,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_p jsonb;v_i jsonb;v_l integer;v_n integer:=0;
begin
 if coalesce(trim(p_pedido),'')='' then raise exception 'Informe o pedido';end if;
 if wms_pedido_em_revisao(p_pedido) then raise exception 'REVISAO_ABERTA: o pedido % tem revisão aberta e não pode ser embalado',p_pedido;end if;
 if jsonb_typeof(p_pallets)<>'array' or jsonb_array_length(p_pallets)=0 then raise exception 'O plano não tem pallets';end if;
 if exists(select 1 from emb_planos where pedido=p_pedido and status in('RASCUNHO','EM_EMBALAGEM')) then raise exception 'O pedido % já tem um plano de embalagem em aberto',p_pedido;end if;
 insert into emb_planos(pedido,montagem,criado_por) values(p_pedido,coalesce(nullif(p_montagem,''),'MONTADO_HS'),p_ator) returning id into v_id;
 for v_p in select * from jsonb_array_elements(p_pallets) loop
  v_n:=v_n+1;
  insert into emb_pallets(plano_id,numero,tipo,limite_m3,volume_m3,limite_qtd,regra,status)
  values(v_id,v_n,left(coalesce(v_p->>'tipo','PORTA'),30),nullif(v_p->>'limiteM3','')::numeric,coalesce(nullif(v_p->>'volumeM3','')::numeric,0),nullif(v_p->>'limiteQtd','')::numeric,coalesce(v_p->>'regra',''),
   case when upper(coalesce(v_p->>'status','VALIDO')) in('VALIDO','ATENCAO','INVALIDO') then upper(coalesce(v_p->>'status','VALIDO')) else 'VALIDO' end);
  v_l:=0;
  for v_i in select * from jsonb_array_elements(coalesce(v_p->'itens','[]'::jsonb)) loop
   if coalesce((v_i->>'quantidade')::numeric,0)<=0 then continue;end if;
   v_l:=v_l+1;
   insert into emb_itens(plano_id,pallet_numero,linha,descricao,medida,quantidade) values(v_id,v_n,v_l,left(coalesce(v_i->>'descricao','Item'),300),left(coalesce(v_i->>'medida',''),80),(v_i->>'quantidade')::numeric);
  end loop;
  if v_l=0 then raise exception 'O pallet % não tem itens',v_n;end if;
 end loop;
 return v_id;
end$$;

create or replace function emb_conferir(p_plano uuid,p_pallet integer,p_linha integer,p_qtd numeric,p_obs text,p_ator text) returns void language plpgsql as $$
declare v_st text;v_pf timestamptz;v_q numeric;
begin
 if p_qtd is null or p_qtd<0 then raise exception 'Quantidade conferida inválida';end if;
 select status into v_st from emb_planos where id=p_plano for update;
 if v_st is null or v_st in('FECHADO','CANCELADO') then raise exception 'Plano encerrado ou inexistente';end if;
 select fechado_em into v_pf from emb_pallets where plano_id=p_plano and numero=p_pallet;
 if v_pf is not null then raise exception 'Pallet % já está fechado',p_pallet;end if;
 select quantidade into v_q from emb_itens where plano_id=p_plano and pallet_numero=p_pallet and linha=p_linha;
 if v_q is null then raise exception 'Item não encontrado';end if;
 if p_qtd<>v_q and coalesce(trim(p_obs),'')='' then raise exception 'DIVERGENCIA: conferido % de % — informe a observação',p_qtd,v_q;end if;
 update emb_itens set qtd_conferida=p_qtd,observacao=coalesce(p_obs,''),conferido_por=p_ator,conferido_em=now() where plano_id=p_plano and pallet_numero=p_pallet and linha=p_linha;
 update emb_planos set status='EM_EMBALAGEM',atualizado_em=now(),atualizado_por=p_ator where id=p_plano and status='RASCUNHO';
end$$;

create or replace function emb_pallet_fechar(p_plano uuid,p_pallet integer,p_ator text) returns uuid language plpgsql as $$
declare v_pl record;v_pa record;v_cod text;v_pid uuid;v_pend integer;v_div integer;v_total numeric;v_abertos integer;
begin
 select * into v_pl from emb_planos where id=p_plano for update;
 if not found or v_pl.status in('FECHADO','CANCELADO') then raise exception 'Plano encerrado ou inexistente';end if;
 if wms_pedido_em_revisao(v_pl.pedido) then raise exception 'REVISAO_ABERTA: o pedido % tem revisão aberta',v_pl.pedido;end if;
 select * into v_pa from emb_pallets where plano_id=p_plano and numero=p_pallet for update;
 if not found then raise exception 'Pallet não encontrado';end if;
 if v_pa.fechado_em is not null then raise exception 'Pallet já fechado';end if;
 if v_pa.status='INVALIDO' then raise exception 'PALLET_INVALIDO: o pallet excede as regras (%). Replaneje antes de fechar',v_pa.regra;end if;
 select count(*) filter(where qtd_conferida is null),count(*) filter(where qtd_conferida is not null and qtd_conferida<>quantidade),sum(quantidade) into v_pend,v_div,v_total from emb_itens where plano_id=p_plano and pallet_numero=p_pallet;
 if v_pend>0 then raise exception 'Confira todos os itens antes de fechar (% sem conferência)',v_pend;end if;
 if v_div>0 then raise exception 'DIVERGENCIA: % item(ns) conferido(s) diferente(s) do plano; corrija ou replaneje',v_div;end if;
 v_cod:=emb_codigo_pallet(v_pl.pedido,p_pallet);
 insert into pcp_pallets(codigo,pedido,pallet,tipo_produto,quantidade,jogos,status,criado_por)
 values(v_cod,v_pl.pedido,v_cod,v_pa.tipo,v_total,case when v_pa.tipo<>'PORTA' then v_total else 0 end,'AGUARDANDO_INSPECAO',p_ator) returning id into v_pid;
 update emb_pallets set pallet_id=v_pid,fechado_por=p_ator,fechado_em=now() where plano_id=p_plano and numero=p_pallet;
 select count(*) into v_abertos from emb_pallets where plano_id=p_plano and fechado_em is null;
 update emb_planos set status=case when v_abertos=0 then 'FECHADO' else 'EM_EMBALAGEM' end,atualizado_em=now(),atualizado_por=p_ator where id=p_plano;
 return v_pid;
end$$;
create or replace function emb_codigo_pallet(p_pedido text,p_num integer) returns text language sql immutable as $$ select p_pedido||'-P'||lpad(p_num::text,2,'0') $$;

create or replace function emb_plano_cancelar(p_plano uuid,p_ator text) returns void language plpgsql as $$
begin
 if exists(select 1 from emb_pallets where plano_id=p_plano and fechado_em is not null) then raise exception 'Há pallet fechado: não é possível cancelar o plano';end if;
 update emb_planos set status='CANCELADO',atualizado_em=now(),atualizado_por=p_ator where id=p_plano and status in('RASCUNHO','EM_EMBALAGEM');
 if not found then raise exception 'Plano não está em aberto';end if;
end$$;

create or replace view emb_v_resumo as
 select p.id,p.numero,p.pedido,p.montagem,p.status,p.criado_em,
  (select count(*) from emb_pallets x where x.plano_id=p.id) pallets,
  (select count(*) from emb_pallets x where x.plano_id=p.id and x.fechado_em is not null) fechados,
  (select count(*) from emb_pallets x where x.plano_id=p.id and x.status='INVALIDO') invalidos,
  wms_pedido_em_revisao(p.pedido) em_revisao
 from emb_planos p;

-- ================================================================ B. MRP por horizonte (mês atual, próximo mês, janela livre)
create or replace function erp_mrp_liquido_periodo(p_ini date,p_fim date)
returns table(produto_id uuid,codigo text,descricao text,classificacao text,necessidade_bruta numeric,saldo_livre numeric,em_compra numeric,em_producao numeric,necessidade_liquida numeric,acao text,prazo_mais_cedo date)
language sql stable as $$
 with bruta as (
  select m.produto_id,
   sum(greatest(0,m.necessidade-coalesce((select sum(x.quantidade_base) from est_movimentos x where x.of_id=m.of_id and x.produto_id=m.produto_id and x.tipo='SAIDA' and x.estorno_de is null),0))) q,
   min(o.prazo) prazo
  from erp_of_materiais m join erp_ordens_fabricacao o on o.id=m.of_id
  where o.status in ('PLANEJADA','LIBERADA') and (p_ini is null or o.prazo>=p_ini) and (p_fim is null or o.prazo<=p_fim) group by 1),
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-08_31_embalagem_mrp_horizonte.sql','1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-08_31_embalagem_mrp_horizonte.sql','1ac3c0601d83c38150f9c7f27cfe53888bbbe15358ab75d9becb191758aa5498','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-08_31_embalagem_mrp_horizonte','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-08_31_embalagem_mrp_horizonte','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-09_32_compras_qualidade_comercial
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-09_32_compras_qualidade_comercial.sql; SHA256 582fa4138cbb66838170a6d1dedbe91fba6c02e4d37b0bfcb2a07fc95b84ff36
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-08_31_embalagem_mrp_horizonte.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-09_32_compras_qualidade_comercial.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-09_32_compras_qualidade_comercial.sql' and checksum<>'582fa4138cbb66838170a6d1dedbe91fba6c02e4d37b0bfcb2a07fc95b84ff36') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-09_32_compras_qualidade_comercial.sql','582fa4138cbb66838170a6d1dedbe91fba6c02e4d37b0bfcb2a07fc95b84ff36',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-09_32_compras_qualidade_comercial.sql','582fa4138cbb66838170a6d1dedbe91fba6c02e4d37b0bfcb2a07fc95b84ff36','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-09_32_compras_qualidade_comercial','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-09_32_compras_qualidade_comercial','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-10_33_financeiro_fechamento_rateio_margem
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-10_33_financeiro_fechamento_rateio_margem.sql; SHA256 e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-09_32_compras_qualidade_comercial.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-10_33_financeiro_fechamento_rateio_margem.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-10_33_financeiro_fechamento_rateio_margem.sql' and checksum<>'e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
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
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-10_33_financeiro_fechamento_rateio_margem.sql','e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-10_33_financeiro_fechamento_rateio_margem.sql','e57d3ec9357f43e29a1fec73ed7f010a34a71980f76a9990b3250d38ddc8f08c','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-10_33_financeiro_fechamento_rateio_margem','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-10_33_financeiro_fechamento_rateio_margem','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-11_34_plataforma_eventos_campos_notificacoes
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-11_34_plataforma_eventos_campos_notificacoes.sql; SHA256 c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-10_33_financeiro_fechamento_rateio_margem.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-11_34_plataforma_eventos_campos_notificacoes.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-11_34_plataforma_eventos_campos_notificacoes.sql' and checksum<>'c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

-- ============ A. API v1: novos escopos e eventos de webhook
do $$
declare r record;
begin
 for r in select conname from pg_constraint where conrelid='sys_tokens_api'::regclass and contype='c' and pg_get_constraintdef(oid) like '%escopos%' loop
  execute format('alter table sys_tokens_api drop constraint %I',r.conname);
 end loop;
 alter table sys_tokens_api add constraint sys_tokens_api_escopos_check check(escopos<@array['leitura','indicadores','alertas','pedidos','ordens','estoque','qualidade']::text[]);
 for r in select conname from pg_constraint where conrelid='sys_webhooks'::regclass and contype='c' and pg_get_constraintdef(oid) like '%eventos%' loop
  execute format('alter table sys_webhooks drop constraint %I',r.conname);
 end loop;
 alter table sys_webhooks add constraint sys_webhooks_eventos_check check(array_length(eventos,1)>0 and eventos<@array['alerta.criado','pedido.status','remessa.entregue','ordem.concluida','nc.aberta','aprovacao.decidida','periodo.fechado']::text[]);
end$$;

-- ============ B. Outbox durável de eventos (registra sempre; entrega via fila de webhooks)
create table if not exists erp_eventos(
 id bigserial primary key,
 tipo varchar(40) not null,
 payload jsonb not null default '{}'::jsonb,
 entregas integer not null default 0,
 criado_em timestamptz not null default now()
);
create index if not exists ix_erp_eventos_tipo on erp_eventos(tipo,criado_em desc);
create or replace function erp_evento(p_tipo text,p_payload jsonb) returns integer language plpgsql as $$
declare n integer;
begin
 n=sys_emitir_evento(p_tipo,p_payload);
 insert into erp_eventos(tipo,payload,entregas) values(p_tipo,p_payload,n);
 return n;
end$$;

create or replace function erp_trg_ev_of() returns trigger language plpgsql as $$
begin
 if new.status='CONCLUIDA' and old.status is distinct from 'CONCLUIDA' then perform erp_evento('ordem.concluida',jsonb_build_object('numero',new.numero,'pedido',new.pedido,'quantidade',new.quantidade));end if;
 return new;
end$$;
drop trigger if exists erp_ev_of_t on erp_ordens_fabricacao;
create trigger erp_ev_of_t after update of status on erp_ordens_fabricacao for each row execute function erp_trg_ev_of();

create or replace function erp_trg_ev_nc() returns trigger language plpgsql as $$
begin
 perform erp_evento('nc.aberta',jsonb_build_object('numero',new.numero,'origem',new.origem,'descricao',left(new.descricao,200)));
 return new;
end$$;
drop trigger if exists erp_ev_nc_t on qld_nao_conformidades;
create trigger erp_ev_nc_t after insert on qld_nao_conformidades for each row execute function erp_trg_ev_nc();

create or replace function erp_trg_ev_aprov() returns trigger language plpgsql as $$
begin
 if new.status in('APROVADO','REJEITADO') and old.status is distinct from new.status then
  perform erp_evento('aprovacao.decidida',jsonb_build_object('numero',new.numero,'modulo',new.modulo,'documento',new.documento_ref,'status',new.status,'valor',new.valor));
 end if;
 return new;
end$$;
drop trigger if exists erp_ev_aprov_t on erp_aprovacoes;
create trigger erp_ev_aprov_t after update of status on erp_aprovacoes for each row execute function erp_trg_ev_aprov();

create or replace function erp_trg_ev_periodo() returns trigger language plpgsql as $$
begin
 if new.status='FECHADO' and (tg_op='INSERT' or old.status is distinct from 'FECHADO') then perform erp_evento('periodo.fechado',jsonb_build_object('competencia',new.competencia));end if;
 return new;
end$$;
drop trigger if exists erp_ev_periodo_t on fin_periodos;
create trigger erp_ev_periodo_t after insert or update of status on fin_periodos for each row execute function erp_trg_ev_periodo();

-- ============ C. Campos customizados por entidade
create table if not exists erp_campos_def(
 id uuid primary key default gen_random_uuid(),
 entidade varchar(24) not null check(entidade in('PEDIDO_VENDA','CLIENTE','PRODUTO','FORNECEDOR','ORDEM_FABRICACAO','NAO_CONFORMIDADE')),
 chave varchar(40) not null check(chave ~ '^[a-z][a-z0-9_]{1,39}$'),
 rotulo varchar(80) not null,
 tipo varchar(8) not null check(tipo in('TEXTO','NUMERO','DATA','BOOLEANO','LISTA')),
 opcoes jsonb not null default '[]'::jsonb check(jsonb_typeof(opcoes)='array'),
 obrigatorio boolean not null default false,
 ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 unique(entidade,chave),
 check(tipo<>'LISTA' or jsonb_array_length(opcoes)>0)
);
create table if not exists erp_campos_valores(
 entidade varchar(24) not null, registro_id varchar(80) not null, chave varchar(40) not null,
 valor jsonb not null, atualizado_por varchar(160) not null, atualizado_em timestamptz not null default now(),
 primary key(entidade,registro_id,chave),
 foreign key(entidade,chave) references erp_campos_def(entidade,chave) on update cascade
);
create or replace function erp_campo_gravar(p_ent text,p_reg text,p_chave text,p_valor jsonb,p_ator text) returns void language plpgsql as $$
declare d erp_campos_def%rowtype;
begin
 select * into d from erp_campos_def where entidade=p_ent and chave=p_chave and ativo;
 if not found then raise exception 'Campo inexistente ou inativo';end if;
 if p_valor is null or p_valor='null'::jsonb or p_valor='""'::jsonb then
  if d.obrigatorio then raise exception 'CAMPO_OBRIGATORIO: %',d.rotulo;end if;
  delete from erp_campos_valores where entidade=p_ent and registro_id=p_reg and chave=p_chave;return;
 end if;
 if d.tipo='NUMERO' and jsonb_typeof(p_valor)<>'number' then raise exception 'CAMPO_INVALIDO: % deve ser número',d.rotulo;end if;
 if d.tipo='BOOLEANO' and jsonb_typeof(p_valor)<>'boolean' then raise exception 'CAMPO_INVALIDO: % deve ser verdadeiro/falso',d.rotulo;end if;
 if d.tipo='DATA' and (jsonb_typeof(p_valor)<>'string' or (p_valor#>>'{}') !~ '^\d{4}-\d{2}-\d{2}$') then raise exception 'CAMPO_INVALIDO: % deve ser data AAAA-MM-DD',d.rotulo;end if;
 if d.tipo='TEXTO' and (jsonb_typeof(p_valor)<>'string' or length(p_valor#>>'{}')>500) then raise exception 'CAMPO_INVALIDO: % deve ter até 500 caracteres',d.rotulo;end if;
 if d.tipo='LISTA' and not d.opcoes @> jsonb_build_array(p_valor) then raise exception 'CAMPO_INVALIDO: % fora das opções',d.rotulo;end if;
 insert into erp_campos_valores(entidade,registro_id,chave,valor,atualizado_por) values(p_ent,p_reg,p_chave,p_valor,p_ator)
  on conflict(entidade,registro_id,chave) do update set valor=excluded.valor,atualizado_por=excluded.atualizado_por,atualizado_em=now();
end$$;

-- ============ D. Central de notificações (por usuário ou por cargo, com leitura individual)
create table if not exists erp_notificacoes(
 id uuid primary key default gen_random_uuid(),
 usuario varchar(160), cargo varchar(20),
 tipo varchar(20) not null default 'INFO' check(tipo in('INFO','APROVACAO','ALERTA','QUALIDADE','FINANCEIRO')),
 titulo varchar(160) not null, corpo text not null default '', link varchar(160) not null default '',
 criado_em timestamptz not null default now()
);
create index if not exists ix_erp_notif on erp_notificacoes(cargo,usuario,criado_em desc);
create table if not exists erp_notificacoes_leituras(
 notificacao_id uuid not null references erp_notificacoes(id) on delete cascade, usuario varchar(160) not null, lida_em timestamptz not null default now(),
 primary key(notificacao_id,usuario)
);
create or replace function erp_notificar(p_usuario text,p_cargo text,p_tipo text,p_titulo text,p_corpo text,p_link text) returns uuid language plpgsql as $$
declare v uuid;
begin
 if coalesce(p_usuario,'')='' and coalesce(p_cargo,'')='' then raise exception 'Informe usuário ou cargo de destino';end if;
 insert into erp_notificacoes(usuario,cargo,tipo,titulo,corpo,link) values(nullif(p_usuario,''),nullif(p_cargo,''),p_tipo,left(p_titulo,160),coalesce(p_corpo,''),coalesce(p_link,'')) returning id into v;
 return v;
end$$;
create or replace function erp_notificacoes_do_usuario(p_usuario text,p_cargo text,p_limite int default 50) returns table(id uuid,tipo text,titulo text,corpo text,link text,criado_em timestamptz,lida boolean) language sql stable as $$
 select n.id,n.tipo::text,n.titulo::text,n.corpo,n.link::text,n.criado_em,exists(select 1 from erp_notificacoes_leituras l where l.notificacao_id=n.id and l.usuario=p_usuario)
 from erp_notificacoes n where n.usuario=p_usuario or (n.usuario is null and n.cargo=p_cargo)
 order by n.criado_em desc limit least(greatest(p_limite,1),200)$$;
create or replace function erp_notificacao_ler(p_id uuid,p_usuario text) returns void language sql as $$
 insert into erp_notificacoes_leituras(notificacao_id,usuario) values(p_id,p_usuario) on conflict do nothing$$;

create or replace function erp_trg_notif_aprov() returns trigger language plpgsql as $$
begin
 perform erp_notificar(null,'GERENTE','APROVACAO','Aprovação pendente #'||new.numero,new.modulo||' · '||new.documento_ref||' · R$ '||new.valor,'/seguranca');
 return new;
end$$;
drop trigger if exists erp_notif_aprov_t on erp_aprovacoes;
create trigger erp_notif_aprov_t after insert on erp_aprovacoes for each row execute function erp_trg_notif_aprov();
create or replace function erp_trg_notif_nc() returns trigger language plpgsql as $$
begin
 perform erp_notificar(null,'QUALIDADE','QUALIDADE','Nova não conformidade #'||new.numero,left(new.descricao,200),'/qualidade-inspecao');
 return new;
end$$;
drop trigger if exists erp_notif_nc_t on qld_nao_conformidades;
create trigger erp_notif_nc_t after insert on qld_nao_conformidades for each row execute function erp_trg_notif_nc();
create or replace function erp_trg_notif_alerta() returns trigger language plpgsql as $$
begin
 if new.severidade='ALTA' then perform erp_notificar(null,'PCP','ALERTA',new.tipo||': '||left(new.mensagem,120),new.mensagem,new.link);end if;
 return new;
end$$;
drop trigger if exists erp_notif_alerta_t on sys_alertas;
create trigger erp_notif_alerta_t after insert on sys_alertas for each row execute function erp_trg_notif_alerta();

-- ============ E. Painel por função (cartões contados no banco)
create or replace function erp_painel_funcao(p_cargo text) returns jsonb language plpgsql stable as $$
declare r jsonb:='[]'::jsonb;
begin
 if p_cargo in('PCP','GERENTE','DIRETOR','ADMINISTRADOR') then
  r=r||jsonb_build_object('chave','aprovacoes','rotulo','Aprovações pendentes','valor',(select count(*) from erp_aprovacoes where status='PENDENTE'),'link','/seguranca');
  r=r||jsonb_build_object('chave','alertas','rotulo','Alertas abertos','valor',(select count(*) from sys_alertas where resolvido_em is null),'link','/indicadores');
  r=r||jsonb_build_object('chave','ofs_atrasadas','rotulo','OFs atrasadas','valor',(select count(*) from erp_ordens_fabricacao where status in('PLANEJADA','LIBERADA') and prazo<current_date),'link','/ordens-fabricacao');
  r=r||jsonb_build_object('chave','revisoes','rotulo','Revisões de pedido abertas','valor',(select count(*) from pcp_pedido_revisoes where status in('ABERTA','EM_ANALISE','AGUARDANDO_FABRICA')),'link','/wms');
 end if;
 if p_cargo in('PCP','GERENTE','DIRETOR','ADMINISTRADOR','QUALIDADE') then
  r=r||jsonb_build_object('chave','ncs','rotulo','NCs abertas','valor',(select count(*) from qld_nao_conformidades where status<>'ENCERRADA'),'link','/qualidade-inspecao');
 end if;
 if p_cargo in('GERENTE','DIRETOR','ADMINISTRADOR','PCP') then
  r=r||jsonb_build_object('chave','receber_vencido','rotulo','A receber vencido','valor',(select coalesce(sum(valor-valor_baixado),0) from fin_titulos where tipo='RECEBER' and status in('ABERTO','PARCIAL') and vencimento<current_date),'link','/financeiro','moeda',true);
  r=r||jsonb_build_object('chave','pagar_vencido','rotulo','A pagar vencido','valor',(select coalesce(sum(valor-valor_baixado),0) from fin_titulos where tipo='PAGAR' and status in('ABERTO','PARCIAL') and vencimento<current_date),'link','/financeiro','moeda',true);
 end if;
 if p_cargo in('LOGISTICA','PCP','GERENTE','ENCARREGADO') then
  r=r||jsonb_build_object('chave','embalagem','rotulo','Planos de embalagem em aberto','valor',(select count(*) from emb_planos where status in('RASCUNHO','EM_EMBALAGEM')),'link','/embalagem');
 end if;
 if p_cargo in('ENCARREGADO','SUPERVISOR','LIDER','PCP','GERENTE') then
  r=r||jsonb_build_object('chave','ofs_liberadas','rotulo','OFs liberadas','valor',(select count(*) from erp_ordens_fabricacao where status='LIBERADA'),'link','/ordens-fabricacao');
 end if;
 return r;
end$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-11_34_plataforma_eventos_campos_notificacoes.sql','c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-11_34_plataforma_eventos_campos_notificacoes.sql','c44674b0e625ab3f9b53f8efff59ab2bfe6b44fa464e1ba5d771221a6ee65594','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-11_34_plataforma_eventos_campos_notificacoes','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-11_34_plataforma_eventos_campos_notificacoes','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

-- >>>>> 2026-11-12_35_pessoas_ehs_projetos
do $ZZ8$ begin
 execute $ZZ9$-- GERADO do arquivo canônico 2026-11-12_35_pessoas_ehs_projetos.sql; SHA256 13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-11-11_34_plataforma_eventos_campos_notificacoes.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.

select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-11-12_35_pessoas_ehs_projetos.sql' and status in('APLICADA','BASELINE')) then null;end if;
 if exists(select 1 from schema_migrations where name='2026-11-12_35_pessoas_ehs_projetos.sql' and checksum<>'13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

insert into erp_config(chave,valor,descricao) values
 ('rh.jornada_horas','8','Jornada diária padrão (horas) usada no banco de horas'),
 ('rh.encargos_pct','70','Encargos sobre o salário para custo de hora-homem (%)'),
 ('rh.horas_mes','220','Horas mensais para custo/hora')
on conflict(chave) do nothing;

create or replace function rh_cfg(p_chave text,p_padrao numeric) returns numeric language sql stable as $$
 select coalesce((select nullif(valor,'')::numeric from erp_config where chave=p_chave),p_padrao)$$;

-- ============ A. Banco de horas (ponto x jornada + lançamentos de compensação/pagamento)
create table if not exists rh_banco_horas_lanc(
 id uuid primary key default gen_random_uuid(),
 colaborador_id uuid not null references rh_colaboradores(id) on delete cascade,
 data date not null, horas numeric(6,2) not null check(horas<>0 and abs(horas)<=240),
 tipo varchar(12) not null check(tipo in('COMPENSACAO','PAGAMENTO','AJUSTE')),
 motivo varchar(300) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create index if not exists ix_rh_bh_colab on rh_banco_horas_lanc(colaborador_id,data);
create or replace view rh_v_banco_horas as
select c.id colaborador_id,c.matricula,c.nome,c.setor,
 coalesce((select sum(p.horas-rh_cfg('rh.jornada_horas',8)) from rh_ponto p where p.colaborador_id=c.id and p.horas>0 and extract(isodow from p.data) between 1 and 5),0)
 +coalesce((select sum(p.horas) from rh_ponto p where p.colaborador_id=c.id and p.horas>0 and extract(isodow from p.data) in(6,7)),0) saldo_ponto,
 coalesce((select sum(l.horas) from rh_banco_horas_lanc l where l.colaborador_id=c.id),0) lancamentos
from rh_colaboradores c where c.status<>'DESLIGADO';
create or replace function rh_banco_saldo(p_colab uuid) returns numeric language sql stable as $$
 select round(saldo_ponto+lancamentos,2) from rh_v_banco_horas where colaborador_id=p_colab$$;
create or replace function rh_banco_lancar(p_colab uuid,p_data date,p_horas numeric,p_tipo text,p_motivo text,p_ator text) returns numeric language plpgsql as $$
declare s numeric;
begin
 if p_tipo in('COMPENSACAO','PAGAMENTO') and p_horas>0 then raise exception 'Compensação/pagamento deve ser negativo (baixa do saldo)';end if;
 if length(trim(coalesce(p_motivo,'')))<3 then raise exception 'Informe o motivo';end if;
 s=rh_banco_saldo(p_colab);
 if s is null then raise exception 'Colaborador inexistente ou desligado';end if;
 if p_horas<0 and s+p_horas<0 and p_tipo<>'AJUSTE' then raise exception 'SALDO_INSUFICIENTE: saldo % h, baixa % h',s,-p_horas;end if;
 insert into rh_banco_horas_lanc(colaborador_id,data,horas,tipo,motivo,criado_por) values(p_colab,p_data,p_horas,p_tipo,p_motivo,p_ator);
 return rh_banco_saldo(p_colab);
end$$;

-- ============ B. Férias: períodos aquisitivo/concessivo, saldo e regras de fracionamento
create or replace function rh_ciclo_ferias(p_admissao date,p_data date) returns integer language sql immutable as $$
 select date_part('year',age(p_data,p_admissao))::int$$;

create or replace function rh_trg_ferias() returns trigger language plpgsql as $$
declare adm date;ciclo int;usados int;fracoes int;dias int;
begin
 if exists(select 1 from rh_ausencias a where a.colaborador_id=new.colaborador_id and a.id<>new.id and daterange(a.inicio,a.fim,'[]')&&daterange(new.inicio,new.fim,'[]')) then raise exception 'AUSENCIA_SOBREPOSTA: já existe ausência neste período';end if;
 if new.tipo<>'FERIAS' then return new;end if;
 select admissao into adm from rh_colaboradores where id=new.colaborador_id;
 ciclo=rh_ciclo_ferias(adm,new.inicio);
 if ciclo<1 then raise exception 'FERIAS_SEM_DIREITO: o colaborador ainda não completou o período aquisitivo de 12 meses';end if;
 dias=new.fim-new.inicio+1;
 if dias<5 then raise exception 'FERIAS_FRACAO: cada fração deve ter ao menos 5 dias';end if;
 select coalesce(sum(a.fim-a.inicio+1),0),count(*) into usados,fracoes from rh_ausencias a where a.colaborador_id=new.colaborador_id and a.tipo='FERIAS' and a.id<>new.id and rh_ciclo_ferias(adm,a.inicio)=ciclo;
 if usados+dias>30 then raise exception 'FERIAS_SALDO: o ciclo % permite 30 dias; já usados %, solicitados %',ciclo,usados,dias;end if;
 if fracoes>=3 then raise exception 'FERIAS_FRACAO: máximo de 3 frações por ciclo';end if;
 if fracoes>=1 and not exists(select 1 from rh_ausencias a where a.colaborador_id=new.colaborador_id and a.tipo='FERIAS' and a.id<>new.id and rh_ciclo_ferias(adm,a.inicio)=ciclo and a.fim-a.inicio+1>=14) and dias<14 and usados+dias<30 and fracoes=2 then
  raise exception 'FERIAS_FRACAO: uma das frações deve ter ao menos 14 dias';end if;
 return new;
end$$;
drop trigger if exists rh_ferias_t on rh_ausencias;
create trigger rh_ferias_t before insert on rh_ausencias for each row execute function rh_trg_ferias();

create or replace view rh_v_ferias_saldo as
select c.id colaborador_id,c.matricula,c.nome,g.ciclo,
 (c.admissao+(g.ciclo||' years')::interval)::date aquisitivo_fim,
 (c.admissao+((g.ciclo+1)||' years')::interval)::date concessivo_limite,
 30-coalesce((select sum(a.fim-a.inicio+1) from rh_ausencias a where a.colaborador_id=c.id and a.tipo='FERIAS' and rh_ciclo_ferias(c.admissao,a.inicio)=g.ciclo),0)::int saldo_dias,
 ((c.admissao+((g.ciclo+1)||' years')::interval)::date-current_date) dias_para_vencer
from rh_colaboradores c cross join lateral generate_series(1,greatest(rh_ciclo_ferias(c.admissao,current_date),0)) g(ciclo)
where c.status<>'DESLIGADO';

-- ============ C. RH <-> login <-> custo (hora-homem) e apropriação em projetos
create unique index if not exists ux_rh_colab_login on rh_colaboradores(lower(usuario_login)) where usuario_login<>'';
create or replace function rh_custo_hora(p_colab uuid) returns numeric language sql stable as $$
 select round(salario_base*(1+rh_cfg('rh.encargos_pct',70)/100)/nullif(rh_cfg('rh.horas_mes',220),0),2) from rh_colaboradores where id=p_colab$$;
create or replace view rh_v_colaborador_custo as
select c.id,c.matricula,c.nome,c.setor,c.status,c.usuario_login,r.nome cargo,c.salario_base,rh_custo_hora(c.id) custo_hora,
 (c.status='DESLIGADO' and c.usuario_login<>'') login_a_desativar
from rh_colaboradores c left join rh_cargos r on r.id=c.cargo_id;
create or replace function ps_apontar_horas(p_proj uuid,p_colab uuid,p_horas numeric,p_data date,p_ator text) returns numeric language plpgsql as $$
declare v numeric;nome text;
begin
 if p_horas<=0 or p_horas>24 then raise exception 'Horas inválidas';end if;
 select rh_custo_hora(id),c.nome into v,nome from rh_colaboradores c where c.id=p_colab and c.status<>'DESLIGADO';
 if v is null or v<=0 then raise exception 'Colaborador sem salário base ou desligado';end if;
 insert into ps_custos(projeto_id,data,descricao,valor,criado_por) values(p_proj,p_data,'Mão de obra: '||nome||' · '||p_horas||' h',round(v*p_horas,2),p_ator);
 return round(v*p_horas,2);
end$$;

-- ============ D. EHS: inspeções, CAT obrigatória e encerramento de acidente grave
alter table ehs_ocorrencias add column if not exists cat_numero varchar(40) not null default '';
alter table ehs_ocorrencias add column if not exists cat_data date;
create or replace function ehs_trg_encerrar() returns trigger language plpgsql as $$
begin
 if new.status='ENCERRADA' and old.status is distinct from 'ENCERRADA' and new.tipo='ACIDENTE' and new.gravidade='GRAVE' and new.colaborador_id is not null and (new.cat_numero='' or new.cat_data is null) then
  raise exception 'CAT_OBRIGATORIA: acidente grave com colaborador exige o número e a data da CAT antes de encerrar';end if;
 if new.status='ENCERRADA' and old.status is distinct from 'ENCERRADA' then new.emitiu_cat=new.emitiu_cat or new.cat_numero<>'';end if;
 return new;
end$$;
drop trigger if exists ehs_encerrar_t on ehs_ocorrencias;
create trigger ehs_encerrar_t before update on ehs_ocorrencias for each row execute function ehs_trg_encerrar();

create table if not exists ehs_inspecoes(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(14) not null check(tipo in('EPI','MAQUINA','AMBIENTE','EXTINTOR','GERAL')),
 setor varchar(80) not null default '', data date not null default current_date,
 itens jsonb not null check(jsonb_typeof(itens)='array' and jsonb_array_length(itens)>0),
 total integer not null, nao_conformes integer not null default 0,
 ocorrencia_id uuid references ehs_ocorrencias(id) on delete set null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create or replace function ehs_inspecao_registrar(p_tipo text,p_setor text,p_data date,p_itens jsonb,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;v_nc int;v_tot int;v_oc uuid;x jsonb;v_desc text:='';
begin
 v_tot=jsonb_array_length(p_itens);
 for x in select value from jsonb_array_elements(p_itens) loop
  if coalesce(x->>'item','')='' or jsonb_typeof(x->'conforme')<>'boolean' then raise exception 'Cada item precisa de descrição e conformidade (verdadeiro/falso)';end if;
  if (x->>'conforme')::boolean=false then
   if length(trim(coalesce(x->>'obs','')))<3 then raise exception 'ITEM_SEM_OBS: descreva o problema do item "%"',x->>'item';end if;
   v_nc=coalesce(v_nc,0)+1;v_desc=v_desc||(x->>'item')||': '||(x->>'obs')||'; ';
  end if;
 end loop;
 v_nc=coalesce(v_nc,0);
 if v_nc>0 then
  insert into ehs_ocorrencias(tipo,data,setor,gravidade,descricao,criado_por) values('INCIDENTE',p_data,coalesce(p_setor,''),case when v_nc*3>=v_tot then 'MODERADA' else 'LEVE' end,'Inspeção '||p_tipo||' com '||v_nc||' não conformidade(s): '||left(v_desc,1500),p_ator) returning id into v_oc;
 end if;
 insert into ehs_inspecoes(tipo,setor,data,itens,total,nao_conformes,ocorrencia_id,criado_por) values(p_tipo,coalesce(p_setor,''),p_data,p_itens,v_tot,v_nc,v_oc,p_ator) returning id into v_id;
 return v_id;
end$$;

-- ============ E. Projetos: dependências múltiplas, reprogramação em cascata e caminho crítico
create table if not exists ps_tarefa_dependencias(
 tarefa_id uuid not null references ps_tarefas(id) on delete cascade,
 predecessora_id uuid not null references ps_tarefas(id) on delete cascade,
 folga_dias integer not null default 0 check(folga_dias between 0 and 365),
 primary key(tarefa_id,predecessora_id), check(tarefa_id<>predecessora_id)
);
insert into ps_tarefa_dependencias(tarefa_id,predecessora_id) select id,predecessora_id from ps_tarefas where predecessora_id is not null on conflict do nothing;
create or replace function ps_trg_dep() returns trigger language plpgsql as $$
begin
 if (select projeto_id from ps_tarefas where id=new.tarefa_id)<>(select projeto_id from ps_tarefas where id=new.predecessora_id) then raise exception 'Dependência entre projetos diferentes não é permitida';end if;
 if exists(with recursive alc(id) as (select new.predecessora_id union select d.predecessora_id from ps_tarefa_dependencias d join alc on d.tarefa_id=alc.id) select 1 from alc where id=new.tarefa_id) then
  raise exception 'DEPENDENCIA_CIRCULAR: a dependência criaria um ciclo';end if;
 return new;
end$$;
drop trigger if exists ps_dep_t on ps_tarefa_dependencias;
create trigger ps_dep_t before insert or update on ps_tarefa_dependencias for each row execute function ps_trg_dep();

create or replace function ps_reprogramar(p_tarefa uuid,p_inicio date,p_ator text) returns integer language plpgsql as $$
declare t ps_tarefas%rowtype;dur int;mexidas int:=1;pass int:=0;r record;novo date;
begin
 select * into strict t from ps_tarefas where id=p_tarefa for update;
 dur=t.fim-t.inicio;
 update ps_tarefas set inicio=p_inicio,fim=p_inicio+dur where id=p_tarefa;
 while mexidas>0 and pass<200 loop
  mexidas=0;pass=pass+1;
  for r in select s.id,s.inicio,s.fim,max(p.fim+1+d.folga_dias) minimo from ps_tarefa_dependencias d join ps_tarefas s on s.id=d.tarefa_id join ps_tarefas p on p.id=d.predecessora_id where s.projeto_id=t.projeto_id group by s.id,s.inicio,s.fim loop
   if r.inicio<r.minimo then update ps_tarefas set inicio=r.minimo,fim=r.minimo+(r.fim-r.inicio) where id=r.id;mexidas=mexidas+1;end if;
  end loop;
 end loop;
 update ps_projetos p set fim_previsto=greatest(p.fim_previsto,(select max(fim) from ps_tarefas where projeto_id=t.projeto_id)) where p.id=t.projeto_id;
 return pass;
end$$;

create or replace function ps_caminho_critico(p_proj uuid) returns table(ordem int,wbs text,nome text,inicio date,fim date,dias int) language sql stable as $$
 with recursive cam(id,caminho,total) as (
  select t.id,array[t.id],(t.fim-t.inicio+1) from ps_tarefas t where t.projeto_id=p_proj and not exists(select 1 from ps_tarefa_dependencias d where d.tarefa_id=t.id)
  union all
  select t.id,c.caminho||t.id,c.total+(t.fim-t.inicio+1)+d.folga_dias from cam c join ps_tarefa_dependencias d on d.predecessora_id=c.id join ps_tarefas t on t.id=d.tarefa_id where t.projeto_id=p_proj and not t.id=any(c.caminho)),
 melhor as (select caminho from cam order by total desc,array_length(caminho,1) desc limit 1)
 select u.ord::int,t.wbs::text,t.nome::text,t.inicio,t.fim,(t.fim-t.inicio+1)::int from melhor m cross join lateral unnest(m.caminho) with ordinality u(id,ord) join ps_tarefas t on t.id=u.id order by u.ord$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-11-12_35_pessoas_ehs_projetos.sql','13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-11-12_35_pessoas_ehs_projetos.sql','13a3c41c03e796d0230aeb148b847b82a3d155552a6cc20e7f47c27e8517d8b6','APLICAR',current_user,'APLICADA');
$ZZ9$;
 insert into _erros_migracao(migracao,erro) values('2026-11-12_35_pessoas_ehs_projetos','OK');
exception when others then
 insert into _erros_migracao(migracao,erro) values('2026-11-12_35_pessoas_ehs_projetos','ERRO: '||sqlstate||' - '||sqlerrm);
end $ZZ8$;

select migracao, erro from _erros_migracao where em>now()-interval '30 minutes' order by id;
