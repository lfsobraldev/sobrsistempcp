import { NextResponse } from "next/server";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { podeAvancarMedicao, STATUS_MEDICAO, validarItensMedicao } from "@/lib/medicoes";

export const runtime = "nodejs";
const READ = ["PCP", "GERENTE", "ENCARREGADO", "COMERCIAL", "QUALIDADE"] as const;
const WRITE = ["PCP", "GERENTE", "COMERCIAL"] as const;
const APPROVE = ["PCP", "GERENTE", "ENCARREGADO"] as const;
const clean = (value: unknown, max = 500) => String(value ?? "").trim().slice(0, max);
const json = (value: unknown) => JSON.stringify(value ?? null);
type Db = ReturnType<typeof sql>;

let schemaReady: Promise<void> | null = null;

async function ensureTables(db: Db) {
  await db`create extension if not exists pgcrypto`;
  await db`create table if not exists pcp_medicao_revisoes (
    id uuid primary key default gen_random_uuid(), pedido varchar(80) not null, versao integer not null check(versao>0),
    crm_cliente_id uuid references crm_clientes(id) on delete set null,
    crm_representante_id uuid references crm_representantes(id) on delete set null,
    data_medicao date not null, itens jsonb not null check(jsonb_typeof(itens)='array'), observacoes text not null default '',
    status varchar(40) not null default 'AGUARDANDO_CONFERENCIA'
      check(status in ('AGUARDANDO_CONFERENCIA','COM_PENDENCIAS','AGUARDANDO_APROVACAO','APROVADA_PARA_PRODUCAO')),
    pendencias text not null default '', medido_por varchar(160) not null,
    conferido_por varchar(160) not null default '', conferido_em timestamptz,
    aprovado_por varchar(160) not null default '', aprovado_em timestamptz,
    revisao_de uuid references pcp_medicao_revisoes(id) on delete restrict,
    criado_por varchar(160) not null, criado_em timestamptz not null default now(), unique(pedido,versao)
  )`;
  await db`create index if not exists ix_pcp_medicao_pedido_versao on pcp_medicao_revisoes(pedido,versao desc)`;
  await db`create index if not exists ix_pcp_medicao_status on pcp_medicao_revisoes(status,criado_em desc)`;
  const [specTable] = await db`select to_regclass('public.pcp_comercial_especificacoes') as nome`;
  if (specTable?.nome) await db`alter table pcp_comercial_especificacoes add column if not exists medicao_id uuid references pcp_medicao_revisoes(id) on delete set null`;
  await db`create table if not exists pcp_medicao_eventos (
    id bigserial primary key, medicao_id uuid not null references pcp_medicao_revisoes(id) on delete restrict,
    pedido varchar(80) not null, tipo varchar(60) not null, descricao text not null default '', antes jsonb, depois jsonb,
    usuario varchar(160) not null, criado_em timestamptz not null default now()
  )`;
  await db`create index if not exists ix_pcp_medicao_eventos_medicao on pcp_medicao_eventos(medicao_id,criado_em desc)`;
  const [controlTable] = await db`select to_regclass('public.pcp_controle_entregas') as nome`;
  if (controlTable?.nome) {
    await db`alter table pcp_controle_entregas add column if not exists medicao_obrigatoria boolean not null default false`;
    await db`create table if not exists pcp_controle_entregas_eventos (
      id uuid primary key default gen_random_uuid(), pedido varchar(80) not null references pcp_controle_entregas(pedido),
      acao varchar(40) not null, anterior jsonb, atual jsonb, usuario varchar(100) not null, criado_em timestamptz not null default now()
    )`;
  }
  const [crmOpportunity] = await db`select to_regclass('public.crm_oportunidades') as nome`;
  if (crmOpportunity?.nome) await db`alter table crm_oportunidades add column if not exists medicao_obrigatoria boolean not null default false`;
  const [specs] = await db`select to_regclass('public.pcp_comercial_especificacoes') as nome`;
  if (specs?.nome) await db`alter table pcp_comercial_especificacoes add column if not exists medicao_id uuid references pcp_medicao_revisoes(id) on delete set null`;
  const [sac] = await db`select to_regclass('public.pcp_sac_atendimentos') as nome`;
  if (sac?.nome) {
    await db`alter table pcp_sac_atendimentos add column if not exists crm_cliente_id uuid references crm_clientes(id) on delete set null`;
    await db`alter table pcp_sac_atendimentos add column if not exists crm_representante_id uuid references crm_representantes(id) on delete set null`;
    await db`alter table pcp_sac_atendimentos add column if not exists medicao_id uuid references pcp_medicao_revisoes(id) on delete set null`;
    await db`create index if not exists ix_pcp_sac_crm_cliente on pcp_sac_atendimentos(crm_cliente_id)`;
    await db`create index if not exists ix_pcp_sac_medicao on pcp_sac_atendimentos(medicao_id)`;
  }
}

