-- depends-on: 2026-10-28_20_custos_industriais.sql
-- scope: operational
-- migrate:up
create extension if not exists pgcrypto;

alter table crm_clientes add column if not exists uf char(2);
alter table crm_clientes add column if not exists ie varchar(30) not null default '';
alter table crm_clientes add column if not exists regime_tributario varchar(10);
alter table crm_clientes add column if not exists contribuinte_icms boolean not null default true;

create table if not exists fis_emitente(
 singleton boolean primary key default true check(singleton),
 razao_social varchar(240) not null, cnpj varchar(14) not null check(cnpj ~ '^[0-9]{14}$'), ie varchar(30) not null default '',
 uf char(2) not null, regime varchar(10) not null check(regime in('SIMPLES','PRESUMIDO','REAL')),
 atualizado_por varchar(160) not null, atualizado_em timestamptz not null default now()
);
create table if not exists fis_cfop(
 codigo char(4) primary key check(codigo ~ '^[0-9]{4}$'), descricao varchar(240) not null, sentido varchar(7) not null check(sentido in('ENTRADA','SAIDA'))
);
create table if not exists fis_produto_fiscal(
 produto_id uuid primary key references est_produtos(id) on delete cascade,
 ncm char(8) not null check(ncm ~ '^[0-9]{8}$'), cest char(7) check(cest is null or cest ~ '^[0-9]{7}$'),
 origem smallint not null default 0 check(origem between 0 and 8), unidade_trib varchar(6) not null default 'UN',
 classe_ibs_cbs varchar(10) not null default '',
 atualizado_por varchar(160) not null, atualizado_em timestamptz not null default now()
);
create table if not exists fis_parametros(
 chave varchar(60) not null, vigencia_inicio date not null, valor text not null,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 primary key(chave,vigencia_inicio)
);
create table if not exists fis_regras(
 id uuid primary key default gen_random_uuid(),
 descricao varchar(200) not null default '',
 operacao varchar(30) not null check(operacao in('VENDA','COMPRA','DEVOLUCAO_VENDA','DEVOLUCAO_COMPRA','REMESSA','OUTRA')),
 uf_origem char(2), uf_destino char(2), ncm_prefixo varchar(8) not null default '' check(ncm_prefixo ~ '^[0-9]{0,8}$'),
 regime varchar(10) check(regime is null or regime in('SIMPLES','PRESUMIDO','REAL')),
 cfop char(4) not null references fis_cfop(codigo),
 tributos jsonb not null default '[]'::jsonb check(jsonb_typeof(tributos)='array'),
 ibs_cst varchar(10) not null default '', ibs_classe varchar(10) not null default '',
 ibs_aliquota numeric(8,4) not null default 0 check(ibs_aliquota between 0 and 100),
 cbs_aliquota numeric(8,4) not null default 0 check(cbs_aliquota between 0 and 100),
 vigencia_inicio date not null, vigencia_fim date, ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(vigencia_fim is null or vigencia_fim>=vigencia_inicio)
);
create index if not exists ix_fis_regras_op on fis_regras(operacao,vigencia_inicio desc) where ativo;
create table if not exists fis_provedores(
 id uuid primary key default gen_random_uuid(),
 nome varchar(120) not null, adaptador varchar(40) not null check(adaptador in('SIMULADO','MANUAL','EXTERNO')),
 ambiente varchar(12) not null default 'HOMOLOGACAO' check(ambiente in('HOMOLOGACAO','PRODUCAO')),
 segredo_ref varchar(80) not null default '', ativo boolean not null default true,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(),
 check(adaptador<>'SIMULADO' or ambiente='HOMOLOGACAO')
);
create table if not exists fis_documentos(
 id uuid primary key default gen_random_uuid(),
 tipo varchar(5) not null default 'NFE' check(tipo in('NFE','NFSE','CTE','MDFE')),
 evento_id uuid unique references exp_eventos_faturamento(id),
 status varchar(10) not null default 'PENDENCIA' check(status in('PENDENCIA','PRONTO','ENVIADO','AUTORIZADO','REJEITADO','CANCELADO')),
 payload jsonb not null, pendencias jsonb not null default '[]'::jsonb, tributos jsonb not null default '{}'::jsonb,
 total numeric(16,2) not null default 0 check(total>=0),
 provedor_id uuid references fis_provedores(id),
 chave char(44) check(chave is null or chave ~ '^[0-9]{44}$'), numero varchar(20), protocolo varchar(60), erro text,
 autorizado_em timestamptz, cancelado_motivo text,
 criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
);
create unique index if not exists ux_fis_doc_chave on fis_documentos(chave) where chave is not null;
create table if not exists fis_creditos(
 id uuid primary key default gen_random_uuid(),
 competencia char(7) not null check(competencia ~ '^[0-9]{4}-[0-9]{2}$'), tributo varchar(10) not null, valor numeric(16,2) not null check(valor>=0),
 origem varchar(120) not null default '', documento varchar(80) not null default '',
 criado_por varchar(160) not null, criado_em timestamptz not null default now()
);

