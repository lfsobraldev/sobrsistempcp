-- depends-on: 2026-10-21_04_unidades_globais.sql
-- scope: operational
-- Pré-requisito: schema de estoque existente (est_produtos, est_saldos).
-- migrate:up
-- Bootstrap idempotente do estoque existente, gerado de lib/estoque-schema.ts.
create table if not exists est_unidades(codigo varchar(10) primary key, descricao varchar(60) not null, fracionavel boolean not null default false);
insert into est_unidades(codigo,descricao,fracionavel) values ('UN','Unidade',false),('PC','Peça',false),('PAR','Par',false),('JG','Jogo',false),('CX','Caixa',false),('PCT','Pacote',false),('KG','Quilograma',true),('M','Metro',true),('M2','Metro quadrado',true),('M3','Metro cúbico',true),('L','Litro',true) on conflict (codigo) do nothing;
create table if not exists est_produtos(id uuid primary key default gen_random_uuid(), codigo varchar(60) not null unique, descricao varchar(240) not null default '', unidade_base varchar(10) not null references est_unidades(codigo), estoque_minimo numeric(16,3) not null default 0 check(estoque_minimo>=0), ativo boolean not null default true, origem varchar(20) not null default 'MANUAL', criado_por varchar(120) not null default '', criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now());
alter table est_produtos add column if not exists classificacao text not null default 'NAO_CLASSIFICADO' check(classificacao in ('INSUMO','SEMIACABADO','ACABADO','NAO_CLASSIFICADO'));
create table if not exists est_produto_unidades(produto_id uuid not null references est_produtos(id) on delete cascade, unidade varchar(10) not null references est_unidades(codigo), fator numeric(16,6) not null check(fator>0), codigo_barras varchar(64), primary key(produto_id,unidade));
create unique index if not exists ux_est_codigo_barras on est_produto_unidades(codigo_barras) where codigo_barras is not null;
create table if not exists est_locais(id uuid primary key default gen_random_uuid(), codigo varchar(40) not null unique, descricao varchar(160) not null default '', ativo boolean not null default true, criado_em timestamptz not null default now());
create table if not exists est_saldos(produto_id uuid not null references est_produtos(id), local_id uuid not null references est_locais(id), fisico numeric(16,3) not null default 0, reservado numeric(16,3) not null default 0, bloqueado numeric(16,3) not null default 0, atualizado_em timestamptz not null default now(), primary key(produto_id,local_id), check(fisico>=0), check(reservado>=0), check(bloqueado>=0), check(reservado+bloqueado<=fisico));
create table if not exists est_movimentos(id bigserial primary key, tipo varchar(20) not null, produto_id uuid not null references est_produtos(id), local_origem_id uuid references est_locais(id), local_destino_id uuid references est_locais(id), quantidade_base numeric(16,3) not null check(quantidade_base>0), quantidade_informada numeric(16,3) not null, unidade_informada varchar(10) not null, fator numeric(16,6) not null default 1, sinal smallint not null default 1, baixa_reserva boolean not null default false, documento varchar(80) not null default '', pedido varchar(80) not null default '', of varchar(80) not null default '', motivo varchar(200) not null default '', observacao varchar(500) not null default '', request_id varchar(80), usuario varchar(120) not null, criado_em timestamptz not null default now());
create unique index if not exists ux_est_mov_request on est_movimentos(request_id) where request_id is not null;
create index if not exists ix_est_mov_produto on est_movimentos(produto_id, criado_em desc);
create index if not exists ix_est_mov_pedido on est_movimentos(pedido) where pedido<>'';
create or replace function est_mov_imutavel() returns trigger as $$ begin raise exception 'est_movimentos é um histórico auditável: não pode ser alterado nem apagado'; end; $$ language plpgsql;
drop trigger if exists tr_est_mov_imutavel on est_movimentos;
create trigger tr_est_mov_imutavel before update or delete on est_movimentos for each row execute function est_mov_imutavel();
create table if not exists est_inventarios(id uuid primary key default gen_random_uuid(), numero bigserial, tipo varchar(10) not null check(tipo in('GERAL','LOCAL')), local_id uuid references est_locais(id), status varchar(20) not null default 'EM_CONTAGEM' check(status in('EM_CONTAGEM','FECHADO','CANCELADO')), observacao varchar(300) not null default '', criado_por varchar(120) not null, criado_em timestamptz not null default now(), fechado_por varchar(120) not null default '', fechado_em timestamptz);
create table if not exists est_inventario_itens(id uuid primary key default gen_random_uuid(), inventario_id uuid not null references est_inventarios(id) on delete cascade, produto_id uuid not null references est_produtos(id), local_id uuid not null references est_locais(id), saldo_sistema numeric(16,3) not null, contado numeric(16,3) check(contado is null or contado>=0), contado_por varchar(120) not null default '', contado_em timestamptz, conferido boolean not null default false, conferido_por varchar(120) not null default '', conferido_em timestamptz, ajustado boolean not null default false, unique(inventario_id,produto_id,local_id));
create index if not exists ix_est_inv_item_inv on est_inventario_itens(inventario_id);
create index if not exists ix_est_inv_item_pl on est_inventario_itens(produto_id,local_id);
-- Engenharia e OF
alter table est_produtos add column if not exists classificacao text not null default 'NAO_CLASSIFICADO';
do $$begin
 if not exists(select 1 from pg_constraint where conrelid='est_produtos'::regclass and conname='est_produtos_classificacao_ck') then
 alter table est_produtos add constraint est_produtos_classificacao_ck check(classificacao in ('INSUMO','SEMIACABADO','ACABADO','NAO_CLASSIFICADO'));end if;
