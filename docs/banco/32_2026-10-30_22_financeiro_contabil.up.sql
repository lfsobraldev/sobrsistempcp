-- GERADO do arquivo canônico 2026-10-30_22_financeiro_contabil.sql; SHA256 964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896
-- Destino: operacional (Sul/Nordeste). Dependências: 2026-10-29_21_fiscal.sql.
-- Administrador: executar 00_registro.sql antes; conferir baseline e destino.
BEGIN;
select pg_advisory_xact_lock(hashtextextended('sobral:migracoes',0));
do $pacote$ begin
 if exists(select 1 from schema_migrations where name='2026-10-30_22_financeiro_contabil.sql' and status in('APLICADA','BASELINE')) then raise exception 'Arquivo já registrado; conferir checksum e não reaplicar';end if;
 if exists(select 1 from schema_migrations where name='2026-10-30_22_financeiro_contabil.sql' and checksum<>'964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896') then raise exception 'Checksum divergente; interromper e investigar';end if;
end $pacote$;
create extension if not exists pgcrypto;

create table if not exists fin_contas_bancarias(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null, banco varchar(60) not null default '', agencia varchar(20) not null default '', conta varchar(30) not null default '',
 pix_chave varchar(140) not null default '', pix_cidade varchar(15) not null default '', pix_nome varchar(25) not null default '',
 saldo_inicial numeric(16,2) not null default 0, saldo_inicial_data date not null default current_date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create table if not exists fin_centros_custo(
 id uuid primary key default gen_random_uuid(), codigo varchar(30) not null unique, nome varchar(120) not null, ativo boolean not null default true
);
create table if not exists ctb_contas(
 id uuid primary key default gen_random_uuid(),
 codigo varchar(30) not null unique, nome varchar(160) not null,
 tipo varchar(10) not null check(tipo in('ATIVO','PASSIVO','PL','RECEITA','CUSTO','DESPESA')),
 analitica boolean not null default true, ativo boolean not null default true
);
create table if not exists ctb_regras_lancamento(
 evento varchar(40) primary key,
 conta_debito_id uuid not null references ctb_contas(id), conta_credito_id uuid not null references ctb_contas(id),
 ativo boolean not null default true, check(conta_debito_id<>conta_credito_id)
);
create table if not exists ctb_lancamentos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 data date not null, competencia char(7) not null, historico varchar(300) not null,
 evento varchar(40), origem_id uuid, estorno_de uuid references ctb_lancamentos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_ctb_evento_origem on ctb_lancamentos(evento,origem_id) where evento is not null and origem_id is not null;
create unique index if not exists ux_ctb_estorno on ctb_lancamentos(estorno_de) where estorno_de is not null;
create table if not exists ctb_partidas(
 id bigserial primary key,
 lancamento_id uuid not null references ctb_lancamentos(id),
 conta_id uuid not null references ctb_contas(id),
 debito numeric(16,2) not null default 0 check(debito>=0), credito numeric(16,2) not null default 0 check(credito>=0),
 centro_custo_id uuid references fin_centros_custo(id),
 check((debito>0) <> (credito>0))
);
create index if not exists ix_ctb_partidas_conta on ctb_partidas(conta_id,lancamento_id);
create table if not exists ctb_pendencias(
 id bigserial primary key, evento varchar(40) not null, origem_id uuid not null, data date not null, valor numeric(16,2) not null,
 historico varchar(300) not null, centro_custo_id uuid, criado_em timestamptz not null default now(), unique(evento,origem_id)
);
create or replace function ctb_imutavel() returns trigger language plpgsql as $$
begin raise exception 'Lançamento contábil é imutável; use estorno';end$$;
drop trigger if exists ctb_lanc_imutavel_t on ctb_lancamentos;
create trigger ctb_lanc_imutavel_t before update or delete on ctb_lancamentos for each row execute function ctb_imutavel();
drop trigger if exists ctb_part_imutavel_t on ctb_partidas;
create trigger ctb_part_imutavel_t before update or delete on ctb_partidas for each row execute function ctb_imutavel();

create table if not exists fin_titulos(
 id uuid primary key default gen_random_uuid(),
 numero bigint generated always as identity unique,
 tipo varchar(7) not null check(tipo in('RECEBER','PAGAR')),
 origem varchar(20) not null check(origem in('PEDIDO_VENDA','COMISSAO','COMPRA','MANUAL')),
 origem_id uuid, ref varchar(80) not null default '', parcela integer not null default 1 check(parcela>0),
 parceiro varchar(240) not null default '', parceiro_id uuid, descricao varchar(300) not null default '',
 vencimento date not null, valor numeric(16,2) not null check(valor>0), valor_baixado numeric(16,2) not null default 0 check(valor_baixado>=0),
 status varchar(10) not null default 'ABERTO' check(status in('ABERTO','PARCIAL','LIQUIDADO','CANCELADO')),
 centro_custo_id uuid references fin_centros_custo(id), competencia char(7) not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(),
 check(valor_baixado<=valor)
);
create unique index if not exists ux_fin_titulo_origem on fin_titulos(origem,origem_id,ref,parcela) where origem_id is not null;
create index if not exists ix_fin_titulos_venc on fin_titulos(tipo,status,vencimento);
create table if not exists fin_extratos(
 id uuid primary key default gen_random_uuid(),
 conta_id uuid not null references fin_contas_bancarias(id), data date not null, descricao varchar(300) not null default '',
 valor numeric(16,2) not null check(valor<>0), fitid varchar(120) not null, baixa_id uuid,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), unique(conta_id,fitid)
);
create table if not exists fin_baixas(
 id uuid primary key default gen_random_uuid(),
 titulo_id uuid not null references fin_titulos(id), conta_id uuid not null references fin_contas_bancarias(id),
 data date not null, valor numeric(16,2) not null check(valor>0), estorno_de uuid references fin_baixas(id),
 extrato_id uuid references fin_extratos(id),
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);
create unique index if not exists ux_fin_baixa_estorno on fin_baixas(estorno_de) where estorno_de is not null;
create table if not exists fin_orcamento(
 centro_custo_id uuid not null references fin_centros_custo(id), conta_id uuid not null references ctb_contas(id), competencia char(7) not null check(competencia ~ '^[0-9]{4}-[0-9]{2}$'),
 valor_orcado numeric(16,2) not null check(valor_orcado>=0), primary key(centro_custo_id,conta_id,competencia)
);