create or replace function fis_param(p_chave text,p_data date) returns text language sql stable as $$
 select valor from fis_parametros where chave=p_chave and vigencia_inicio<=p_data order by vigencia_inicio desc limit 1
$$;

-- Regra mais específica e vigente (NCM > UF destino > UF origem > regime); empate pela vigência mais recente.
create or replace function fis_regra(p_op text,p_uf_o text,p_uf_d text,p_ncm text,p_regime text,p_data date) returns uuid language sql stable as $$
 select id from fis_regras
 where ativo and operacao=p_op and vigencia_inicio<=p_data and (vigencia_fim is null or vigencia_fim>=p_data)
  and (uf_origem is null or uf_origem=p_uf_o) and (uf_destino is null or uf_destino=p_uf_d)
  and (ncm_prefixo='' or p_ncm like ncm_prefixo||'%') and (regime is null or regime=p_regime)
 order by length(ncm_prefixo)*10+(uf_destino is not null)::int*4+(uf_origem is not null)::int*2+(regime is not null)::int desc,vigencia_inicio desc limit 1
$$;

-- Cálculo parametrizado (estimativa e grupo IBS/CBS): nenhuma alíquota fica no código.
create or replace function fis_calcular_item(p_regra uuid,p_valor numeric,p_data date) returns jsonb language plpgsql stable as $$
declare r fis_regras%rowtype;t jsonb;trib jsonb:='[]'::jsonb;base numeric;ibs jsonb:=null;
begin
 select * into strict r from fis_regras where id=p_regra;
 for t in select value from jsonb_array_elements(r.tributos) loop
  base=round(p_valor*(1-coalesce((t->>'reducao_base')::numeric,0)/100),2);
  trib=trib||jsonb_build_object('tributo',t->>'tributo','cst',t->>'cst','base',base,'aliquota',coalesce((t->>'aliquota')::numeric,0),'valor',round(base*coalesce((t->>'aliquota')::numeric,0)/100,2));
 end loop;
 if coalesce(fis_param('IBS_CBS_INFORMAR',p_data),'false')='true' then
  ibs=jsonb_build_object('cst',r.ibs_cst,'classe',r.ibs_classe,'base',p_valor,'p_ibs',r.ibs_aliquota,'v_ibs',round(p_valor*r.ibs_aliquota/100,2),'p_cbs',r.cbs_aliquota,'v_cbs',round(p_valor*r.cbs_aliquota/100,2));
 end if;
 return jsonb_build_object('cfop',r.cfop,'regra_id',r.id,'tributos',trib,'ibs_cbs',ibs);
end$$;

-- Monta o documento a partir do evento de faturamento da expedição; falta de dado vira pendência, nunca valor inventado.
create or replace function fis_montar_nfe(p_evento uuid,p_data date,p_ator text) returns uuid language plpgsql as $$
declare ev exp_eventos_faturamento%rowtype;em fis_emitente%rowtype;cl crm_clientes%rowtype;it jsonb;pf fis_produto_fiscal%rowtype;reg uuid;calc jsonb;itens jsonb:='[]'::jsonb;pend jsonb:='[]'::jsonb;
 tot jsonb:='{}'::jsonb;t jsonb;total numeric:=0;v_cod text;v_id uuid;v_st text;v_old fis_documentos%rowtype;v_acum numeric;
