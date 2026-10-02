create extension if not exists pgcrypto;
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