-- ---------------------------------------------------------------- Contabilidade
create or replace function ctb_lancar(p_data date,p_hist text,p_evento text,p_origem uuid,p_partidas jsonb,p_ator text,p_estorno uuid default null) returns uuid language plpgsql as $$
declare v_id uuid;pa jsonb;d numeric:=0;c numeric:=0;n int:=0;
begin
 if p_evento is not null and p_origem is not null then select id into v_id from ctb_lancamentos where evento=p_evento and origem_id=p_origem;if found then return v_id;end if;end if;
 for pa in select value from jsonb_array_elements(p_partidas) loop
  n=n+1;d=d+coalesce((pa->>'debito')::numeric,0);c=c+coalesce((pa->>'credito')::numeric,0);
  if not exists(select 1 from ctb_contas where id=(pa->>'conta_id')::uuid and analitica and ativo) then raise exception 'Conta contábil inválida, inativa ou sintética';end if;
 end loop;
 if n<2 then raise exception 'Lançamento exige ao menos duas partidas';end if;
 if round(d,2)<>round(c,2) or d<=0 then raise exception 'Lançamento desbalanceado: débitos % x créditos %',d,c;end if;
 insert into ctb_lancamentos(data,competencia,historico,evento,origem_id,estorno_de,criado_por) values(p_data,to_char(p_data,'YYYY-MM'),left(p_hist,300),p_evento,p_origem,p_estorno,p_ator) returning id into v_id;
 insert into ctb_partidas(lancamento_id,conta_id,debito,credito,centro_custo_id)
 select v_id,(x.value->>'conta_id')::uuid,coalesce((x.value->>'debito')::numeric,0),coalesce((x.value->>'credito')::numeric,0),nullif(x.value->>'centro_custo_id','')::uuid from jsonb_array_elements(p_partidas) x;
 return v_id;
end$$;

