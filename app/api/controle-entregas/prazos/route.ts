import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
async function tabela(){
 const db=sql();
 await db`create table if not exists pcp_prazos_entrega(
  id bigserial primary key,uf varchar(2) not null,cidade varchar(160) not null,
  faixa_ate_10 integer not null,faixa_10_20 integer not null,faixa_acima_20 integer not null,
  responsavel varchar(100) not null default '',atualizado_em timestamptz not null default now(),
  unique(uf,cidade)
 )`;
 return db;
}
export async function GET(){
 try{await requireRoles(["PCP","GERENTE","ENCARREGADO"]);const db=await tabela();
 const regras=await db`select id,uf,cidade,faixa_ate_10,faixa_10_20,faixa_acima_20 from pcp_prazos_entrega order by uf,cidade`;
 return NextResponse.json({regras},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao consultar"},{status:403})}
}
export async function PUT(req:Request){
 try{const user=await requireRoles(["PCP","GERENTE"]);const b=await req.json();
 const uf=String(b.uf||"").trim().toUpperCase(),cidade=String(b.cidade||"").trim().toUpperCase().slice(0,160);
 const n=[b.ate10,b.de10a20,b.acima20].map(Number);
 if(!/^[A-Z]{2}$/.test(uf)||!cidade||n.some(x=>!Number.isInteger(x)||x<0||x>365))
 return NextResponse.json({error:"Informe UF, cidade e três prazos válidos em dias."},{status:400});
 const db=await tabela();
 await db`insert into pcp_prazos_entrega(uf,cidade,faixa_ate_10,faixa_10_20,faixa_acima_20,responsavel)
 values(${uf},${cidade},${n[0]},${n[1]},${n[2]},${user.usuario})
 on conflict(uf,cidade) do update set faixa_ate_10=excluded.faixa_ate_10,faixa_10_20=excluded.faixa_10_20,faixa_acima_20=excluded.faixa_acima_20,responsavel=excluded.responsavel,atualizado_em=now()`;
 return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao salvar"},{status:403})}
}
