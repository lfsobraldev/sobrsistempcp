create extension if not exists pgcrypto;

-- Usuários internos / perfis de acesso
create table if not exists pcp_usuarios(
  id uuid primary key default gen_random_uuid(),
  usuario varchar(80) not null unique,
  nome varchar(150) not null,
  senha_hash text not null,
  perfil varchar(30) not null,
  ativo boolean not null default true,
  criado_por varchar(100) not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint ck_pcp_usuarios_perfil check (
    perfil in ('PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR','QUALIDADE')
  )
);
create index if not exists ix_pcp_usuarios_ativo on pcp_usuarios(ativo,perfil);

create table if not exists pcp_programacoes(
 id uuid primary key default gen_random_uuid(), pedido varchar(40) not null default 'MULTIPLOS', cliente text not null default '', destino text not null default '', filtro varchar(40) not null default '', data_programacao date not null, turno varchar(20) not null default 'A', status varchar(20) not null default 'ATIVA', origem varchar(30) not null default 'FILTRO', criado_em timestamptz not null default now(), encerrado_em timestamptz, import_linhas int not null default 0, import_pedidos int not null default 0, import_ofs int not null default 0, import_pecas numeric(16,3) not null default 0, import_operacoes int not null default 0, import_sem_rota int not null default 0, import_inconsistencias int not null default 0, import_processos jsonb not null default '{}'::jsonb);
alter table pcp_programacoes add column if not exists pedido varchar(40) not null default 'MULTIPLOS';
alter table pcp_programacoes add column if not exists cliente text not null default '';
alter table pcp_programacoes add column if not exists destino text not null default '';
alter table pcp_programacoes add column if not exists filtro varchar(40) not null default '';
alter table pcp_programacoes add column if not exists origem varchar(30) not null default 'FILTRO';
alter table pcp_programacoes add column if not exists encerrado_em timestamptz;
alter table pcp_programacoes add column if not exists import_linhas int not null default 0;
alter table pcp_programacoes add column if not exists import_pedidos int not null default 0;
alter table pcp_programacoes add column if not exists import_ofs int not null default 0;
alter table pcp_programacoes add column if not exists import_pecas numeric(16,3) not null default 0;
alter table pcp_programacoes add column if not exists import_operacoes int not null default 0;
alter table pcp_programacoes add column if not exists import_sem_rota int not null default 0;
alter table pcp_programacoes add column if not exists import_inconsistencias int not null default 0;
alter table pcp_programacoes add column if not exists import_processos jsonb not null default '{}'::jsonb;

create table if not exists pcp_produtos(
 id uuid primary key default gen_random_uuid(), programacao_id uuid not null references pcp_programacoes(id) on delete cascade, filtro varchar(40) not null default '', pedido varchar(40) not null, item varchar(40) not null default '', produto varchar(80) not null default '', descricao text not null, tipo varchar(120) not null default '', canal varchar(120) not null default '', rebaixo varchar(120) not null default '', acabamento varchar(120) not null default '', cor varchar(160) not null default '', quantidade numeric(16,3) not null default 0, pedido_cliente varchar(120) not null default '', status_engenharia varchar(160) not null default '', of varchar(80) not null default '', percentual_produto numeric(8,2) not null default 0, codigo_modelo varchar(80) not null default '', descricao_modelo text not null default '', outras_caracteristicas text not null default '', categoria varchar(120) not null default '', material varchar(120) not null default '', medida varchar(80) not null default '', prioridade varchar(20) not null default 'NORMAL');
alter table pcp_produtos add column if not exists tipo_pedido varchar(20) not null default 'NORMAL';
alter table pcp_produtos add column if not exists montagem_engenharia varchar(30) not null default 'MONTADO_HS';

create table if not exists pcp_operacoes(
 id uuid primary key default gen_random_uuid(), produto_id uuid not null references pcp_produtos(id) on delete cascade, processo varchar(80) not null, sequencia int not null, percentual numeric(8,2) not null default 0, status varchar(30) not null default 'PENDENTE', ordem_fila int not null default 0, fixada boolean not null default false, quantidade_planejada numeric(16,3) not null default 0, quantidade_produzida numeric(16,3) not null default 0, quantidade_refugo numeric(16,3) not null default 0, iniciado_em timestamptz, finalizado_em timestamptz, atualizado_em timestamptz not null default now());
alter table pcp_operacoes add column if not exists fixada boolean not null default false;
create table if not exists pcp_andon(
 id uuid primary key default gen_random_uuid(), operacao_id uuid references pcp_operacoes(id) on delete cascade, processo varchar(80) not null, motivo varchar(120) not null, observacao text not null default '', status varchar(20) not null default 'ABERTO', usuario_abertura varchar(120) not null default '', criado_em timestamptz not null default now(), resolvido_em timestamptz);
create table if not exists pcp_eventos(
 id bigserial primary key, operacao_id uuid references pcp_operacoes(id) on delete cascade, usuario varchar(120) not null default '', tipo varchar(80) not null, descricao text not null default '', of varchar(80) not null default '', processo varchar(80) not null default '', antes jsonb, depois jsonb, criado_em timestamptz not null default now());