-- Lançamento automático por regra; sem regra, registra pendência (não bloqueia a operação) para reprocessar.
create or replace function ctb_postar_evento(p_evento text,p_origem uuid,p_data date,p_valor numeric,p_hist text,p_centro uuid,p_ator text) returns uuid language plpgsql as $$
declare r ctb_regras_lancamento%rowtype;
begin
 if p_valor is null or p_valor<=0 then return null;end if;
 select * into r from ctb_regras_lancamento where evento=p_evento and ativo;
 if not found then
  insert into ctb_pendencias(evento,origem_id,data,valor,historico,centro_custo_id) values(p_evento,p_origem,p_data,p_valor,left(p_hist,300),p_centro) on conflict do nothing;return null;
 end if;
 return ctb_lancar(p_data,p_hist,p_evento,p_origem,jsonb_build_array(jsonb_build_object('conta_id',r.conta_debito_id,'debito',p_valor,'centro_custo_id',p_centro),jsonb_build_object('conta_id',r.conta_credito_id,'credito',p_valor,'centro_custo_id',p_centro)),p_ator);
end$$;

create or replace function ctb_reprocessar(p_ator text) returns integer language plpgsql as $$
declare p record;n int:=0;v uuid;
begin
 for p in select * from ctb_pendencias order by id loop
  if exists(select 1 from ctb_regras_lancamento where evento=p.evento and ativo) then
   v=ctb_postar_evento(p.evento,p.origem_id,p.data,p.valor,p.historico,p.centro_custo_id,p_ator);
   if v is not null then delete from ctb_pendencias where id=p.id;n=n+1;end if;
  end if;
 end loop;
 return n;
end$$;

create or replace function ctb_estornar(p_lanc uuid,p_data date,p_ator text) returns uuid language plpgsql as $$
declare l ctb_lancamentos%rowtype;
begin
 select * into strict l from ctb_lancamentos where id=p_lanc;
 if l.estorno_de is not null then raise exception 'Estorno não pode ser estornado';end if;
 if exists(select 1 from ctb_lancamentos where estorno_de=p_lanc) then raise exception 'Lançamento já estornado';end if;
 return ctb_lancar(p_data,'ESTORNO: '||l.historico,null,null,(select jsonb_agg(jsonb_build_object('conta_id',conta_id,'debito',credito,'credito',debito,'centro_custo_id',centro_custo_id)) from ctb_partidas where lancamento_id=p_lanc),p_ator,p_lanc);
end$$;

-- Plano de contas padrão (industrial simplificado) e regras de lançamento automático; idempotente.
create or replace function ctb_semear_plano(p_ator text) returns integer language plpgsql as $$
declare n int:=0;c record;
begin
 for c in select * from (values
  ('1','ATIVO','ATIVO',false),('1.1.01','Caixa e bancos','ATIVO',true),('1.1.02','Clientes a receber','ATIVO',true),('1.1.03','Estoques','ATIVO',true),('1.1.04','Recebíveis diversos','ATIVO',true),
  ('2','PASSIVO','PASSIVO',false),('2.1.01','Fornecedores','PASSIVO',true),('2.1.02','Comissões a pagar','PASSIVO',true),('2.1.03','Contas a pagar diversas','PASSIVO',true),
  ('2.9.01','Capital e reservas','PL',true),
  ('3','RECEITAS','RECEITA',false),('3.1.01','Receita de vendas','RECEITA',true),('3.1.02','Devoluções e abatimentos de vendas','RECEITA',true),
  ('4.1.01','Custo das mercadorias vendidas','CUSTO',true),
  ('5.1.01','Despesa com comissões','DESPESA',true),('5.1.02','Despesas administrativas','DESPESA',true),('5.1.03','Despesas comerciais','DESPESA',true)
 ) v(codigo,nome,tipo,analitica) loop
  insert into ctb_contas(codigo,nome,tipo,analitica) values(c.codigo,c.nome,c.tipo,c.analitica) on conflict(codigo) do nothing;
  if found then n=n+1;end if;
 end loop;
 insert into ctb_regras_lancamento(evento,conta_debito_id,conta_credito_id)
 select r.evento,(select id from ctb_contas where codigo=r.d),(select id from ctb_contas where codigo=r.c)
 from (values
  ('TITULO_RECEBER_PEDIDO_VENDA','1.1.02','3.1.01'),('BAIXA_RECEBER','1.1.01','1.1.02'),('DEVOLUCAO_VENDA','3.1.02','1.1.02'),
  ('TITULO_PAGAR_COMPRA','1.1.03','2.1.01'),('BAIXA_PAGAR','2.1.01','1.1.01'),
  ('TITULO_PAGAR_COMISSAO','5.1.01','2.1.02'),('ESTORNO_COMISSAO','2.1.02','5.1.01'),('TITULO_RECEBER_COMISSAO','1.1.04','2.1.02'),
  ('TITULO_PAGAR_PEDIDO_VENDA','1.1.02','2.1.03'),
  ('TITULO_PAGAR_MANUAL','5.1.02','2.1.01'),('TITULO_RECEBER_MANUAL','1.1.04','3.1.01'),
  ('CMV_VENDA','4.1.01','1.1.03'),('CMV_DEVOLUCAO','1.1.03','4.1.01')
 ) r(evento,d,c) on conflict(evento) do nothing;
 return n;
