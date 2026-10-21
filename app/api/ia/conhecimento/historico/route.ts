import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime="nodejs";
async function unidadeGET(req:Request){
  try {
    const s=await session();
    if(!s)return NextResponse.json({error:"Não autenticado."},{status:401});
    if(!["PCP","GERENTE"].includes(s.perfil))return NextResponse.json({error:"Sem permissão."},{status:403});
    const id=new URL(req.url).searchParams.get("id")||"";
    if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"ID inválido."},{status:400});
    const db=sql();
    await db`create table if not exists pcp_ia_conhecimento_auditoria (
      id uuid primary key default gen_random_uuid(),
      conhecimento_id uuid not null,
      evento varchar(20) not null,
      autor varchar(120) not null,
      anterior jsonb,
      posterior jsonb,
      criado_em timestamptz not null default now()
    )`;
    const historico=await db`select id,evento,autor,anterior,posterior,criado_em
      from pcp_ia_conhecimento_auditoria
      where conhecimento_id=${id}::uuid
      order by criado_em desc limit 50`;
    return NextResponse.json({historico},{headers:{"Cache-Control":"private, no-store"}});
  }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao consultar histórico."},{status:500});}
}

export const GET = unidadeHandler(unidadeGET);