alter table pcp_eventos add column if not exists operacao_id uuid;
alter table pcp_eventos add column if not exists usuario varchar(120) not null default '';
alter table pcp_eventos add column if not exists descricao text not null default '';
alter table pcp_eventos add column if not exists of varchar(80) not null default '';
alter table pcp_eventos add column if not exists processo varchar(80) not null default '';
alter table pcp_eventos add column if not exists antes jsonb;
alter table pcp_eventos add column if not exists depois jsonb;
create index if not exists ix_pcp_prog_status on pcp_programacoes(status);
create index if not exists ix_pcp_prod_prog on pcp_produtos(programacao_id);
create index if not exists ix_pcp_prod_pedido on pcp_produtos(pedido);
create index if not exists ix_pcp_op_prod on pcp_operacoes(produto_id);
create index if not exists ix_pcp_op_proc on pcp_operacoes(processo,status);
create index if not exists ix_pcp_andon_status on pcp_andon(status);
create index if not exists ix_pcp_eventos_criado on pcp_eventos(criado_em desc);

-- V8.2 • Inspeção, Qualidade e MSAC de pallets
create table if not exists pcp_pallets(
  id uuid primary key default gen_random_uuid(),
  codigo varchar(60) not null unique,
  pedido varchar(60) not null,
  cliente varchar(240) not null default '',
  filtro varchar(60) not null default '',
  pallet varchar(60) not null,
  tipo_produto varchar(240) not null default '',
  quantidade numeric(16,3) not null default 0,
  jogos numeric(16,3) not null default 0,
  turno varchar(20) not null default 'A',
  destino varchar(240) not null default '',
  montador varchar(160) not null default '',
  conferente varchar(160) not null default '',
  observacao text not null default '',
  status varchar(40) not null default 'AGUARDANDO_INSPECAO',
  qualidade_status varchar(30) not null default 'PENDENTE',
  qualidade_usuario varchar(160) not null default '',
  qualidade_em timestamptz,
  qualidade_observacao text not null default '',
  msac_status varchar(30) not null default 'PENDENTE',
  msac_usuario varchar(160) not null default '',
  msac_em timestamptz,
  msac_observacao text not null default '',
  bloqueio_motivo text not null default '',
  bloqueado_por varchar(160) not null default '',
  bloqueado_em timestamptz,
  criado_por varchar(160) not null default '',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create table if not exists pcp_pallet_inspecoes(
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references pcp_pallets(id) on delete cascade,
  area varchar(30) not null,
  resultado varchar(30) not null default 'CONFORME',
  checklist jsonb not null default '{}'::jsonb,
  observacao text not null default '',
  usuario varchar(160) not null default '',
  criado_em timestamptz not null default now()
);
create table if not exists pcp_pallet_fotos(
  id uuid primary key default gen_random_uuid(),
  pallet_id uuid not null references pcp_pallets(id) on delete cascade,
  data_url text not null,
  legenda varchar(300) not null default '',
  area varchar(30) not null default 'QUALIDADE',
  usuario varchar(160) not null default '',
  criado_em timestamptz not null default now()
);
create table if not exists pcp_pallet_eventos(
  id bigserial primary key,
  pallet_id uuid not null references pcp_pallets(id) on delete cascade,
  usuario varchar(160) not null default '',
  tipo varchar(80) not null,
  descricao text not null default '',
  antes jsonb,
  depois jsonb,
  criado_em timestamptz not null default now()
);
create index if not exists ix_pcp_pallets_status on pcp_pallets(status,atualizado_em desc);
create index if not exists ix_pcp_pallets_pedido on pcp_pallets(pedido);
create index if not exists ix_pcp_pallet_inspecoes on pcp_pallet_inspecoes(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_fotos on pcp_pallet_fotos(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_eventos on pcp_pallet_eventos(pallet_id,criado_em desc);


-- V9 • Excelência Operacional / Central de Produção
alter table pcp_andon add column if not exists prioridade varchar(20) not null default 'MEDIA';
alter table pcp_andon add column if not exists responsavel varchar(120) not null default '';
alter table pcp_andon add column if not exists assumido_por varchar(120) not null default '';
alter table pcp_andon add column if not exists assumido_em timestamptz;
alter table pcp_andon add column if not exists tratamento_em timestamptz;
alter table pcp_andon add column if not exists resolvido_por varchar(120) not null default '';
alter table pcp_andon add column if not exists observacao_final text not null default '';

create table if not exists pcp_perdas_producao(
 id uuid primary key default gen_random_uuid(), operacao_id uuid references pcp_operacoes(id) on delete set null,
 processo varchar(80) not null, maquina varchar(120) not null default '', turno varchar(20) not null default '', pedido varchar(80) not null default '', of varchar(80) not null default '',
 motivo varchar(120) not null, inicio timestamptz not null, fim timestamptz, minutos numeric(12,2) not null default 0,
 quantidade_perdida numeric(16,3), responsavel varchar(120) not null default '', observacao text not null default '', usuario varchar(120) not null default '', criado_em timestamptz not null default now());
create table if not exists pcp_capacidades_maquina(
 id uuid primary key default gen_random_uuid(), processo varchar(80) not null, maquina varchar(120) not null default 'PADRAO', turno varchar(20) not null default 'A',
 pecas_hora numeric(16,3), minutos_disponiveis numeric(12,2), eficiencia numeric(8,2) not null default 100, setup_medio numeric(12,2), compatibilidades jsonb not null default '[]'::jsonb,
 atualizado_por varchar(120) not null default '', atualizado_em timestamptz not null default now(), unique(processo,maquina,turno));
create table if not exists pcp_metas_maquina(
 id uuid primary key default gen_random_uuid(), data date not null default current_date, processo varchar(80) not null, maquina varchar(120) not null default 'PADRAO', turno varchar(20) not null default 'A',
 meta numeric(16,3) not null, atualizado_por varchar(120) not null default '', atualizado_em timestamptz not null default now(), unique(data,processo,maquina,turno));
create table if not exists pcp_setups(
 id uuid primary key default gen_random_uuid(), processo varchar(80) not null, maquina varchar(120) not null default '', pedido varchar(80) not null default '', of varchar(80) not null default '',
 setup_anterior text not null default '', proximo_setup text not null default '', inicio timestamptz not null, fim timestamptz, duracao_min numeric(12,2), motivo varchar(120) not null default '', usuario varchar(120) not null default '', criado_em timestamptz not null default now());
create table if not exists pcp_acoes_operacionais(
 id uuid primary key default gen_random_uuid(), tipo varchar(60) not null, prioridade varchar(20) not null default 'MEDIA', processo varchar(80) not null default '', maquina varchar(120) not null default '',
 pedido varchar(80) not null default '', of varchar(80) not null default '', descricao text not null, impacto text not null default '', status varchar(30) not null default 'ABERTA', responsavel varchar(120) not null default '',
 criado_por varchar(120) not null default '', criado_em timestamptz not null default now(), resolvido_em timestamptz);
create index if not exists ix_pcp_perdas_inicio on pcp_perdas_producao(inicio desc);
create index if not exists ix_pcp_perdas_proc on pcp_perdas_producao(processo,motivo);
create index if not exists ix_pcp_cap_proc on pcp_capacidades_maquina(processo,turno);
create index if not exists ix_pcp_metas_data on pcp_metas_maquina(data,processo,turno);
create index if not exists ix_pcp_acoes_status on pcp_acoes_operacionais(status,prioridade,criado_em desc);
create extension if not exists pgcrypto;
create table if not exists pcp_pallet_nao_conformidades(
 id uuid primary key default gen_random_uuid(), pallet_id uuid not null references pcp_pallets(id) on delete cascade, codigo varchar(60) not null unique,
 categoria varchar(80) not null default 'OUTROS', tipo_defeito varchar(180) not null, gravidade varchar(20) not null default 'MAIOR', quantidade_afetada numeric(16,3) not null default 0,
 local_defeito varchar(300) not null default '', descricao text not null default '', contencao text not null default '', acao_corretiva text not null default '', responsavel varchar(160) not null default '', prazo timestamptz,
 status varchar(40) not null default 'ABERTA', correcao_executada text not null default '', corrigido_por varchar(160) not null default '', corrigido_em timestamptz,
 reinspecao_resultado varchar(30) not null default '', reinspecao_usuario varchar(160) not null default '', reinspecao_em timestamptz, reinspecao_observacao text not null default '',
 criado_por varchar(160) not null default '', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
create table if not exists pcp_pallet_medicoes(
 id uuid primary key default gen_random_uuid(), pallet_id uuid not null references pcp_pallets(id) on delete cascade, caracteristica varchar(180) not null, nominal numeric(16,3), tolerancia_min numeric(16,3), tolerancia_max numeric(16,3), medido numeric(16,3) not null, unidade varchar(30) not null default 'mm', resultado varchar(30) not null default 'REGISTRADO', observacao text not null default '', usuario varchar(160) not null default '', criado_em timestamptz not null default now());
alter table pcp_pallet_fotos add column if not exists nc_id uuid;
alter table pcp_pallet_fotos add column if not exists tipo varchar(20) not null default 'GERAL';
do $$ begin if not exists(select 1 from pg_constraint where conname='fk_pcp_pallet_fotos_nc') then alter table pcp_pallet_fotos add constraint fk_pcp_pallet_fotos_nc foreign key(nc_id) references pcp_pallet_nao_conformidades(id) on delete set null; end if; end $$;
create index if not exists ix_pcp_pallet_nc_pallet on pcp_pallet_nao_conformidades(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_nc_status on pcp_pallet_nao_conformidades(status,prazo);
create index if not exists ix_pcp_pallet_medicoes_pallet on pcp_pallet_medicoes(pallet_id,criado_em desc);
create index if not exists ix_pcp_pallet_fotos_nc on pcp_pallet_fotos(nc_id,tipo,criado_em desc);