end$$;

-- ---------------------------------------------------------------- Financeiro
create or replace function fin_criar_titulo(p_tipo text,p_origem text,p_origem_id uuid,p_ref text,p_parcela int,p_parceiro text,p_parceiro_id uuid,p_desc text,p_venc date,p_valor numeric,p_centro uuid,p_ator text) returns uuid language plpgsql as $$
declare v_id uuid;
begin
 if p_valor<=0 then return null;end if;
 insert into fin_titulos(tipo,origem,origem_id,ref,parcela,parceiro,parceiro_id,descricao,vencimento,valor,centro_custo_id,competencia,criado_por)
 values(p_tipo,p_origem,p_origem_id,coalesce(p_ref,''),p_parcela,left(coalesce(p_parceiro,''),240),p_parceiro_id,left(coalesce(p_desc,''),300),p_venc,p_valor,p_centro,to_char(current_date,'YYYY-MM'),p_ator)
 on conflict do nothing returning id into v_id;
 if v_id is not null then perform ctb_postar_evento('TITULO_'||p_tipo||'_'||p_origem,v_id,current_date,p_valor,p_desc,p_centro,p_ator);end if;
 return v_id;
end$$;

create or replace function fin_baixar(p_titulo uuid,p_conta uuid,p_data date,p_valor numeric,p_extrato uuid,p_ator text) returns uuid language plpgsql as $$
declare t fin_titulos%rowtype;v_id uuid;novo numeric;
begin
 select * into strict t from fin_titulos where id=p_titulo for update;
 if t.status not in('ABERTO','PARCIAL') then raise exception 'Título % não aceita baixa',t.status;end if;
 if p_valor<=0 then raise exception 'Valor da baixa inválido';end if;
 if p_valor>t.valor-t.valor_baixado then raise exception 'Baixa maior que o saldo do título (saldo %)',t.valor-t.valor_baixado;end if;
 if not exists(select 1 from fin_contas_bancarias where id=p_conta and ativo) then raise exception 'Conta bancária inválida';end if;
 novo=t.valor_baixado+p_valor;
 update fin_titulos set valor_baixado=novo,status=case when novo=valor then 'LIQUIDADO' else 'PARCIAL' end,atualizado_em=now() where id=p_titulo;
 insert into fin_baixas(titulo_id,conta_id,data,valor,extrato_id,criado_por) values(p_titulo,p_conta,p_data,p_valor,p_extrato,p_ator) returning id into v_id;
 if p_extrato is not null then update fin_extratos set baixa_id=v_id where id=p_extrato and baixa_id is null;end if;
 perform ctb_postar_evento('BAIXA_'||t.tipo,v_id,p_data,p_valor,'Baixa título '||t.numero||' '||t.parceiro,t.centro_custo_id,p_ator);
 return v_id;
end$$;