end$$;
create table if not exists erp_estruturas(
 id uuid primary key default gen_random_uuid(),produto_id uuid not null references est_produtos(id),
 versao integer not null,status text not null default 'RASCUNHO' check(status in ('RASCUNHO','APROVADA')),
 request_id uuid not null unique,requisicao jsonb not null,criado_por text not null,criado_em timestamptz not null default now(),
 aprovado_por text,aprovado_em timestamptz,unique(produto_id,versao)
);
create table if not exists erp_estrutura_itens(
 estrutura_id uuid not null references erp_estruturas(id),componente_id uuid not null references est_produtos(id),
 quantidade numeric(16,6) not null check(quantidade>0),perda_percentual numeric(8,3) not null default 0 check(perda_percentual between 0 and 100),
 primary key(estrutura_id,componente_id)
);
create table if not exists erp_ordens_fabricacao(
 id uuid primary key default gen_random_uuid(),numero bigint generated always as identity unique,
 origem_produto_id uuid not null unique references pcp_produtos(id),produto_estoque_id uuid not null references est_produtos(id),
 estrutura_id uuid not null references erp_estruturas(id),quantidade numeric(16,3) not null check(quantidade>0),pedido text not null,
 status text not null default 'PLANEJADA' check(status in ('PLANEJADA','LIBERADA','CONCLUIDA','CANCELADA')),
 criado_por text not null,criado_em timestamptz not null default now(),atualizado_em timestamptz not null default now(),
 prazo date not null,liberado_em timestamptz,concluido_em timestamptz
);
create table if not exists erp_of_materiais(
 of_id uuid not null references erp_ordens_fabricacao(id),produto_id uuid not null references est_produtos(id),
 necessidade numeric(16,3) not null check(necessidade>0),primary key(of_id,produto_id)
);
create index if not exists erp_of_status_prazo on erp_ordens_fabricacao(status,prazo);
create or replace function erp_estrutura_imutavel() returns trigger language plpgsql as $$
declare st text;
begin
 if tg_table_name='erp_estruturas' then
  if old.status='APROVADA' then raise exception 'Estrutura aprovada é imutável; crie nova versão';end if;
 else
  select status into st from erp_estruturas where id=case when tg_op='DELETE' then old.estrutura_id else new.estrutura_id end;
  if st='APROVADA' then raise exception 'Componentes aprovados são imutáveis';end if;
  if tg_op='UPDATE' then select status into st from erp_estruturas where id=old.estrutura_id;if st='APROVADA' then raise exception 'Componentes aprovados são imutáveis';end if;end if;
 end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