async function ready(db: Db) {
  if (!schemaReady) schemaReady = ensureTables(db).catch((error) => { schemaReady = null; throw error; });
  await schemaReady;
}

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export async function GET() {
  try {
    await requireRoles([...READ]);
    const db = sql();
    await ready(db);
    const [controlTable] = await db`select to_regclass('public.pcp_controle_entregas') as nome`;
    const pedidos = controlTable?.nome ? await db`
      select c.pedido,c.crm_cliente_id,c.crm_representante_id,c.medicao_obrigatoria,
        coalesce(nullif(cl.nome_fantasia,''),cl.razao_social,c.cliente) cliente,
        coalesce(cr.nome,c.representante) representante,
        m.versao,m.id medicao_id,m.status medicao_status,m.data_medicao::text data_medicao,m.itens,m.observacoes,m.pendencias,
        m.medido_por,m.conferido_por,m.conferido_em,m.aprovado_por,m.aprovado_em,m.criado_em
      from pcp_controle_entregas c
      left join crm_clientes cl on cl.id=c.crm_cliente_id
      left join crm_representantes cr on cr.id=c.crm_representante_id
      left join lateral (select r.* from pcp_medicao_revisoes r where r.pedido=c.pedido order by r.versao desc limit 1) m on true
      where c.crm_cliente_id is not null
      order by case when m.status='COM_PENDENCIAS' then 0 when m.status is null and c.medicao_obrigatoria then 1 when m.status='AGUARDANDO_APROVACAO' then 2 else 3 end,
        c.pedido limit 3000` : [];
    const eventos = await db`select * from pcp_medicao_eventos order by criado_em desc limit 2000`;
    const historico = await db`select * from pcp_medicao_revisoes order by pedido,versao desc limit 3000`;
    return NextResponse.json({ pedidos, eventos, historico }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : error instanceof Error ? error.message : "Falha ao carregar medições." }, { status: forbidden ? 403 : 500 });
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireRoles([...WRITE]);
    const body = await req.json();
    const pedido = clean(body.pedido,80), dataMedicao = clean(body.dataMedicao,10);
    if (!pedido || !validDate(dataMedicao)) return NextResponse.json({ error: "Selecione um pedido e informe uma data de medição válida." }, { status: 400 });
    const itens = validarItensMedicao(body.itens);
    const db = sql();
    await ready(db);
    const [controlTable] = await db`select to_regclass('public.pcp_controle_entregas') as nome`;
    if (!controlTable?.nome) return NextResponse.json({ error: "A Gestão de Pedidos ainda não inicializou o controle oficial." }, { status: 409 });
    const [current] = await db`select versao,id,status from pcp_medicao_revisoes where pedido=${pedido} order by versao desc limit 1`;
    const expectedVersion = Number(body.versaoEsperada ?? 0);
    if (expectedVersion !== Number(current?.versao || 0)) return NextResponse.json({ error: "A medição mudou em outra sessão. Atualize a lista e tente novamente." }, { status: 409 });

    const result = await db`
      with pedido as materialized (
        select c.pedido,c.crm_cliente_id,c.crm_representante_id,c.cliente from pcp_controle_entregas c
        where c.pedido=${pedido} and c.crm_cliente_id is not null for update
      ),
      anterior as materialized (
        select id,versao from pcp_medicao_revisoes where pedido=${pedido} order by versao desc limit 1
      ),
      criado as (
        insert into pcp_medicao_revisoes(pedido,versao,crm_cliente_id,crm_representante_id,data_medicao,itens,observacoes,status,medido_por,criado_por,revisao_de)
        select p.pedido,coalesce(a.versao,0)+1,p.crm_cliente_id,p.crm_representante_id,${dataMedicao}::date,${json(itens)}::jsonb,
          ${clean(body.observacoes,4000)},'AGUARDANDO_CONFERENCIA',${user.usuario},${user.usuario},a.id
        from pedido p left join anterior a on true
        where coalesce(a.versao,0)=${expectedVersion}
        on conflict(pedido,versao) do nothing returning *
      ),
      marca as (
        update pcp_controle_entregas c set medicao_obrigatoria=true,atualizado_por=${user.usuario},atualizado_em=now()
        from criado n where c.pedido=n.pedido returning c.pedido
      ),
      evento as (
        insert into pcp_medicao_eventos(medicao_id,pedido,tipo,descricao,depois,usuario)
        select n.id,n.pedido,'REVISAO_CRIADA','Revisão de medição v'||n.versao,jsonb_build_object('versao',n.versao,'status',n.status),${user.usuario}
        from criado n returning id
      ),
      eventoPedido as (
        insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
        select n.pedido,'MEDICAO_REVISAO',coalesce((select jsonb_agg(a) from anterior a),'[]'::jsonb),
          jsonb_build_object('medicao_id',n.id,'versao',n.versao,'status',n.status),${user.usuario}
        from criado n returning id
      )
      select n.* from criado n join marca m on m.pedido=n.pedido
    `;
    if (!result.length) return NextResponse.json({ error: "Pedido sem vínculo a cliente central ou revisão desatualizada. Vincule o pedido no Comercial e tente novamente." }, { status: 409 });
    const [specTable] = await db`select to_regclass('public.pcp_comercial_especificacoes') as nome`;
    if (specTable?.nome) {
      await db`update pcp_comercial_especificacoes s set medicao_id=${result[0].id}
        from jsonb_to_recordset(${json(itens)}::jsonb) as item(item text)
        where s.pedido=${pedido} and item.item<>'' and s.item=item.item`;
    }
    return NextResponse.json({ item: result[0] }, { status: 201 });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    const duplicate = error instanceof Error && error.message.includes("duplicate key");
    return NextResponse.json({ error: forbidden ? "Sem permissão." : duplicate ? "A medição foi atualizada em outra sessão." : error instanceof Error ? error.message : "Falha ao salvar a medição." }, { status: forbidden ? 403 : duplicate ? 409 : 400 });
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const acao = clean(body.acao,40).toUpperCase(), id = clean(body.id,80);
    const user = await requireRoles(acao === "APROVAR" ? [...APPROVE] : [...WRITE, "ENCARREGADO"]);
    if (!id) return NextResponse.json({ error: "Revisão de medição não informada." }, { status: 400 });
    const db = sql();
    await ready(db);
    const [old] = await db`select * from pcp_medicao_revisoes where id=${id}`;
    if (!old) return NextResponse.json({ error: "Revisão não encontrada." }, { status: 404 });
    const [latest] = await db`select id from pcp_medicao_revisoes where pedido=${old.pedido} order by versao desc limit 1`;
    if (latest?.id !== id) return NextResponse.json({ error: "Só a revisão atual pode avançar. Crie uma nova revisão para alterar dados aprovados." }, { status: 409 });
    if (!podeAvancarMedicao(old.status, acao)) return NextResponse.json({ error: "Transição técnica inválida para o status atual." }, { status: 409 });

    let status: string;
    let pendencias = old.pendencias;
    if (acao === "REGISTRAR_PENDENCIAS") {
      pendencias = clean(body.pendencias,4000);
      if (!pendencias) return NextResponse.json({ error: "Descreva as pendências encontradas." }, { status: 400 });
      status = "COM_PENDENCIAS";
    } else {
      try { validarItensMedicao(old.itens); }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Medição incompleta." }, { status: 400 }); }
      if (acao === "SOLICITAR_APROVACAO") status = "AGUARDANDO_APROVACAO";
      else status = "APROVADA_PARA_PRODUCAO";
    }
    const result = await db`
      with atualizado as (
        update pcp_medicao_revisoes set status=${status},pendencias=${pendencias},
          conferido_por=case when ${acao}='SOLICITAR_APROVACAO' then ${user.usuario} else conferido_por end,
          conferido_em=case when ${acao}='SOLICITAR_APROVACAO' then now() else conferido_em end,
          aprovado_por=case when ${acao}='APROVAR' then ${user.usuario} else aprovado_por end,
          aprovado_em=case when ${acao}='APROVAR' then now() else aprovado_em end
        where id=${id} and status=${old.status} and versao=(select max(versao) from pcp_medicao_revisoes where pedido=${old.pedido})
        returning *
      ),
      evento as (
        insert into pcp_medicao_eventos(medicao_id,pedido,tipo,descricao,antes,depois,usuario)
        select id,pedido,${acao},${pendencias},jsonb_build_object('status','${old.status}'),jsonb_build_object('status',status,'pendencias',pendencias),${user.usuario}
        from atualizado returning id
      ),
      eventoPedido as (
        insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
        select pedido,'MEDICAO_'||${acao},jsonb_build_object('status','${old.status}'),jsonb_build_object('medicao_id',id,'versao',versao,'status',status,'pendencias',pendencias),${user.usuario}
        from atualizado returning id
      )
      select * from atualizado
    `;
    if (!result.length) return NextResponse.json({ error: "A revisão mudou em outra sessão. Atualize os dados antes de continuar." }, { status: 409 });
    return NextResponse.json({ item: result[0] });
  } catch (error) {
    const forbidden = error instanceof Error && error.message === "SEM_PERMISSAO";
    return NextResponse.json({ error: forbidden ? "Sem permissão." : error instanceof Error ? error.message : "Falha ao atualizar medição." }, { status: forbidden ? 403 : 400 });
  }
}