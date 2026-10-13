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