drop trigger if exists estrutura_protegida on erp_estruturas;
create trigger estrutura_protegida before update or delete on erp_estruturas for each row execute function erp_estrutura_imutavel();
drop trigger if exists estrutura_itens_protegidos on erp_estrutura_itens;
create trigger estrutura_itens_protegidos before insert or update or delete on erp_estrutura_itens for each row execute function erp_estrutura_imutavel();
create or replace function erp_explodir_estrutura(p_estrutura uuid,p_quantidade numeric)
returns table(produto_id uuid,necessidade numeric,ciclo boolean) language sql stable as $$
 with recursive arvore(produto_id,q,caminho,ciclo,nivel) as(
  select i.componente_id,p_quantidade*i.quantidade*(1+i.perda_percentual/100),array[e.produto_id,i.componente_id],i.componente_id=e.produto_id,1
  from erp_estruturas e join erp_estrutura_itens i on i.estrutura_id=e.id where e.id=p_estrutura
  union all
  select i.componente_id,a.q*i.quantidade*(1+i.perda_percentual/100),a.caminho||i.componente_id,i.componente_id=any(a.caminho),a.nivel+1
  from arvore a join lateral(select s.id from erp_estruturas s where s.produto_id=a.produto_id and s.status='APROVADA' order by s.versao desc limit 1) sub on true
  join erp_estrutura_itens i on i.estrutura_id=sub.id where not a.ciclo and a.nivel<25
 )
 select a.produto_id,sum(a.q),bool_or(a.ciclo or a.nivel>=25)
 from arvore a where a.ciclo or a.nivel>=25 or not exists(select 1 from erp_estruturas e where e.produto_id=a.produto_id and e.status='APROVADA')
 group by a.produto_id;
$$;
create or replace function erp_criar_estrutura(p_produto uuid,p_itens jsonb,p_request uuid,p_ator text)
returns uuid language plpgsql as $$
declare v_id uuid;v_payload jsonb;v_ant jsonb;v_versao integer;
begin
 perform pg_advisory_xact_lock(hashtextextended('estrutura:'||p_produto::text,0));
 v_payload=jsonb_build_object('produto_id',p_produto,'itens',p_itens);
 select id,requisicao into v_id,v_ant from erp_estruturas where request_id=p_request;
 if v_id is not null then if v_ant<>v_payload then raise exception 'Chave de requisição já utilizada para outros dados';end if;return v_id;end if;
 if not exists(select 1 from est_produtos where id=p_produto and ativo and classificacao in ('ACABADO','SEMIACABADO')) then raise exception 'Classifique o produto final como acabado ou semiacabado';end if;
 if jsonb_array_length(p_itens)=0 then raise exception 'Informe componentes';end if;
 if exists(select 1 from jsonb_to_recordset(p_itens) as x(componente_id uuid) left join est_produtos p on p.id=x.componente_id where p.id is null or not p.ativo or p.classificacao='NAO_CLASSIFICADO' or p.id=p_produto) then raise exception 'Componente inválido, não classificado ou igual ao produto final';end if;
 select coalesce(max(versao),0)+1 into v_versao from erp_estruturas where produto_id=p_produto;
 insert into erp_estruturas(produto_id,versao,request_id,requisicao,criado_por) values(p_produto,v_versao,p_request,v_payload,p_ator) returning id into v_id;
 insert into erp_estrutura_itens select v_id,x.componente_id,x.quantidade,x.perda_percentual from jsonb_to_recordset(p_itens) as x(componente_id uuid,quantidade numeric,perda_percentual numeric);
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) values(p_ator,'CRIAR_ESTRUTURA','ESTRUTURA',v_id::text,v_payload);
 return v_id;
