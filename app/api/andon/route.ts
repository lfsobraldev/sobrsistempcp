import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles, session } from "@/lib/auth";

export async function GET(){
  try{
    if(!await session())return NextResponse.json({error:"Não autenticado."},{status:401});
    const rows=await sql()`
      select a.*,p.pedido,p.of,p.categoria
      from pcp_andon a
      left join pcp_operacoes o on o.id=a.operacao_id
      left join pcp_produtos p on p.id=o.produto_id
      where a.status='ABERTO'
      order by a.criado_em desc
    `;
    return NextResponse.json({itens:rows},{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){return NextResponse.json({error:e.message},{status:500})}
}

export async function POST(req:Request){
  try{
    const s=await requireRoles(["PCP","ENCARREGADO","LIDER","APONTADOR"]);
    const b=await req.json();
    await sql()`insert into pcp_andon(operacao_id,processo,motivo,observacao,status,usuario_abertura) values(${b.operacaoId},${b.processo},${b.motivo},${b.observacao||""},'ABERTO',${s.usuario})`;
    return NextResponse.json({ok:true});
  }catch(e:any){const status=e?.message==="SEM_PERMISSAO"?403:500;return NextResponse.json({error:status===403?"Sem permissão.":e.message},{status})}
}

export async function PATCH(req:Request){
  try{
    const s=await requireRoles(["PCP","ENCARREGADO"]);
    const b=await req.json(),id=String(b.id||""),db=sql();
    const [old]=await db`select * from pcp_andon where id=${id}`;
    if(!old)return NextResponse.json({error:"Andon não encontrado."},{status:404});
    await db`update pcp_andon set status='RESOLVIDO',resolvido_em=now() where id=${id}`;
    await db`insert into pcp_eventos(operacao_id,usuario,tipo,descricao,processo,antes,depois) values(${old.operacao_id},${s.usuario},'ANDON_RESOLVIDO','Andon resolvido',${old.processo},${JSON.stringify(old)}::jsonb,${JSON.stringify({...old,status:'RESOLVIDO'})}::jsonb)`;
    return NextResponse.json({ok:true});
  }catch(e:any){const status=e?.message==="SEM_PERMISSAO"?403:500;return NextResponse.json({error:status===403?"Sem permissão.":e.message},{status})}
}