create or replace function fin_estornar_baixa(p_baixa uuid,p_ator text) returns uuid language plpgsql as $$
declare b fin_baixas%rowtype;t fin_titulos%rowtype;v_id uuid;l uuid;novo numeric;
begin
 select * into strict b from fin_baixas where id=p_baixa;
 if b.estorno_de is not null then raise exception 'Estorno não pode ser estornado';end if;
 if exists(select 1 from fin_baixas where estorno_de=p_baixa) then raise exception 'Baixa já estornada';end if;
 select * into strict t from fin_titulos where id=b.titulo_id for update;
 novo=t.valor_baixado-b.valor;
 update fin_titulos set valor_baixado=novo,status=case when novo=0 then 'ABERTO' else 'PARCIAL' end,atualizado_em=now() where id=t.id;
 insert into fin_baixas(titulo_id,conta_id,data,valor,estorno_de,criado_por) values(b.titulo_id,b.conta_id,current_date,b.valor,p_baixa,p_ator) returning id into v_id;
 update fin_extratos set baixa_id=null where baixa_id=p_baixa;
 select id into l from ctb_lancamentos where evento='BAIXA_'||t.tipo and origem_id=p_baixa;
 if l is not null then perform ctb_estornar(l,current_date,p_ator);end if;
 return v_id;
end$$;

create or replace function fin_cancelar_titulo(p_titulo uuid,p_ator text) returns void language plpgsql as $$
declare t fin_titulos%rowtype;l uuid;
begin
 select * into strict t from fin_titulos where id=p_titulo for update;
 if t.valor_baixado>0 then raise exception 'Título com baixa: estorne as baixas antes de cancelar';end if;
 if t.status='CANCELADO' then return;end if;
 update fin_titulos set status='CANCELADO',atualizado_em=now() where id=p_titulo;
 select id into l from ctb_lancamentos where evento='TITULO_'||t.tipo||'_'||t.origem and origem_id=p_titulo;
 if l is not null and not exists(select 1 from ctb_lancamentos where estorno_de=l) then perform ctb_estornar(l,current_date,p_ator);end if;
 delete from ctb_pendencias where origem_id=p_titulo;
end$$;

-- Reduz títulos em aberto da origem (mais distantes primeiro); devolve o valor que não coube (já pago).
create or replace function fin_abater(p_tipo text,p_origem text,p_origem_id uuid,p_valor numeric) returns numeric language plpgsql as $$
declare t record;resto numeric:=p_valor;red numeric;
begin
 for t in select * from fin_titulos where tipo=p_tipo and origem=p_origem and origem_id=p_origem_id and status in('ABERTO','PARCIAL') order by vencimento desc,parcela desc for update loop
  exit when resto<=0;
  red=least(resto,t.valor-t.valor_baixado);
  if red>=t.valor-t.valor_baixado and t.valor_baixado=0 then update fin_titulos set status='CANCELADO',atualizado_em=now() where id=t.id;
  else update fin_titulos set valor=valor-red,status=case when valor-red=valor_baixado then 'LIQUIDADO' else status end,atualizado_em=now() where id=t.id;end if;
  resto=resto-red;
 end loop;
 return resto;
end$$;

create or replace function fin_gerar_receber(p_pedido uuid,p_valor numeric,p_ref text,p_ator text) returns integer language plpgsql as $$
declare pv crm_pedidos_venda%rowtype;cl crm_clientes%rowtype;cond text;prazos int[];n int;i int;parc numeric;acum numeric:=0;v numeric;criados int:=0;v_id uuid;
begin
 select * into strict pv from crm_pedidos_venda where id=p_pedido;
 select * into strict cl from crm_clientes where id=pv.cliente_id;
 cond=coalesce(nullif(pv.condicao_pagamento,''),cl.condicao_pagamento,'');
 select coalesce(array_agg(m[1]::int order by o),array[]::int[]) into prazos from regexp_matches(cond,'\d+','g') with ordinality as r(m,o);
 if coalesce(array_length(prazos,1),0)=0 then prazos=array[0];end if;
 n=array_length(prazos,1);parc=round(p_valor/n,2);
 for i in 1..n loop
  v=case when i=n then p_valor-acum else parc end;acum=acum+v;
  v_id=fin_criar_titulo('RECEBER','PEDIDO_VENDA',p_pedido,p_ref,i,cl.razao_social,cl.id,'Pedido de venda '||pv.numero||' parcela '||i||'/'||n,current_date+prazos[i],v,null,p_ator);
  if v_id is not null then criados=criados+1;end if;
 end loop;
 return criados;