end$$;
create or replace function erp_aprovar_estrutura(p_id uuid,p_ator text) returns uuid language plpgsql as $$
declare st text;
begin
 perform pg_advisory_xact_lock(hashtextextended('erp:aprovar-estrutura',0));
 select status into strict st from erp_estruturas where id=p_id for update;
 if st='APROVADA' then return p_id;end if;
 if not exists(select 1 from erp_estrutura_itens where estrutura_id=p_id) or exists(select 1 from erp_explodir_estrutura(p_id,1) where ciclo) then raise exception 'Estrutura vazia, cíclica ou profunda demais';end if;
 update erp_estruturas set status='APROVADA',aprovado_por=p_ator,aprovado_em=now() where id=p_id;
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) values(p_ator,'APROVAR_ESTRUTURA','ESTRUTURA',p_id::text,jsonb_build_object('status','APROVADA'));return p_id;
end$$;
create or replace function erp_criar_of(p_origem uuid,p_estrutura uuid,p_prazo date,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;p pcp_produtos%rowtype;e erp_estruturas%rowtype;cod text;
begin
 select * into strict p from pcp_produtos where id=p_origem for update;
 select id into v_id from erp_ordens_fabricacao where origem_produto_id=p_origem;
 if v_id is not null then
  if not exists(select 1 from erp_ordens_fabricacao where id=v_id and estrutura_id=p_estrutura and prazo=p_prazo) then raise exception 'Este item já possui OF com outros parâmetros';end if;return v_id;
 end if;
 if not exists(select 1 from pcp_programacoes where id=p.programacao_id and status in ('ATIVA','ENCERRADA')) then raise exception 'Programação ainda não foi liberada';end if;
 select * into strict e from erp_estruturas where id=p_estrutura and status='APROVADA';
 select codigo into strict cod from est_produtos where id=e.produto_id and ativo;
 if upper(regexp_replace(trim(p.produto),'\s+','','g'))<>cod then raise exception 'O código de estoque não corresponde ao item programado';end if;
 if p.quantidade<=0 or p_prazo is null then raise exception 'Quantidade ou prazo inválido';end if;
 perform id from pcp_operacoes where produto_id=p_origem order by id for update;
 if not found then raise exception 'Item sem operações de produção';end if;
 if exists(select 1 from pcp_operacoes where produto_id=p_origem and (status not in ('PENDENTE','LIBERADA') or quantidade_produzida>0 or quantidade_refugo>0)) then raise exception 'Item já possui execução; não pode receber nova OF de planejamento';end if;
 insert into erp_ordens_fabricacao(origem_produto_id,produto_estoque_id,estrutura_id,quantidade,pedido,criado_por,prazo)
 values(p_origem,e.produto_id,e.id,p.quantidade,p.pedido,p_ator,p_prazo) returning id into v_id;
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) values(p_ator,'CRIAR_OF','ORDEM_FABRICACAO',v_id::text,jsonb_build_object('origem',p_origem,'estrutura',p_estrutura,'quantidade',p.quantidade));return v_id;
end$$;
create or replace function erp_transicionar_of(p_id uuid,p_acao text,p_ator text) returns uuid language plpgsql as $$
declare o erp_ordens_fabricacao%rowtype;destino text;medicao boolean;
begin
 select * into strict o from erp_ordens_fabricacao where id=p_id for update;
 if p_acao='LIBERAR' and o.status='LIBERADA' or p_acao='CONCLUIR' and o.status='CONCLUIDA' or p_acao='CANCELAR' and o.status='CANCELADA' or p_acao='REABRIR' and o.status='PLANEJADA' then return p_id;end if;
 if p_acao='LIBERAR' and o.status='PLANEJADA' then
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='medicao_obrigatoria') then
   execute 'select exists(select 1 from pcp_controle_entregas where ltrim(trim(pedido),''0'')=ltrim(trim($1),''0'') and medicao_obrigatoria)' into medicao using o.pedido;
   if medicao then
    if to_regclass('pcp_medicao_revisoes') is null then raise exception 'Medição obrigatória não instalada';end if;
    execute 'select coalesce((select status=''APROVADA_PARA_PRODUCAO'' from pcp_medicao_revisoes where ltrim(trim(pedido),''0'')=ltrim(trim($1),''0'') order by versao desc limit 1),false)' into medicao using o.pedido;
    if not medicao then raise exception 'Medição técnica ainda não aprovada';end if;
   end if;
  end if;
  if exists(select 1 from erp_explodir_estrutura(o.estrutura_id,o.quantidade) where ciclo) then raise exception 'Estrutura cíclica ou profunda demais';end if;
  delete from erp_of_materiais where of_id=p_id;
  insert into erp_of_materiais(of_id,produto_id,necessidade)
  select p_id,x.produto_id,case when u.fracionavel then ceil(x.necessidade*1000)/1000 else ceil(x.necessidade) end
  from erp_explodir_estrutura(o.estrutura_id,o.quantidade) x join est_produtos p on p.id=x.produto_id join est_unidades u on u.codigo=p.unidade_base;
  if not found then raise exception 'Estrutura sem necessidades calculáveis';end if;
  destino='LIBERADA';
 elsif p_acao='CONCLUIR' and o.status='LIBERADA' then
  if not exists(select 1 from pcp_operacoes where produto_id=o.origem_produto_id) or exists(select 1 from pcp_operacoes where produto_id=o.origem_produto_id and (status<>'CONCLUIDA' or quantidade_produzida<quantidade_planejada)) then raise exception 'Existem operações pendentes ou quantidades não produzidas';end if;
  destino='CONCLUIDA';
 elsif p_acao='CANCELAR' and o.status in ('PLANEJADA','LIBERADA') then
  if exists(select 1 from pcp_operacoes where produto_id=o.origem_produto_id and (quantidade_produzida>0 or quantidade_refugo>0 or status not in ('PENDENTE','LIBERADA'))) then raise exception 'OF com execução não pode ser cancelada';end if;destino='CANCELADA';
 elsif p_acao='REABRIR' and o.status='CANCELADA' then destino='PLANEJADA';
 else raise exception 'Transição de OF inválida';end if;
 update erp_ordens_fabricacao set status=destino,atualizado_em=clock_timestamp(),liberado_em=case when destino='LIBERADA' then now() else liberado_em end,concluido_em=case when destino='CONCLUIDA' then now() else concluido_em end where id=p_id;
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,antes,depois) values(p_ator,p_acao||'_OF','ORDEM_FABRICACAO',p_id::text,to_jsonb(o),jsonb_build_object('status',destino));return p_id;
end$$;

