import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles, session } from "@/lib/auth";

async function tabela(db: ReturnType<typeof sql>) {
  await db`create table if not exists pcp_producao_diaria_maquina (
    data date not null, processo varchar(80) not null, maquina varchar(120) not null,
    turno varchar(20) not null, produzido numeric(16,3) not null default 0,
    atualizado_por varchar(120) not null default '',
    atualizado_em timestamptz not null default now(),
    primary key(data,processo,maquina,turno)
  )`;
}
export async function GET(req: Request) {
  try {
    if (!await session()) return NextResponse.json({error:"Não autenticado."},{status:401});
    const db=sql();
    await tabela(db);
    const url=new URL(req.url);
    const inicio=url.searchParams.get("inicio");
    const fim=url.searchParams.get("fim");
    const valido=(v:string|null)=>Boolean(v && /^\d{4}-\d{2}-\d{2}$/.test(v));
    const [registros,metas,capacidades]=await Promise.all([
      valido(inicio)&&valido(fim)
        ? db`select data::text as data,processo,maquina,turno,produzido,atualizado_por from pcp_producao_diaria_maquina where data between ${inicio}::date and ${fim}::date order by data desc,processo,maquina,turno`
        : db`select data::text as data,processo,maquina,turno,produzido,atualizado_por from pcp_producao_diaria_maquina where data >= current_date - interval '6 days' order by data desc,processo,maquina,turno`,
      valido(inicio)&&valido(fim)
        ? db`select data::text as data,processo,maquina,turno,meta from pcp_metas_maquina where data between ${inicio}::date and ${fim}::date order by data desc`
        : db`select data::text as data,processo,maquina,turno,meta from pcp_metas_maquina where data >= current_date - interval '6 days' order by data desc`,
      db`select processo,maquina,turno,pecas_hora from pcp_capacidades_maquina order by processo,maquina,turno`,
    ]);
    return NextResponse.json({registros,metas,capacidades},{headers:{"Cache-Control":"no-store"}});
  } catch(e:any) {return NextResponse.json({error:e.message||"Falha ao consultar."},{status:500});}
}
export async function POST(req:Request) {
  try {
    const s=await requireRoles(["PCP"]);
    const b=await req.json();
    const data=String(b.data||""),processo=String(b.processo||"").trim(),maquina=String(b.maquina||"").trim(),turno=String(b.turno||"A").trim();
    const produzido=b.produzido===""||b.produzido==null?null:Number(b.produzido);
    const meta=b.meta===""||b.meta==null?null:Number(b.meta);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data)||!processo||!maquina||!turno||processo.length>80||maquina.length>120||turno.length>20)
      return NextResponse.json({error:"Informe data, setor, máquina e turno válidos."},{status:400});
    if(produzido!==null&&(!Number.isFinite(produzido)||produzido<0||!Number.isInteger(produzido)))
      return NextResponse.json({error:"Informe a quantidade produzida em peças inteiras."},{status:400});
    if(meta!==null&&(!Number.isFinite(meta)||meta<0||!Number.isInteger(meta)))
      return NextResponse.json({error:"Meta inválida."},{status:400});
    if(produzido===null&&meta===null)return NextResponse.json({error:"Informe a meta ou a produção."},{status:400});
    const db=sql();await tabela(db);
    if(produzido!==null) await db`insert into pcp_producao_diaria_maquina(data,processo,maquina,turno,produzido,atualizado_por)
      values(${data}::date,${processo},${maquina},${turno},${produzido},${s.usuario})
      on conflict(data,processo,maquina,turno) do update set produzido=excluded.produzido,atualizado_por=excluded.atualizado_por,atualizado_em=now()`;
    if(meta!==null) await db`insert into pcp_metas_maquina(data,processo,maquina,turno,meta,atualizado_por)
      values(${data}::date,${processo},${maquina},${turno},${meta},${s.usuario})
      on conflict(data,processo,maquina,turno) do update set meta=excluded.meta,atualizado_por=excluded.atualizado_por,atualizado_em=now()`;
    return NextResponse.json({ok:true});
  } catch(e:any) {return NextResponse.json({error:e.message||"Falha ao salvar."},{status:e.message==="SEM_PERMISSAO"?403:500});}
}