begin
 select * into strict ev from exp_eventos_faturamento where id=p_evento;
 select * into v_old from fis_documentos where evento_id=p_evento;
 if found and v_old.status not in('PENDENCIA','PRONTO') then raise exception 'Documento já enviado/autorizado: não pode ser remontado';end if;
 select * into em from fis_emitente;
 if not found then pend=pend||to_jsonb('EMITENTE: cadastre o emitente fiscal'::text);end if;
 select * into cl from crm_clientes where id=(ev.payload->>'cliente_id')::uuid;
 if cl.uf is null then pend=pend||to_jsonb('CLIENTE: informe a UF'::text);end if;
 if length(regexp_replace(coalesce(cl.documento,''),'[^0-9]','','g')) not in(11,14) then pend=pend||to_jsonb('CLIENTE: CPF/CNPJ inválido'::text);end if;
 if cl.regime_tributario is null then pend=pend||to_jsonb('CLIENTE: informe o regime tributário'::text);end if;
 for it in select value from jsonb_array_elements(coalesce(ev.payload->'itens','[]'::jsonb)) loop
  v_cod=it->>'produto';
  select f.* into pf from fis_produto_fiscal f join est_produtos p on p.id=f.produto_id where p.codigo=v_cod;
  if not found then pend=pend||to_jsonb('PRODUTO '||v_cod||': sem NCM/cadastro fiscal');continue;end if;
  reg=fis_regra('VENDA',em.uf,cl.uf,pf.ncm,coalesce(cl.regime_tributario,em.regime),p_data);
  if reg is null then pend=pend||to_jsonb('PRODUTO '||v_cod||': nenhuma regra de tributação vigente');continue;end if;
  calc=fis_calcular_item(reg,(it->>'valor')::numeric,p_data);
  itens=itens||(jsonb_build_object('produto',v_cod,'descricao',it->>'descricao','ncm',pf.ncm,'cest',pf.cest,'origem',pf.origem,'unidade',pf.unidade_trib,'quantidade',(it->>'quantidade')::numeric,'valor_unitario',(it->>'preco_unitario')::numeric,'valor',(it->>'valor')::numeric)||calc);
  total=total+(it->>'valor')::numeric;
  for t in select value from jsonb_array_elements(calc->'tributos') loop
   v_acum=coalesce((tot->>(t->>'tributo'))::numeric,0)+(t->>'valor')::numeric;tot=tot||jsonb_build_object(t->>'tributo',v_acum);
  end loop;
  if calc->'ibs_cbs' is not null and calc->'ibs_cbs'<>'null'::jsonb then
   tot=tot||jsonb_build_object('IBS',coalesce((tot->>'IBS')::numeric,0)+(calc->'ibs_cbs'->>'v_ibs')::numeric,'CBS',coalesce((tot->>'CBS')::numeric,0)+(calc->'ibs_cbs'->>'v_cbs')::numeric);
  end if;
 end loop;
 if jsonb_array_length(itens)=0 and jsonb_array_length(pend)=0 then pend=pend||to_jsonb('Evento sem itens'::text);end if;
 v_st=case when jsonb_array_length(pend)=0 then 'PRONTO' else 'PENDENCIA' end;
 insert into fis_documentos(tipo,evento_id,status,payload,pendencias,tributos,total,criado_por)
 values('NFE',p_evento,v_st,jsonb_build_object('emitente',to_jsonb(em),'destinatario',jsonb_build_object('id',cl.id,'razao_social',cl.razao_social,'documento',cl.documento,'ie',cl.ie,'uf',cl.uf,'regime',cl.regime_tributario),
   'remessa',ev.payload->'remessa','pedido_cliente',ev.payload->>'pedido_cliente','frete',ev.payload->'frete','itens',itens,'data_ref',p_data),pend,tot,total,p_ator)
 on conflict(evento_id) do update set status=excluded.status,payload=excluded.payload,pendencias=excluded.pendencias,tributos=excluded.tributos,total=excluded.total,atualizado_em=now()
 returning id into v_id;
 return v_id;