-- Apontamentos existentes continuam sendo a fonte de execução. A barreira só se aplica aos itens com OF formal.
create or replace function erp_validar_apontamento_of() returns trigger language plpgsql as $$
declare st text;
begin
 select status into st from erp_ordens_fabricacao where origem_produto_id=new.produto_id for update;
 if st is not null and st<>'LIBERADA' then raise exception 'Libere ou reabra a OF antes de alterar a operação';end if;
 return new;
end$$;
drop trigger if exists erp_operacao_of on pcp_operacoes;
create trigger erp_operacao_of before update on pcp_operacoes for each row execute function erp_validar_apontamento_of();
create or replace function erp_proteger_materiais_of() returns trigger language plpgsql as $$
declare st text;
begin
 select status into st from erp_ordens_fabricacao where id=case when tg_op='DELETE' then old.of_id else new.of_id end;
 if st is distinct from 'PLANEJADA' then raise exception 'Materiais de OF liberada são imutáveis';end if;
 if tg_op='UPDATE' then select status into st from erp_ordens_fabricacao where id=old.of_id;if st is distinct from 'PLANEJADA' then raise exception 'Materiais de OF liberada são imutáveis';end if;end if;
 if tg_op='DELETE' then return old;end if;return new;
end$$;
drop trigger if exists erp_of_materiais_imutaveis on erp_of_materiais;
create trigger erp_of_materiais_imutaveis before insert or update or delete on erp_of_materiais for each row execute function erp_proteger_materiais_of();
-- migrate:down
-- Preserva OFs, estruturas e histórico. Descontinuação é lógica, sem apagar produção.
select 'Registros industriais preservados' as resultado;
