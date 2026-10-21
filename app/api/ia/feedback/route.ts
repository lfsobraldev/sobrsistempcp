import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { session } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";

async function ensure() {
  const db=sql();
  await db`create table if not exists pcp_ia_feedback (
    id uuid primary key default gen_random_uuid(),
    usuario varchar(120) not null,
    pergunta text not null,
    resposta text not null,
    correcao text not null,
    status varchar(20) not null default 'PENDENTE',
    revisado_por varchar(120),
    criado_em timestamptz not null default now(),
    revisado_em timestamptz,
    conhecimento_id uuid
  )`;
  await db`alter table pcp_ia_feedback add column if not exists conhecimento_id uuid`;
  return db;
}
const autorizado=(perfil:string)=>["PCP","GERENTE"].includes(perfil);

async function unidadePOST(req:Request) {
  try {
    const s=await session();
    if(!s)return NextResponse.json({error:"Não autenticado."},{status:401});
    const b=await req.json();
    const pergunta=String(b.pergunta||"").trim().slice(0,4000);
    const resposta=String(b.resposta||"").trim().slice(0,8000);
    const correcao=String(b.correcao||"").trim().slice(0,8000);
    if(!pergunta || !resposta || correcao.length<10) return NextResponse.json({error:"Informe pergunta, resposta e uma correção com pelo menos 10 caracteres."},{status:400});
    const db=await ensure();
    const [item]=await db`insert into pcp_ia_feedback(usuario,pergunta,resposta,correcao)
      values(${s.usuario},${pergunta},${resposta},${correcao})
      returning id,status,criado_em`;
    return NextResponse.json({ok:true,item,mensagem:"Correção enviada para validação; não altera automaticamente as decisões da IA."});
  }catch(e:any){return NextResponse.json({error:e?.message||"Erro ao registrar correção."},{status:500});}
}
async function unidadeGET(){
  try{
    const s=await session();
    if(!s)return NextResponse.json({error:"Não autenticado."},{status:401});
    if(!autorizado(s.perfil))return NextResponse.json({error:"Sem permissão."},{status:403});
    const db=await ensure();
    const itens=await db`select id,usuario,pergunta,resposta,correcao,status,criado_em,revisado_por,revisado_em
      from pcp_ia_feedback order by criado_em desc limit 100`;
    return NextResponse.json({itens},{headers:{"Cache-Control":"private, no-store"}});
  }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao consultar feedback."},{status:500});}
}
async function unidadePATCH(req:Request){
  try{
    const s=await session();
    if(!s)return NextResponse.json({error:"Não autenticado."},{status:401});
    if(!autorizado(s.perfil))return NextResponse.json({error:"Sem permissão."},{status:403});
    const b=await req.json(),id=String(b.id||""),status=String(b.status||"");
    if(!/^[0-9a-f-]{36}$/i.test(id)||!["ANALISADO","DESCARTADO","APROVADO"].includes(status))
      return NextResponse.json({error:"ID ou estado inválido."},{status:400});
    const db=await ensure();
    let conhecimentoId:string|null=null;
    if(status==="APROVADO"){
      const [feedback]=await db`select * from pcp_ia_feedback where id=${id}::uuid and status='PENDENTE'`;
      if(!feedback)return NextResponse.json({error:"Correção não encontrada ou já revisada."},{status:409});
      // Só é promovido a conhecimento após a confirmação expressa de um revisor autorizado.
      await db`create table if not exists pcp_ia_conhecimento(
        id uuid primary key default gen_random_uuid(), titulo varchar(180) not null,
        area varchar(60) not null default 'GERAL', situacao text not null default '',
        regra text not null, exemplo text not null default '', observacao text not null default '',
        ativo boolean not null default true, prioridade int not null default 50,
        criado_por varchar(120) not null default '',
        criado_em timestamptz not null default now(), atualizado_em timestamptz not null default now()
      )`;
      await db`alter table pcp_ia_conhecimento add column if not exists fonte_feedback_id uuid`;
      await db`create unique index if not exists ux_pcp_ia_conhecimento_feedback on pcp_ia_conhecimento(fonte_feedback_id)`;
      const titulo=("Correção validada: "+String(feedback.pergunta)).slice(0,180);
      const [aprendizado]=await db`insert into pcp_ia_conhecimento(titulo,area,situacao,regra,exemplo,observacao,ativo,prioridade,criado_por,fonte_feedback_id)
        values(${titulo},'GERAL',${String(feedback.pergunta)},${String(feedback.correcao)},'',
          ${"Revisado por "+s.usuario+"; origem: feedback "+id},true,60,${s.usuario},${id}::uuid)
        on conflict(fonte_feedback_id) do update set atualizado_em=now() returning id`;
      conhecimentoId=String(aprendizado.id);
    }
    const [item]=await db`update pcp_ia_feedback set status=${status},revisado_por=${s.usuario},revisado_em=now(),
      conhecimento_id=${conhecimentoId}::uuid where id=${id}::uuid and status='PENDENTE'
      returning id,status,conhecimento_id`;
    if(!item)return NextResponse.json({error:"Correção não encontrada ou já analisada."},{status:409});
    return NextResponse.json({ok:true,item,mensagem:status==="APROVADO"?"Correção aprovada e incluída na Base de Conhecimento da Sobral IA.":"Revisão registrada."});
  }catch(e:any){return NextResponse.json({error:e?.message||"Erro ao revisar feedback."},{status:500});}
}

export const POST = unidadeHandler(unidadePOST);
export const GET = unidadeHandler(unidadeGET);
export const PATCH = unidadeHandler(unidadePATCH);