end$$;

create or replace function fin_trg_pedido_venda() returns trigger language plpgsql as $$
declare delta numeric;resto numeric;cl crm_clientes%rowtype;
begin
 if new.faturado_valor>old.faturado_valor then perform fin_gerar_receber(new.id,new.faturado_valor-old.faturado_valor,'FAT:'||new.faturado_valor,new.atualizado_por);end if;
 if new.devolvido_valor>old.devolvido_valor then
  delta=new.devolvido_valor-old.devolvido_valor;
  perform ctb_postar_evento('DEVOLUCAO_VENDA',md5(new.id::text||':DEV:'||new.devolvido_valor)::uuid,current_date,delta,'Devolução pedido '||new.numero,null,new.atualizado_por);
  resto=fin_abater('RECEBER','PEDIDO_VENDA',new.id,delta);
  if resto>0 then
   select * into cl from crm_clientes where id=new.cliente_id;
   perform fin_criar_titulo('PAGAR','PEDIDO_VENDA',new.id,'DEV:'||new.devolvido_valor,1,cl.razao_social,cl.id,'Reembolso de devolução pedido '||new.numero,current_date,resto,null,new.atualizado_por);
  end if;
 end if;
 return new;
end$$;
drop trigger if exists fin_pedido_venda_t on crm_pedidos_venda;
create trigger fin_pedido_venda_t after update of faturado_valor,devolvido_valor on crm_pedidos_venda for each row execute function fin_trg_pedido_venda();

create or replace function fin_trg_comissao() returns trigger language plpgsql as $$
declare rep crm_representantes%rowtype;resto numeric;venc date;v numeric;
begin
 select * into rep from crm_representantes where id=new.representante_id;
 if new.tipo='LIBERACAO' and new.status='A_PAGAR' and new.valor>0 then
  venc=(to_date(new.competencia||'-01','YYYY-MM-DD')+interval '1 month' + interval '9 days')::date;
  perform fin_criar_titulo('PAGAR','COMISSAO',new.pedido_id,'COM:'||new.id,1,rep.nome,rep.id,'Comissão pedido (competência '||new.competencia||')',venc,new.valor,null,new.criado_por);
 elsif new.tipo='ESTORNO' and new.valor<0 then
  v=-new.valor;
  perform ctb_postar_evento('ESTORNO_COMISSAO',new.id,current_date,v,'Estorno de comissão',null,new.criado_por);
  resto=fin_abater('PAGAR','COMISSAO',new.pedido_id,v);
  if resto>0 then perform fin_criar_titulo('RECEBER','COMISSAO',new.pedido_id,'EST:'||new.id,1,rep.nome,rep.id,'Estorno de comissão já paga',current_date+30,resto,null,new.criado_por);end if;
 end if;
 return new;
end$$;
drop trigger if exists fin_comissao_ins_t on crm_comissoes;
create trigger fin_comissao_ins_t after insert on crm_comissoes for each row execute function fin_trg_comissao();
drop trigger if exists fin_comissao_upd_t on crm_comissoes;
create trigger fin_comissao_upd_t after update of status on crm_comissoes for each row when (new.status='A_PAGAR' and old.status is distinct from 'A_PAGAR') execute function fin_trg_comissao();

create or replace function fin_trg_compra() returns trigger language plpgsql as $$
declare f cmp_fornecedores%rowtype;pc cmp_pedidos%rowtype;delta numeric;
begin
 if new.quantidade_recebida<=old.quantidade_recebida then return new;end if;
 select * into strict pc from cmp_pedidos where id=new.pedido_id;
 select * into strict f from cmp_fornecedores where id=pc.fornecedor_id;
 delta=round((new.quantidade_recebida-old.quantidade_recebida)*new.preco_unitario,2);
 perform fin_criar_titulo('PAGAR','COMPRA',new.pedido_id,'REC:'||new.linha||':'||new.quantidade_recebida,1,f.razao_social,f.id,'Compra '||pc.numero||' linha '||new.linha,current_date+f.prazo_medio_dias,delta,null,coalesce(pc.criado_por,'sistema'));
 return new;
