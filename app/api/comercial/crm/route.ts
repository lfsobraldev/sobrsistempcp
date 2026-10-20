import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import {
  normalizarPedidoComercial,
  ORIGENS_CONTATO,
  podeTransicionarOportunidade,
  podeTransicionarProposta,
  STATUS_OPORTUNIDADE,
  STATUS_PROPOSTA,
  totalProposta,
  validarItensProposta,
} from "@/lib/comercial-crm";

export const runtime = "nodejs";

const READ_ROLES = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL"] as const;
const WRITE_ROLES = ["PCP", "GERENTE", "COMERCIAL"] as const;
const clean = (value: unknown, max = 240) => String(value ?? "").trim().slice(0, max);
const json = (value: unknown) => JSON.stringify(value ?? null);
const isDate = (value: string) => {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
type Db = ReturnType<typeof sql>;
let crmSchemaReady: Promise<void> | null = null;

async function ensureCrm(db: Db) {
  await db`create extension if not exists pgcrypto`;
  await db`create table if not exists crm_clientes (
    id uuid primary key default gen_random_uuid(), razao_social varchar(240) not null,
    nome_fantasia varchar(240) not null default '', documento varchar(40) not null default '',
    email varchar(240) not null default '', telefone varchar(50) not null default '', origem varchar(80) not null default '',
    observacoes text not null default '', ativo boolean not null default true,
    criado_por varchar(160) not null, atualizado_por varchar(160) not null,
    criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
  )`;
  await db`create unique index if not exists ux_crm_clientes_documento on crm_clientes(regexp_replace(documento,'[^[:alnum:]]','','g')) where documento<>''`;
  await db`create index if not exists ix_crm_clientes_nome on crm_clientes(lower(razao_social))`;
  await db`create table if not exists crm_cliente_contatos (
    id uuid primary key default gen_random_uuid(), cliente_id uuid not null references crm_clientes(id) on delete cascade,
    nome varchar(180) not null, cargo varchar(120) not null default '', email varchar(240) not null default '',
    telefone varchar(50) not null default '', principal boolean not null default false,
    criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
  )`;
  await db`create index if not exists ix_crm_cliente_contatos_cliente on crm_cliente_contatos(cliente_id)`;
  await db`create table if not exists crm_cliente_enderecos (
    id uuid primary key default gen_random_uuid(), cliente_id uuid not null references crm_clientes(id) on delete cascade,
    tipo varchar(40) not null default 'COMERCIAL', logradouro varchar(240) not null default '', numero varchar(40) not null default '',
    complemento varchar(120) not null default '', bairro varchar(120) not null default '', cidade varchar(160) not null default '',
    uf varchar(2) not null default '', cep varchar(12) not null default '', principal boolean not null default false,
    criado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
  )`;
  await db`create index if not exists ix_crm_cliente_enderecos_cliente on crm_cliente_enderecos(cliente_id)`;
  await db`create table if not exists crm_representantes (
    id uuid primary key default gen_random_uuid(), nome varchar(180) not null, documento varchar(40) not null default '',
    email varchar(240) not null default '', telefone varchar(50) not null default '', regiao varchar(160) not null default '',
    comissao_percentual numeric(7,4) not null default 0 check(comissao_percentual between 0 and 100),
    ativo boolean not null default true, observacoes text not null default '', criado_por varchar(160) not null,
    atualizado_por varchar(160) not null, criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
  )`;
  await db`create unique index if not exists ux_crm_representantes_documento on crm_representantes(regexp_replace(documento,'[^[:alnum:]]','','g')) where documento<>''`;
  await db`create table if not exists crm_cliente_representantes (
    cliente_id uuid not null references crm_clientes(id) on delete cascade,
    representante_id uuid not null references crm_representantes(id) on delete restrict,
    ativo boolean not null default true, criado_por varchar(160) not null, criado_em timestamptz not null default now(),
    atualizado_em timestamptz not null default now(), primary key(cliente_id,representante_id)
  )`;
  await db`create index if not exists ix_crm_cliente_representantes_representante on crm_cliente_representantes(representante_id,ativo)`;
  await db`create table if not exists crm_oportunidades (
    id uuid primary key default gen_random_uuid(), cliente_id uuid not null references crm_clientes(id) on delete restrict,
    contato_id uuid references crm_cliente_contatos(id) on delete set null,
    representante_id uuid references crm_representantes(id) on delete set null,
    titulo varchar(240) not null, descricao text not null default '', origem varchar(80) not null,
    status varchar(24) not null default 'NOVA' check(status in ('NOVA','QUALIFICADA','PROPOSTA','NEGOCIACAO','GANHA','PERDIDA','CONVERTIDA')),
    valor_estimado numeric(16,2) not null default 0 check(valor_estimado>=0), fechamento_previsto date,
    proxima_acao varchar(500) not null default '', proxima_acao_em date, pedido varchar(80),
    criado_por varchar(160) not null, atualizado_por varchar(160) not null,
    criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now(), convertido_em timestamptz
  )`;
  await db`create unique index if not exists ux_crm_oportunidades_pedido on crm_oportunidades(pedido) where pedido is not null`;
  await db`create index if not exists ix_crm_oportunidades_status_acao on crm_oportunidades(status,proxima_acao_em)`;
  await db`create index if not exists ix_crm_oportunidades_cliente on crm_oportunidades(cliente_id,criado_em desc)`;
  await db`create table if not exists crm_interacoes (
    id uuid primary key default gen_random_uuid(), oportunidade_id uuid references crm_oportunidades(id) on delete cascade,
    cliente_id uuid references crm_clientes(id) on delete cascade,
    tipo varchar(40) not null, descricao text not null, proxima_acao varchar(500) not null default '', proxima_acao_em date,
    criado_por varchar(160) not null, criado_em timestamptz not null default now(),
    constraint ck_crm_interacoes_origem check(oportunidade_id is not null or cliente_id is not null)
  )`;
  await db`create index if not exists ix_crm_interacoes_oportunidade on crm_interacoes(oportunidade_id,criado_em desc)`;
  await db`create index if not exists ix_crm_interacoes_cliente on crm_interacoes(cliente_id,criado_em desc)`;
  await db`create table if not exists crm_propostas (
    id uuid primary key default gen_random_uuid(), numero bigint generated always as identity unique,
    oportunidade_id uuid not null references crm_oportunidades(id) on delete restrict,
    status varchar(20) not null default 'RASCUNHO' check(status in ('RASCUNHO','ENVIADA','NEGOCIACAO','ACEITA','RECUSADA','EXPIRADA')),
    validade date, itens jsonb not null default '[]'::jsonb check(jsonb_typeof(itens)='array'),
    total numeric(16,2) not null default 0 check(total>=0), condicoes text not null default '', observacoes text not null default '',
    criado_por varchar(160) not null, atualizado_por varchar(160) not null,
    criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
  )`;
  await db`create index if not exists ix_crm_propostas_oportunidade on crm_propostas(oportunidade_id,criado_em desc)`;
  await db`create unique index if not exists ux_crm_proposta_aceita_oportunidade on crm_propostas(oportunidade_id) where status='ACEITA'`;
  await db`create table if not exists crm_historico (
    id bigserial primary key, entidade varchar(30) not null, entidade_id uuid not null, tipo varchar(60) not null,
    descricao text not null default '', antes jsonb, depois jsonb, usuario varchar(160) not null, criado_em timestamptz not null default now()
  )`;
  await db`create index if not exists ix_crm_historico_entidade on crm_historico(entidade,entidade_id,criado_em desc)`;

  const [controleExiste] = await db`select to_regclass('public.pcp_controle_entregas') as nome`;
  if (controleExiste?.nome) {
    await db`alter table pcp_controle_entregas add column if not exists crm_cliente_id uuid references crm_clientes(id) on delete set null`;
    await db`alter table pcp_controle_entregas add column if not exists crm_representante_id uuid references crm_representantes(id) on delete set null`;
    await db`create table if not exists pcp_controle_entregas_eventos (
      id uuid primary key default gen_random_uuid(), pedido varchar(80) not null references pcp_controle_entregas(pedido),
      acao varchar(40) not null, anterior jsonb, atual jsonb, usuario varchar(100) not null, criado_em timestamptz not null default now()
    )`;
  }
}

async function ensureCrmReady(db: Db) {
  if (!crmSchemaReady) {
    crmSchemaReady = ensureCrm(db).catch((error) => {
      crmSchemaReady = null;
      throw error;
    });
  }
  await crmSchemaReady;
}

async function ensurePedidoCrmLinks(db: Db) {
  const [exists] = await db`select to_regclass('public.pcp_controle_entregas') as nome`;
  if (!exists?.nome) return false;
  await db`alter table pcp_controle_entregas add column if not exists crm_cliente_id uuid references crm_clientes(id) on delete set null`;
  await db`alter table pcp_controle_entregas add column if not exists crm_representante_id uuid references crm_representantes(id) on delete set null`;
  return true;
}

async function history(db: Db, entity: string, id: string, type: string, description: string, user: string, before?: unknown, after?: unknown) {
  await db`insert into crm_historico(entidade,entidade_id,tipo,descricao,antes,depois,usuario)
    values(${entity},${id},${type},${description},${before === undefined ? null : json(before)}::jsonb,${after === undefined ? null : json(after)}::jsonb,${user})`;
}

function dates(body: any, keys: string[]) {
  const values: Record<string, string | null> = {};
  for (const key of keys) {
    const value = clean(body[key], 10);
    if (!isDate(value)) throw new Error(`Data inválida: ${key}.`);
    values[key] = value || null;
  }
  return values;
}

function number(value: unknown, label: string, min = 0, max = 1_000_000_000) {
  const result = Number(value ?? 0);
  if (!Number.isFinite(result) || result < min || result > max) throw new Error(`${label} inválido.`);
  return result;
}

export async function GET() {
  try {
    await requireRoles([...READ_ROLES]);
    const db = sql();
    await ensureCrmReady(db);
    const [clientes, contatos, enderecos, representantes, vinculos, oportunidades, propostas, interacoes, historico] = await Promise.all([
      db`select c.*, (select count(*)::int from crm_cliente_contatos x where x.cliente_id=c.id) contatos_count,
        (select count(*)::int from crm_cliente_enderecos x where x.cliente_id=c.id) enderecos_count
        from crm_clientes c order by c.ativo desc, c.razao_social limit 1000`,
      db`select * from crm_cliente_contatos order by principal desc, nome limit 3000`,
      db`select * from crm_cliente_enderecos order by principal desc, cidade limit 3000`,
      db`select * from crm_representantes order by ativo desc, nome limit 1000`,
      db`select v.*,c.razao_social cliente_nome,r.nome representante_nome from crm_cliente_representantes v
        join crm_clientes c on c.id=v.cliente_id join crm_representantes r on r.id=v.representante_id
        order by v.ativo desc,c.razao_social,r.nome limit 3000`,
      db`select o.*, c.razao_social cliente_nome, c.nome_fantasia cliente_fantasia,
        ct.nome contato_nome, r.nome representante_nome,
        (select count(*)::int from crm_propostas p where p.oportunidade_id=o.id) propostas_count,
        (select p.status from crm_propostas p where p.oportunidade_id=o.id order by p.criado_em desc limit 1) ultima_proposta_status
        from crm_oportunidades o join crm_clientes c on c.id=o.cliente_id
        left join crm_cliente_contatos ct on ct.id=o.contato_id left join crm_representantes r on r.id=o.representante_id
        order by case o.status when 'GANHA' then 0 when 'NEGOCIACAO' then 1 when 'NOVA' then 2 when 'QUALIFICADA' then 3 else 4 end,
        o.proxima_acao_em asc nulls last, o.atualizado_em desc limit 2000`,
      db`select p.*, o.titulo oportunidade_titulo, c.razao_social cliente_nome
        from crm_propostas p join crm_oportunidades o on o.id=p.oportunidade_id join crm_clientes c on c.id=o.cliente_id
        order by p.criado_em desc limit 2000`,
      db`select i.*, o.titulo oportunidade_titulo, c.razao_social cliente_nome from crm_interacoes i
        left join crm_oportunidades o on o.id=i.oportunidade_id left join crm_clientes c on c.id=i.cliente_id
        order by i.criado_em desc limit 3000`,
      db`select * from crm_historico order by criado_em desc limit 1000`,
    ]);
    return NextResponse.json({ clientes, contatos, enderecos, representantes, vinculos, oportunidades, propostas, interacoes, historico }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : error instanceof Error ? error.message : "Falha ao carregar CRM." }, { status: forbidden ? 403 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRoles([...WRITE_ROLES]);
    const body = await req.json();
    const type = clean(body.tipo, 30).toUpperCase();
    const db = sql();
    await ensureCrmReady(db);

    if (type === "CLIENTE") {
      const razaoSocial = clean(body.razaoSocial, 240);
      if (!razaoSocial) return NextResponse.json({ error: "Informe a razão social ou nome do cliente." }, { status: 400 });
      const origem = clean(body.origem,80);
      if (origem && !(ORIGENS_CONTATO as readonly string[]).includes(origem)) return NextResponse.json({ error: "Origem de contato inválida." }, { status: 400 });
      const data = { razao_social: razaoSocial, nome_fantasia: clean(body.nomeFantasia, 240), documento: clean(body.documento, 40), email: clean(body.email, 240), telefone: clean(body.telefone, 50), origem, observacoes: clean(body.observacoes, 3000) };
      const [item] = await db`insert into crm_clientes(razao_social,nome_fantasia,documento,email,telefone,origem,observacoes,criado_por,atualizado_por)
        values(${data.razao_social},${data.nome_fantasia},${data.documento},${data.email},${data.telefone},${data.origem},${data.observacoes},${user.usuario},${user.usuario}) returning *`;
      await history(db, "CLIENTE", item.id, "CRIADO", "Cliente cadastrado", user.usuario, undefined, data);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "CONTATO") {
      const clienteId = clean(body.clienteId, 80), nome = clean(body.nome, 180);
      if (!clienteId || !nome) return NextResponse.json({ error: "Selecione o cliente e informe o contato." }, { status: 400 });
      const [item] = await db`insert into crm_cliente_contatos(cliente_id,nome,cargo,email,telefone,principal,criado_por)
        values(${clienteId},${nome},${clean(body.cargo,120)},${clean(body.email,240)},${clean(body.telefone,50)},${Boolean(body.principal)},${user.usuario}) returning *`;
      await history(db, "CLIENTE", clienteId, "CONTATO_CRIADO", `Contato cadastrado: ${nome}`, user.usuario, undefined, item);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "ENDERECO") {
      const clienteId = clean(body.clienteId, 80);
      if (!clienteId) return NextResponse.json({ error: "Selecione o cliente do endereço." }, { status: 400 });
      const uf = clean(body.uf, 2).toUpperCase();
      if (uf && !/^[A-Z]{2}$/.test(uf)) return NextResponse.json({ error: "UF inválida." }, { status: 400 });
      const data = { tipo: clean(body.tipo,40) || "COMERCIAL", logradouro: clean(body.logradouro,240), numero: clean(body.numero,40), complemento: clean(body.complemento,120), bairro: clean(body.bairro,120), cidade: clean(body.cidade,160), uf, cep: clean(body.cep,12), principal: Boolean(body.principal) };
      const [item] = await db`insert into crm_cliente_enderecos(cliente_id,tipo,logradouro,numero,complemento,bairro,cidade,uf,cep,principal,criado_por)
        values(${clienteId},${data.tipo},${data.logradouro},${data.numero},${data.complemento},${data.bairro},${data.cidade},${data.uf},${data.cep},${data.principal},${user.usuario}) returning *`;
      await history(db, "CLIENTE", clienteId, "ENDERECO_CRIADO", "Endereço cadastrado", user.usuario, undefined, item);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "REPRESENTANTE") {
      const nome = clean(body.nome, 180);
      if (!nome) return NextResponse.json({ error: "Informe o nome do representante." }, { status: 400 });
      const data = { nome, documento: clean(body.documento,40), email: clean(body.email,240), telefone: clean(body.telefone,50), regiao: clean(body.regiao,160), comissao: number(body.comissaoPercentual, "Comissão", 0, 100), observacoes: clean(body.observacoes,3000) };
      const [item] = await db`insert into crm_representantes(nome,documento,email,telefone,regiao,comissao_percentual,observacoes,criado_por,atualizado_por)
        values(${data.nome},${data.documento},${data.email},${data.telefone},${data.regiao},${data.comissao},${data.observacoes},${user.usuario},${user.usuario}) returning *`;
      await history(db, "REPRESENTANTE", item.id, "CRIADO", "Representante cadastrado", user.usuario, undefined, data);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "VINCULO_REPRESENTANTE") {
      const clienteId = clean(body.clienteId,80), representanteId = clean(body.representanteId,80);
      if (!clienteId || !representanteId) return NextResponse.json({ error: "Selecione cliente e representante." }, { status: 400 });
      const [item] = await db`insert into crm_cliente_representantes(cliente_id,representante_id,criado_por)
        values(${clienteId},${representanteId},${user.usuario}) on conflict(cliente_id,representante_id)
        do update set ativo=true,atualizado_em=now() returning *`;
      await history(db,"CLIENTE",clienteId,"REPRESENTANTE_VINCULADO",`Representante ${representanteId} vinculado ao cliente`,user.usuario,undefined,item);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "OPORTUNIDADE") {
      const clienteId = clean(body.clienteId, 80), titulo = clean(body.titulo, 240), origem = clean(body.origem,80);
      if (!clienteId || !titulo || !(ORIGENS_CONTATO as readonly string[]).includes(origem)) return NextResponse.json({ error: "Cliente, título e origem válidos são obrigatórios." }, { status: 400 });
      const contatoId = clean(body.contatoId,80) || null, representanteId = clean(body.representanteId,80) || null;
      if (contatoId && !(await db`select id from crm_cliente_contatos where id=${contatoId} and cliente_id=${clienteId}`).length) return NextResponse.json({ error: "O contato não pertence ao cliente selecionado." }, { status: 400 });
      const dataPrazo = dates(body, ["fechamentoPrevisto", "proximaAcaoEm"]);
      const valor = number(body.valorEstimado, "Valor estimado");
      const data = { clienteId, contatoId, representanteId, titulo, descricao: clean(body.descricao,4000), origem, valor, fechamento: dataPrazo.fechamentoPrevisto, proximaAcao: clean(body.proximaAcao,500), proximaAcaoEm: dataPrazo.proximaAcaoEm };
      const [item] = await db`insert into crm_oportunidades(cliente_id,contato_id,representante_id,titulo,descricao,origem,valor_estimado,fechamento_previsto,proxima_acao,proxima_acao_em,criado_por,atualizado_por)
        values(${data.clienteId},${data.contatoId},${data.representanteId},${data.titulo},${data.descricao},${data.origem},${data.valor},${data.fechamento},${data.proximaAcao},${data.proximaAcaoEm},${user.usuario},${user.usuario}) returning *`;
      await history(db, "OPORTUNIDADE", item.id, "CRIADA", "Oportunidade registrada", user.usuario, undefined, data);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "INTERACAO") {
      let oportunidadeId = clean(body.oportunidadeId,80) || null;
      let clienteId = clean(body.clienteId,80) || null;
      const descricao = clean(body.descricao,4000), tipo = clean(body.interacaoTipo,40) || "ACOMPANHAMENTO";
      if (!oportunidadeId && !clienteId) return NextResponse.json({ error: "Selecione o cliente ou oportunidade da interação." }, { status: 400 });
      if (!descricao) return NextResponse.json({ error: "Informe a descrição do contato." }, { status: 400 });
      if (oportunidadeId) {
        const [op] = await db`select cliente_id from crm_oportunidades where id=${oportunidadeId}`;
        if (!op) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
        if (clienteId && clienteId !== op.cliente_id) return NextResponse.json({ error: "A oportunidade não pertence ao cliente selecionado." }, { status: 400 });
        clienteId = op.cliente_id;
      } else if (!(await db`select id from crm_clientes where id=${clienteId}`).length) {
        return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      }
      const dataPrazo = dates(body, ["proximaAcaoEm"]);
      const proximaAcao = clean(body.proximaAcao,500);
      const [item] = await db`insert into crm_interacoes(oportunidade_id,cliente_id,tipo,descricao,proxima_acao,proxima_acao_em,criado_por)
        values(${oportunidadeId},${clienteId},${tipo},${descricao},${proximaAcao},${dataPrazo.proximaAcaoEm},${user.usuario}) returning *`;
      if (oportunidadeId) await db`update crm_oportunidades set proxima_acao=${proximaAcao},proxima_acao_em=${dataPrazo.proximaAcaoEm},atualizado_por=${user.usuario},atualizado_em=now() where id=${oportunidadeId}`;
      await history(db, oportunidadeId ? "OPORTUNIDADE" : "CLIENTE", oportunidadeId || clienteId!, "INTERACAO", descricao, user.usuario, undefined, item);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "VINCULAR_PEDIDO") {
      const clienteId = clean(body.clienteId,80), pedido = clean(body.pedido,10);
      const pedidoNormalizado = normalizarPedidoComercial(pedido);
      if (!clienteId || !pedidoNormalizado) return NextResponse.json({ error: "Selecione o cliente e informe um número de pedido válido." }, { status: 400 });
      if (!await ensurePedidoCrmLinks(db)) return NextResponse.json({ error: "A Gestão de Pedidos ainda não inicializou a Carteira. Abra-a antes de vincular." }, { status: 409 });
      const resultado = await db`
        with trava as materialized (select pg_advisory_xact_lock(hashtext(${pedidoNormalizado}))),
        cliente as materialized (select id,razao_social from crm_clientes where id=${clienteId}),
        controles as materialized (
          select c.pedido,c.crm_cliente_id from pcp_controle_entregas c cross join trava
          where coalesce(nullif(ltrim(trim(c.pedido),'0'),''),'0')=${pedidoNormalizado}
          limit 2 for update of c
        ),
        produtos as materialized (
          select distinct p.pedido from pcp_produtos p cross join trava
          where coalesce(nullif(ltrim(trim(p.pedido),'0'),''),'0')=${pedidoNormalizado}
          limit 2
        ),
        candidatos as materialized (
          select pedido from controles where (select count(*) from controles)=1
          union all
          select pedido from produtos where (select count(*) from controles)=0 and (select count(*) from produtos)=1
        ),
        atualizados as (
          update pcp_controle_entregas c set crm_cliente_id=cl.id,cliente=cl.razao_social,atualizado_por=${user.usuario},atualizado_em=now()
          from candidatos x cross join cliente cl where c.pedido=x.pedido and (c.crm_cliente_id is null or c.crm_cliente_id=cl.id)
          returning c.pedido,c.crm_cliente_id,c.cliente,c.representante
        ),
        inseridos as (
          insert into pcp_controle_entregas(pedido,cliente,representante,crm_cliente_id,status,atualizado_por)
          select x.pedido,cl.razao_social,'',cl.id,'PLANEJADO',${user.usuario} from candidatos x cross join cliente cl
          where not exists(select 1 from controles) and exists(select 1 from produtos where pedido=x.pedido)
          returning pedido,crm_cliente_id,cliente,representante
        ),
        ligados as (select * from atualizados union all select * from inseridos),
        evento_pedido as (
          insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
          select n.pedido,'CRM_CLIENTE_VINCULADO',coalesce((select jsonb_agg(c) from controles c),'[]'::jsonb),
            jsonb_build_object('crm_cliente_id',n.crm_cliente_id,'cliente',n.cliente,'representante',n.representante),${user.usuario} from ligados n returning id
        ),
        evento_crm as (
          insert into crm_historico(entidade,entidade_id,tipo,descricao,depois,usuario)
          select 'CLIENTE',cl.id,'PEDIDO_VINCULADO','Pedido '||n.pedido||' vinculado ao cadastro central',
            jsonb_build_object('pedido',n.pedido),${user.usuario} from ligados n cross join cliente cl returning id
        )
        select (select count(*)::int from controles) controles,(select count(*)::int from produtos) produtos,
          (select count(*)::int from ligados) ligados,(select pedido from ligados limit 1) pedido,
          exists(select 1 from controles where crm_cliente_id is not null and crm_cliente_id<>${clienteId}) conflito_cliente,
          (select count(*)::int from cliente) cliente_encontrado
      `;
      const row = resultado[0];
      if (!row?.cliente_encontrado) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      if (row.conflito_cliente) return NextResponse.json({ error: "O pedido já está vinculado a outro cliente central." }, { status: 409 });
      if (row.controles > 1 || (!row.controles && row.produtos > 1)) return NextResponse.json({ error: "Há mais de um pedido com esse número normalizado; revise os zeros à esquerda antes de vincular." }, { status: 409 });
      if (!row.ligados) return NextResponse.json({ error: "Pedido não encontrado na Carteira nem na programação. Cadastre-o no fluxo comercial existente." }, { status: 404 });
      return NextResponse.json({ ok: true, pedido: row.pedido }, { status: 200 });
    }

    if (type === "PROPOSTA") {
      const oportunidadeId = clean(body.oportunidadeId,80), itens = validarItensProposta(body.itens), datas = dates(body,["validade"]);
      if (!oportunidadeId) return NextResponse.json({ error: "Selecione a oportunidade da proposta." }, { status: 400 });
      const data = { itens, total: totalProposta(itens), validade: datas.validade, condicoes: clean(body.condicoes,3000), observacoes: clean(body.observacoes,3000) };
      const [op] = await db`select id,status from crm_oportunidades where id=${oportunidadeId}`;
      if (!op) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
      if (["GANHA","PERDIDA","CONVERTIDA"].includes(op.status)) return NextResponse.json({ error: "Não é possível propor em uma oportunidade encerrada." }, { status: 409 });
      const [item] = await db`insert into crm_propostas(oportunidade_id,validade,itens,total,condicoes,observacoes,criado_por,atualizado_por)
        values(${oportunidadeId},${data.validade},${json(data.itens)}::jsonb,${data.total},${data.condicoes},${data.observacoes},${user.usuario},${user.usuario}) returning *`;
      if (["NOVA","QUALIFICADA"].includes(op.status)) await db`update crm_oportunidades set status='PROPOSTA',atualizado_por=${user.usuario},atualizado_em=now() where id=${oportunidadeId}`;
      await history(db, "PROPOSTA", item.id, "CRIADA", `Proposta #${item.numero} criada`, user.usuario, undefined, item);
      return NextResponse.json({ item }, { status: 201 });
    }

    if (type === "CONVERTER") return await converter(db, body, user.usuario);
    return NextResponse.json({ error: "Tipo de operação comercial inválido." }, { status: 400 });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    const duplicate = error instanceof Error && error.message.includes("duplicate key");
    return NextResponse.json({ error: forbidden ? "Sem permissão." : duplicate ? "Já existe um cadastro com esse documento." : error instanceof Error ? error.message : "Falha ao gravar no CRM." }, { status: forbidden ? 403 : duplicate ? 409 : 400 });
  }
}

async function converter(db: Db, body: any, usuario: string) {
  const oportunidadeId = clean(body.oportunidadeId,80), pedido = clean(body.pedido,10);
  const pedidoNormalizado = normalizarPedidoComercial(pedido);
  if (!oportunidadeId || !pedidoNormalizado) return NextResponse.json({ error: "Informe uma oportunidade e um pedido numérico de 4 a 10 dígitos." }, { status: 400 });
  if (!await ensurePedidoCrmLinks(db)) return NextResponse.json({ error: "A Gestão de Pedidos ainda não inicializou o controle oficial. Abra Gestão de Pedidos e tente novamente; nenhum cadastro foi convertido." }, { status: 409 });
  const [op] = await db`select id,status,pedido from crm_oportunidades where id=${oportunidadeId}`;
  if (!op) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
  if (op.status === "CONVERTIDA" && String(op.pedido) === pedido) return NextResponse.json({ ok: true, pedido, idempotente: true });
  if (op.status !== "GANHA") return NextResponse.json({ error: "Marque a oportunidade como ganha após uma proposta aceita antes de converter." }, { status: 409 });
  const [aceita] = await db`select id from crm_propostas where oportunidade_id=${oportunidadeId} and status='ACEITA' limit 1`;
  if (!aceita) return NextResponse.json({ error: "A oportunidade precisa ter uma proposta aceita." }, { status: 409 });
  const resultado = await db`
    with trava as materialized (
      select pg_advisory_xact_lock(hashtext(${pedidoNormalizado}))
    ),
    oportunidade as materialized (
      select o.id,o.cliente_id,o.representante_id,c.razao_social,coalesce(r.nome,'') representante
      from crm_oportunidades o join crm_clientes c on c.id=o.cliente_id
      left join crm_representantes r on r.id=o.representante_id cross join trava
      where o.id=${oportunidadeId} and o.status='GANHA' and o.pedido is null
      for update of o
    ),
    duplicado as materialized (
      select c.pedido from pcp_controle_entregas c cross join trava
      where coalesce(nullif(ltrim(trim(c.pedido),'0'),''),'0')=${pedidoNormalizado}
      union all
      select p.pedido from pcp_produtos p cross join trava
      where coalesce(nullif(ltrim(trim(p.pedido),'0'),''),'0')=${pedidoNormalizado}
      limit 1
    ),
    pedido_novo as (
      insert into pcp_controle_entregas(pedido,cliente,representante,crm_cliente_id,crm_representante_id,status,atualizado_por)
      select ${pedido},o.razao_social,o.representante,o.cliente_id,o.representante_id,'PLANEJADO',${usuario}
      from oportunidade o where not exists(select 1 from duplicado)
      returning pedido,crm_cliente_id,cliente,representante
    ),
    oportunidade_convertida as (
      update crm_oportunidades o set status='CONVERTIDA',pedido=n.pedido,convertido_em=now(),atualizado_por=${usuario},atualizado_em=now()
      from pedido_novo n where o.id=${oportunidadeId} returning o.id,o.pedido
    ),
    evento_pedido as (
      insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
      select n.pedido,'CRM_CONVERSAO','{}'::jsonb,jsonb_build_object('cliente_id',n.crm_cliente_id,'cliente',n.cliente,'representante',n.representante),${usuario}
      from pedido_novo n returning id
    ),
    evento_crm as (
      insert into crm_historico(entidade,entidade_id,tipo,descricao,depois,usuario)
      select 'OPORTUNIDADE',o.id,'CONVERTIDA','Convertida no pedido '||o.pedido,jsonb_build_object('pedido',o.pedido),${usuario}
      from oportunidade_convertida o returning id
    )
    select pedido from oportunidade_convertida
  `;
  if (!resultado.length) {
    const [duplicado] = await db`select pedido from pcp_controle_entregas where coalesce(nullif(ltrim(trim(pedido),'0'),''),'0')=${pedidoNormalizado}
      union all select pedido from pcp_produtos where coalesce(nullif(ltrim(trim(pedido),'0'),''),'0')=${pedidoNormalizado} limit 1`;
    return NextResponse.json({ error: duplicado ? `O pedido ${duplicado.pedido} já existe na Carteira ou na programação.` : "A oportunidade mudou de estado; atualize a tela e tente novamente." }, { status: 409 });
  }
  return NextResponse.json({ ok: true, pedido: resultado[0].pedido }, { status: 201 });
}

export async function PATCH(req: Request) {
  try {
    const user = await requireRoles([...WRITE_ROLES]);
    const body = await req.json(), tipo = clean(body.tipo,30).toUpperCase(), id = clean(body.id,80);
    if (!id && tipo !== "VINCULO_REPRESENTANTE") return NextResponse.json({ error: "Registro não informado." }, { status: 400 });
    const db = sql();
    await ensureCrmReady(db);

    if (tipo === "CLIENTE") {
      const [old] = await db`select * from crm_clientes where id=${id}`;
      if (!old) return NextResponse.json({ error: "Cliente não encontrado." }, { status: 404 });
      const nome = clean(body.razaoSocial ?? old.razao_social,240);
      if (!nome) return NextResponse.json({ error: "Razão social ou nome obrigatório." }, { status: 400 });
      const origem = clean(body.origem ?? old.origem,80);
      if (origem && !(ORIGENS_CONTATO as readonly string[]).includes(origem)) return NextResponse.json({ error: "Origem de contato inválida." }, { status: 400 });
      const [item] = await db`update crm_clientes set razao_social=${nome},nome_fantasia=${clean(body.nomeFantasia ?? old.nome_fantasia,240)},
        documento=${clean(body.documento ?? old.documento,40)},email=${clean(body.email ?? old.email,240)},telefone=${clean(body.telefone ?? old.telefone,50)},
        origem=${origem},observacoes=${clean(body.observacoes ?? old.observacoes,3000)},ativo=${body.ativo===undefined?old.ativo:Boolean(body.ativo)},
        atualizado_por=${user.usuario},atualizado_em=now() where id=${id} returning *`;
      const [hasCustomerLink] = await db`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='crm_cliente_id') as existe`;
      if (hasCustomerLink?.existe) await db`
        with anterior as materialized (select pedido,cliente from pcp_controle_entregas where crm_cliente_id=${id}),
        atualizado as (update pcp_controle_entregas set cliente=${item.razao_social},atualizado_por=${user.usuario},atualizado_em=now()
          where crm_cliente_id=${id} returning pedido,cliente)
        insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
        select n.pedido,'CRM_CLIENTE_RENOMEADO',jsonb_build_object('cliente',a.cliente),jsonb_build_object('cliente',n.cliente,'crm_cliente_id',${id}),${user.usuario}
        from atualizado n join anterior a using(pedido)`;
      await history(db,"CLIENTE",id,"EDITADO","Cadastro do cliente atualizado",user.usuario,old,item);
      return NextResponse.json({ item });
    }

    if (tipo === "CONTATO") {
      const [old] = await db`select * from crm_cliente_contatos where id=${id}`;
      if (!old) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
      const [item] = await db`update crm_cliente_contatos set nome=${clean(body.nome ?? old.nome,180)},cargo=${clean(body.cargo ?? old.cargo,120)},
        email=${clean(body.email ?? old.email,240)},telefone=${clean(body.telefone ?? old.telefone,50)},principal=${body.principal===undefined?old.principal:Boolean(body.principal)},atualizado_em=now()
        where id=${id} returning *`;
      await history(db,"CLIENTE",old.cliente_id,"CONTATO_EDITADO",`Contato atualizado: ${item.nome}`,user.usuario,old,item);
      return NextResponse.json({ item });
    }

    if (tipo === "ENDERECO") {
      const [old] = await db`select * from crm_cliente_enderecos where id=${id}`;
      if (!old) return NextResponse.json({ error: "Endereço não encontrado." }, { status: 404 });
      const uf = clean(body.uf ?? old.uf,2).toUpperCase();
      if (uf && !/^[A-Z]{2}$/.test(uf)) return NextResponse.json({ error: "UF inválida." }, { status: 400 });
      const [item] = await db`update crm_cliente_enderecos set tipo=${clean(body.tipo ?? old.tipo,40)},logradouro=${clean(body.logradouro ?? old.logradouro,240)},
        numero=${clean(body.numero ?? old.numero,40)},complemento=${clean(body.complemento ?? old.complemento,120)},bairro=${clean(body.bairro ?? old.bairro,120)},
        cidade=${clean(body.cidade ?? old.cidade,160)},uf=${uf},cep=${clean(body.cep ?? old.cep,12)},principal=${body.principal===undefined?old.principal:Boolean(body.principal)},atualizado_em=now()
        where id=${id} returning *`;
      await history(db,"CLIENTE",old.cliente_id,"ENDERECO_EDITADO","Endereço atualizado",user.usuario,old,item);
      return NextResponse.json({ item });
    }

    if (tipo === "REPRESENTANTE") {
      const [old] = await db`select * from crm_representantes where id=${id}`;
      if (!old) return NextResponse.json({ error: "Representante não encontrado." }, { status: 404 });
      const nome = clean(body.nome ?? old.nome,180);
      if (!nome) return NextResponse.json({ error: "Informe o nome do representante." }, { status: 400 });
      const comissao = number(body.comissaoPercentual ?? old.comissao_percentual,"Comissão",0,100);
      const [item] = await db`update crm_representantes set nome=${nome},documento=${clean(body.documento ?? old.documento,40)},
        email=${clean(body.email ?? old.email,240)},telefone=${clean(body.telefone ?? old.telefone,50)},regiao=${clean(body.regiao ?? old.regiao,160)},
        comissao_percentual=${comissao},observacoes=${clean(body.observacoes ?? old.observacoes,3000)},ativo=${body.ativo===undefined?old.ativo:Boolean(body.ativo)},
        atualizado_por=${user.usuario},atualizado_em=now() where id=${id} returning *`;
      const [hasRepresentativeLink] = await db`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='pcp_controle_entregas' and column_name='crm_representante_id') as existe`;
      if (hasRepresentativeLink?.existe) await db`
        with anterior as materialized (select pedido,representante from pcp_controle_entregas where crm_representante_id=${id}),
        atualizado as (update pcp_controle_entregas set representante=${item.nome},atualizado_por=${user.usuario},atualizado_em=now()
          where crm_representante_id=${id} returning pedido,representante)
        insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
        select n.pedido,'CRM_REPRESENTANTE_RENOMEADO',jsonb_build_object('representante',a.representante),jsonb_build_object('representante',n.representante,'crm_representante_id',${id}),${user.usuario}
        from atualizado n join anterior a using(pedido)`;
      await history(db,"REPRESENTANTE",id,"EDITADO","Cadastro do representante atualizado",user.usuario,old,item);
      return NextResponse.json({ item });
    }

    if (tipo === "VINCULO_REPRESENTANTE") {
      const clienteId = clean(body.clienteId,80), representanteId = clean(body.representanteId,80);
      const ativo = Boolean(body.ativo);
      const [old] = await db`select * from crm_cliente_representantes where cliente_id=${clienteId} and representante_id=${representanteId}`;
      if (!old) return NextResponse.json({ error: "Vínculo não encontrado." }, { status: 404 });
      const [item] = await db`update crm_cliente_representantes set ativo=${ativo},atualizado_em=now()
        where cliente_id=${clienteId} and representante_id=${representanteId} returning *`;
      await history(db,"CLIENTE",clienteId,ativo?"REPRESENTANTE_VINCULADO":"REPRESENTANTE_DESVINCULADO",`${ativo?"Reativado":"Desativado"} vínculo do representante ${representanteId}`,user.usuario,old,item);
      return NextResponse.json({ item });
    }

    if (tipo === "OPORTUNIDADE") {
      const [old] = await db`select * from crm_oportunidades where id=${id}`;
      if (!old) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
      const status = clean(body.status ?? old.status,24).toUpperCase();
      if (!(STATUS_OPORTUNIDADE as readonly string[]).includes(status) || (status !== old.status && !podeTransicionarOportunidade(old.status,status))) return NextResponse.json({ error: "Transição de etapa da oportunidade inválida." }, { status: 400 });
      const origem = clean(body.origem ?? old.origem,80);
      if (!(ORIGENS_CONTATO as readonly string[]).includes(origem)) return NextResponse.json({ error: "Origem da oportunidade inválida." }, { status: 400 });
      if (status === "GANHA") {
        const [accepted] = await db`select id from crm_propostas where oportunidade_id=${id} and status='ACEITA' limit 1`;
        if (!accepted) return NextResponse.json({ error: "Aceite uma proposta antes de marcar a oportunidade como ganha." }, { status: 409 });
      }
      const dateValues = dates({ fechamentoPrevisto: body.fechamentoPrevisto ?? old.fechamento_previsto, proximaAcaoEm: body.proximaAcaoEm ?? old.proxima_acao_em },["fechamentoPrevisto","proximaAcaoEm"]);
      const representanteId = body.representanteId === undefined ? old.representante_id : (clean(body.representanteId,80)||null);
      const contatoId = body.contatoId === undefined ? old.contato_id : (clean(body.contatoId,80)||null);
      if (contatoId && !(await db`select id from crm_cliente_contatos where id=${contatoId} and cliente_id=${old.cliente_id}`).length) return NextResponse.json({ error: "O contato não pertence ao cliente da oportunidade." }, { status: 400 });
      const valor = body.valorEstimado === undefined ? Number(old.valor_estimado) : number(body.valorEstimado,"Valor estimado");
      const [item] = await db`update crm_oportunidades set contato_id=${contatoId},representante_id=${representanteId},titulo=${clean(body.titulo ?? old.titulo,240)},
        descricao=${clean(body.descricao ?? old.descricao,4000)},origem=${origem},status=${status},valor_estimado=${valor},fechamento_previsto=${dateValues.fechamentoPrevisto},
        proxima_acao=${clean(body.proximaAcao ?? old.proxima_acao,500)},proxima_acao_em=${dateValues.proximaAcaoEm},atualizado_por=${user.usuario},atualizado_em=now()
        where id=${id} returning *`;
      await history(db,"OPORTUNIDADE",id,"EDITADA",`Oportunidade: ${old.status} → ${status}`,user.usuario,old,item);
      return NextResponse.json({ item });
    }

    if (tipo === "PROPOSTA") {
      const [old] = await db`select * from crm_propostas where id=${id}`;
      if (!old) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
      if (old.status !== "RASCUNHO" && ["itens", "validade", "condicoes", "observacoes"].some((field) => body[field] !== undefined)) {
        return NextResponse.json({ error: "Propostas enviadas não podem ter conteúdo sobrescrito. Crie uma nova proposta para registrar uma revisão." }, { status: 409 });
      }
      const status = clean(body.status ?? old.status,20).toUpperCase();
      if (!(STATUS_PROPOSTA as readonly string[]).includes(status) || (status !== old.status && !podeTransicionarProposta(old.status,status))) return NextResponse.json({ error: "Transição de status da proposta inválida." }, { status: 400 });
      if (status === "ACEITA") {
        const [opportunity] = await db`select status from crm_oportunidades where id=${old.oportunidade_id}`;
        if (!opportunity || ["PERDIDA","CONVERTIDA"].includes(opportunity.status)) return NextResponse.json({ error: "Não é possível aceitar proposta de oportunidade encerrada." }, { status: 409 });
        const [accepted] = await db`select id from crm_propostas where oportunidade_id=${old.oportunidade_id} and status='ACEITA' and id<>${id} limit 1`;
        if (accepted) return NextResponse.json({ error: "Esta oportunidade já tem outra proposta aceita." }, { status: 409 });
      }
      const itens = body.itens === undefined ? old.itens : validarItensProposta(body.itens);
      const total = body.itens === undefined ? Number(old.total) : totalProposta(itens);
      const validade = body.validade === undefined ? (old.validade ? String(old.validade).slice(0,10) : null) : dates(body,["validade"]).validade;
      const [item] = await db`update crm_propostas set status=${status},validade=${validade},itens=${body.itens===undefined?old.itens:json(itens)}::jsonb,total=${total},
        condicoes=${clean(body.condicoes ?? old.condicoes,3000)},observacoes=${clean(body.observacoes ?? old.observacoes,3000)},atualizado_por=${user.usuario},atualizado_em=now()
        where id=${id} returning *`;
      if (status === "ACEITA") await db`update crm_oportunidades set status='GANHA',atualizado_por=${user.usuario},atualizado_em=now()
        where id=${old.oportunidade_id} and status in ('NOVA','QUALIFICADA','PROPOSTA','NEGOCIACAO')`;
      await history(db,"PROPOSTA",id,"STATUS_ALTERADO",`Proposta: ${old.status} → ${status}`,user.usuario,old,item);
      return NextResponse.json({ item });
    }

    return NextResponse.json({ error: "Tipo de atualização comercial inválido." }, { status: 400 });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    const duplicate = error instanceof Error && error.message.includes("duplicate key");
    return NextResponse.json({ error: forbidden ? "Sem permissão." : duplicate ? "Documento já cadastrado." : error instanceof Error ? error.message : "Falha ao atualizar CRM." }, { status: forbidden ? 403 : duplicate ? 409 : 400 });
  }
}