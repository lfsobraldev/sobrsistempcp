import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

async function ensure(db: ReturnType<typeof sql>) {
  await db`
    create table if not exists pcp_ia_conhecimento(
      id uuid primary key default gen_random_uuid(),
      titulo varchar(180) not null,
      area varchar(60) not null default 'GERAL',
      situacao text not null default '',
      regra text not null,
      exemplo text not null default '',
      observacao text not null default '',
      ativo boolean not null default true,
      prioridade int not null default 50,
      criado_por varchar(120) not null default '',
      criado_em timestamptz not null default now(),
      atualizado_em timestamptz not null default now()
    )
  `;
  await db`
    create table if not exists pcp_ia_conhecimento_auditoria (
      id uuid primary key default gen_random_uuid(),
      conhecimento_id uuid not null,
      evento varchar(20) not null,
      autor varchar(120) not null,
      anterior jsonb,
      posterior jsonb,
      criado_em timestamptz not null default now()
    )
  `;
}

const podeTreinar = (perfil: string) => ["PCP","GERENTE"].includes(perfil);

async function unidadeGET() {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error:"Não autenticado." }, { status:401 });
    const db = sql();
    await ensure(db);
    const itens = await db`
      select id,titulo,area,situacao,regra,exemplo,observacao,ativo,prioridade,criado_por,criado_em,atualizado_em
      from pcp_ia_conhecimento
      order by ativo desc,prioridade desc,area,atualizado_em desc
    `;
    return NextResponse.json({ itens, canTrain:podeTreinar(s.perfil) });
  } catch(e:any) {
    return NextResponse.json({ error:e?.message || "Falha ao carregar conhecimento." }, { status:500 });
  }
}

async function unidadePOST(req: Request) {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error:"Não autenticado." }, { status:401 });
    if (!podeTreinar(s.perfil)) return NextResponse.json({ error:"Sem permissão para treinar a IA." }, { status:403 });
    const body = await req.json();
    const titulo = String(body.titulo || "").trim();
    const regra = String(body.regra || "").trim();
    if (!titulo || !regra) return NextResponse.json({ error:"Título e regra são obrigatórios." }, { status:400 });
    const db = sql();
    await ensure(db);
    const [item] = await db`
      insert into pcp_ia_conhecimento(titulo,area,situacao,regra,exemplo,observacao,ativo,prioridade,criado_por)
      values(
        ${titulo},
        ${String(body.area || "GERAL").trim().toUpperCase()},
        ${String(body.situacao || "").trim()},
        ${regra},
        ${String(body.exemplo || "").trim()},
        ${String(body.observacao || "").trim()},
        ${body.ativo !== false},
        ${Math.max(1,Math.min(100,Number(body.prioridade || 50)))},
        ${s.usuario}
      )
      returning *
    `;
    await db`insert into pcp_ia_conhecimento_auditoria
      (conhecimento_id,evento,autor,posterior)
      values(${item.id},'CRIACAO',${s.usuario},${JSON.stringify(item)}::jsonb)`;
    return NextResponse.json({ ok:true,item });
  } catch(e:any) {
    return NextResponse.json({ error:e?.message || "Falha ao salvar conhecimento." }, { status:500 });
  }
}

async function unidadePATCH(req: Request) {
  try {
    const s = await session();
    if (!s) return NextResponse.json({ error:"Não autenticado." }, { status:401 });
    if (!podeTreinar(s.perfil)) return NextResponse.json({ error:"Sem permissão." }, { status:403 });
    const body = await req.json();
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error:"ID obrigatório." }, { status:400 });
    const db = sql();
    await ensure(db);
    const [anterior] = await db`select * from pcp_ia_conhecimento where id=${id}`;
    if (!anterior) return NextResponse.json({error:"Conhecimento não encontrado."},{status:404});
    const [item] = await db`
      update pcp_ia_conhecimento set
        titulo=${String(body.titulo || "").trim()},
        area=${String(body.area || "GERAL").trim().toUpperCase()},
        situacao=${String(body.situacao || "").trim()},
        regra=${String(body.regra || "").trim()},
        exemplo=${String(body.exemplo || "").trim()},
        observacao=${String(body.observacao || "").trim()},
        ativo=${body.ativo !== false},
        prioridade=${Math.max(1,Math.min(100,Number(body.prioridade || 50)))},
        atualizado_em=now()
      where id=${id}
      returning *
    `;
    await db`insert into pcp_ia_conhecimento_auditoria
      (conhecimento_id,evento,autor,anterior,posterior)
      values(${id}::uuid,'ATUALIZACAO',${s.usuario},${JSON.stringify(anterior)}::jsonb,${JSON.stringify(item)}::jsonb)`;
    return NextResponse.json({ ok:true,item });
  } catch(e:any) {
    return NextResponse.json({ error:e?.message || "Falha ao atualizar conhecimento." }, { status:500 });
  }
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
export const PATCH = unidadeHandler(unidadePATCH);