end$$;
drop trigger if exists fin_compra_t on cmp_pedido_itens;
create trigger fin_compra_t after update of quantidade_recebida on cmp_pedido_itens for each row execute function fin_trg_compra();

create or replace function fin_trg_cmv() returns trigger language plpgsql as $$
declare v numeric;
begin
 if tg_table_name='exp_remessas' then
  select coalesce(sum(m.custo_total),0) into v from exp_remessa_itens ri join est_movimentos m on m.id=ri.movimento_id where ri.remessa_id=new.id;
  perform ctb_postar_evento('CMV_VENDA',new.id,current_date,v,'CMV remessa '||new.numero,null,new.criado_por);
 else
  select coalesce(custo_total,0) into v from est_movimentos where id=new.movimento_id;
  perform ctb_postar_evento('CMV_DEVOLUCAO',new.id,current_date,v,'Devolução de CMV #'||new.numero,null,new.criado_por);
 end if;
 return new;
end$$;
drop trigger if exists fin_cmv_remessa_t on exp_remessas;
create trigger fin_cmv_remessa_t after update of status on exp_remessas for each row when (new.status='FECHADA' and old.status is distinct from 'FECHADA') execute function fin_trg_cmv();
drop trigger if exists fin_cmv_dev_t on exp_devolucoes;
create trigger fin_cmv_dev_t after insert on exp_devolucoes for each row execute function fin_trg_cmv();

create or replace function fin_conciliar(p_extrato uuid,p_titulo uuid,p_ator text) returns uuid language plpgsql as $$
declare e fin_extratos%rowtype;t fin_titulos%rowtype;
begin
 select * into strict e from fin_extratos where id=p_extrato for update;
 select * into strict t from fin_titulos where id=p_titulo;
 if e.baixa_id is not null then raise exception 'Linha do extrato já conciliada';end if;
 if (e.valor>0 and t.tipo<>'RECEBER') or (e.valor<0 and t.tipo<>'PAGAR') then raise exception 'Sentido do extrato não confere com o tipo do título';end if;
 return fin_baixar(p_titulo,e.conta_id,e.data,abs(e.valor),p_extrato,p_ator);
end$$;

-- ---------------------------------------------------------------- Relatórios
create or replace function fin_saldo_caixa(p_data date) returns numeric language sql stable as $$
 select coalesce((select sum(saldo_inicial) from fin_contas_bancarias where ativo and saldo_inicial_data<=p_data),0)
  +coalesce((select sum(case when (t.tipo='RECEBER')<>(b.estorno_de is not null) then b.valor else -b.valor end)
    from fin_baixas b join fin_titulos t on t.id=b.titulo_id join fin_contas_bancarias c on c.id=b.conta_id where b.data<=p_data and b.data>=c.saldo_inicial_data),0)
$$;
create or replace function fin_fluxo(p_ini date,p_dias int) returns table(dia date,entradas numeric,saidas numeric,saldo_dia numeric,saldo_acum numeric) language sql stable as $$
 with dias as (select generate_series(p_ini,p_ini+(p_dias-1),interval '1 day')::date dia),
 m as (select greatest(vencimento,p_ini) dia,sum(case when tipo='RECEBER' then valor-valor_baixado else 0 end) e,sum(case when tipo='PAGAR' then valor-valor_baixado else 0 end) s
       from fin_titulos where status in('ABERTO','PARCIAL') and vencimento<=p_ini+(p_dias-1) group by 1)
 select d.dia,coalesce(m.e,0),coalesce(m.s,0),coalesce(m.e,0)-coalesce(m.s,0),
  fin_saldo_caixa(p_ini)+sum(coalesce(m.e,0)-coalesce(m.s,0)) over (order by d.dia)
 from dias d left join m on m.dia=d.dia order by d.dia
$$;
create or replace function ctb_balancete(p_ini date,p_fim date) returns table(codigo text,nome text,tipo text,saldo_anterior numeric,debitos numeric,creditos numeric,saldo_final numeric) language sql stable as $$
 select c.codigo::text,c.nome::text,c.tipo::text,
  coalesce(sum(case when l.data<p_ini then p.debito-p.credito end),0),
  coalesce(sum(case when l.data between p_ini and p_fim then p.debito end),0),
  coalesce(sum(case when l.data between p_ini and p_fim then p.credito end),0),
  coalesce(sum(case when l.data<=p_fim then p.debito-p.credito end),0)
 from ctb_contas c left join ctb_partidas p on p.conta_id=c.id left join ctb_lancamentos l on l.id=p.lancamento_id
 where c.analitica group by c.codigo,c.nome,c.tipo order by c.codigo