end$$;

-- Máquina de estados do documento; retorno do provedor é a única fonte de chave/protocolo.
create or replace function fis_mudar_status(p_doc uuid,p_novo text,p_chave text,p_numero text,p_protocolo text,p_erro text,p_provedor uuid,p_ator text) returns void language plpgsql as $$
declare d fis_documentos%rowtype;ok boolean;
begin
 select * into strict d from fis_documentos where id=p_doc for update;
 ok=(d.status='PRONTO' and p_novo='ENVIADO') or (d.status='ENVIADO' and p_novo in('AUTORIZADO','REJEITADO')) or (d.status='REJEITADO' and p_novo='PRONTO') or (d.status='AUTORIZADO' and p_novo='CANCELADO');
 if not ok then raise exception 'Transição inválida do documento: % -> %',d.status,p_novo;end if;
 if p_novo='AUTORIZADO' and (p_chave is null or p_chave !~ '^[0-9]{44}$' or coalesce(p_protocolo,'')='') then raise exception 'Autorização exige chave de 44 dígitos e protocolo';end if;
 if p_novo='CANCELADO' and length(trim(coalesce(p_erro,'')))<15 then raise exception 'Cancelamento exige justificativa de ao menos 15 caracteres';end if;
 update fis_documentos set status=p_novo,chave=coalesce(p_chave,chave),numero=coalesce(p_numero,numero),protocolo=coalesce(p_protocolo,protocolo),
  erro=case when p_novo='CANCELADO' then erro else p_erro end,cancelado_motivo=case when p_novo='CANCELADO' then p_erro else cancelado_motivo end,
  provedor_id=coalesce(p_provedor,provedor_id),autorizado_em=case when p_novo='AUTORIZADO' then now() else autorizado_em end,atualizado_em=now() where id=p_doc;
 if p_novo='AUTORIZADO' then update exp_eventos_faturamento set status='ENVIADO' where id=d.evento_id;
 elsif p_novo='CANCELADO' then update exp_eventos_faturamento set status='CANCELADO' where id=d.evento_id;end if;
end$$;

-- Apuração simplificada por competência: débitos de documentos autorizados (menos cancelados) × créditos lançados.
create or replace function fis_apurar(p_comp text) returns table(tributo text,debito numeric,credito numeric,saldo numeric) language sql stable as $$
 with d as (select e.key tributo,sum(e.value::numeric) v from fis_documentos f,jsonb_each_text(f.tributos) e
   where f.status='AUTORIZADO' and to_char(f.autorizado_em at time zone 'America/Sao_Paulo','YYYY-MM')=p_comp group by e.key),
 c as (select tributo,sum(valor) v from fis_creditos where competencia=p_comp group by tributo)
 select coalesce(d.tributo,c.tributo),coalesce(d.v,0),coalesce(c.v,0),coalesce(d.v,0)-coalesce(c.v,0) from d full join c on c.tributo=d.tributo order by 1
$$;

-- migrate:down
drop function if exists fis_apurar(text);
drop function if exists fis_mudar_status(uuid,text,text,text,text,text,uuid,text);
drop function if exists fis_montar_nfe(uuid,date,text);
drop function if exists fis_calcular_item(uuid,numeric,date);
drop function if exists fis_regra(text,text,text,text,text,date);
drop function if exists fis_param(text,date);
drop table if exists fis_creditos;
drop table if exists fis_documentos;
drop table if exists fis_provedores;
drop table if exists fis_regras;
drop table if exists fis_parametros;
drop table if exists fis_produto_fiscal;
drop table if exists fis_cfop;
drop table if exists fis_emitente;
alter table crm_clientes drop column if exists contribuinte_icms;
alter table crm_clientes drop column if exists regime_tributario;
alter table crm_clientes drop column if exists ie;
alter table crm_clientes drop column if exists uf;