$$;
create or replace function ctb_dre(p_ini date,p_fim date) returns jsonb language sql stable as $$
 with x as (select c.codigo,c.nome,c.tipo,
   case when c.tipo='RECEITA' then coalesce(sum(p.credito-p.debito),0) else coalesce(sum(p.debito-p.credito),0) end valor
  from ctb_contas c join ctb_partidas p on p.conta_id=c.id join ctb_lancamentos l on l.id=p.lancamento_id
  where c.tipo in('RECEITA','CUSTO','DESPESA') and l.data between p_ini and p_fim group by c.codigo,c.nome,c.tipo)
 select jsonb_build_object('contas',coalesce((select jsonb_agg(to_jsonb(x) order by x.codigo) from x),'[]'::jsonb),
  'receita',coalesce((select sum(valor) from x where tipo='RECEITA'),0),'custo',coalesce((select sum(valor) from x where tipo='CUSTO'),0),'despesa',coalesce((select sum(valor) from x where tipo='DESPESA'),0),
  'resultado',coalesce((select sum(valor) from x where tipo='RECEITA'),0)-coalesce((select sum(valor) from x where tipo in('CUSTO','DESPESA')),0))
$$;
create or replace function ctb_razao(p_conta uuid,p_ini date,p_fim date) returns table(data date,numero bigint,historico text,debito numeric,credito numeric,saldo numeric) language sql stable as $$
 select l.data,l.numero,l.historico::text,p.debito,p.credito,
  coalesce((select sum(p2.debito-p2.credito) from ctb_partidas p2 join ctb_lancamentos l2 on l2.id=p2.lancamento_id where p2.conta_id=p_conta and l2.data<p_ini),0)
  +sum(p.debito-p.credito) over (order by l.data,l.numero,p.id)
 from ctb_partidas p join ctb_lancamentos l on l.id=p.lancamento_id where p.conta_id=p_conta and l.data between p_ini and p_fim order by l.data,l.numero,p.id
$$;
create or replace function ctb_orcado_realizado(p_ini text,p_fim text) returns table(centro text,conta text,orcado numeric,realizado numeric,variacao numeric) language sql stable as $$
 with o as (select centro_custo_id,conta_id,sum(valor_orcado) v from fin_orcamento where competencia between p_ini and p_fim group by 1,2),
 r as (select p.centro_custo_id,p.conta_id,sum(p.debito-p.credito) v from ctb_partidas p join ctb_lancamentos l on l.id=p.lancamento_id join ctb_contas c on c.id=p.conta_id
       where c.tipo in('CUSTO','DESPESA') and p.centro_custo_id is not null and l.competencia between p_ini and p_fim group by 1,2)
 select cc.codigo::text,(ct.codigo||' '||ct.nome)::text,coalesce(o.v,0),coalesce(r.v,0),coalesce(r.v,0)-coalesce(o.v,0)
 from o full join r on r.centro_custo_id=o.centro_custo_id and r.conta_id=o.conta_id
 join fin_centros_custo cc on cc.id=coalesce(o.centro_custo_id,r.centro_custo_id) join ctb_contas ct on ct.id=coalesce(o.conta_id,r.conta_id) order by 1,2
$$;
insert into schema_migrations(name,checksum,aplicada_em,aplicada_por,status) values('2026-10-30_22_financeiro_contabil.sql','964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896',now(),current_user,'APLICADA') on conflict(name) do update set checksum=excluded.checksum,aplicada_em=excluded.aplicada_em,aplicada_por=excluded.aplicada_por,status='APLICADA',erro=null,atualizado_em=now();
insert into schema_migration_events(migration_name,checksum,acao,actor,status) values('2026-10-30_22_financeiro_contabil.sql','964a57b1e24b4003bd35dffc897bd60735156bf2c359e1594dfb3452a164f896','APLICAR',current_user,'APLICADA');
COMMIT;
