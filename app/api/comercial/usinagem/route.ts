import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const roles=["PCP","GERENTE","ENCARREGADO","COMERCIAL"] as const;
async function dbReady(){
 const db=sql();
 await db`create table if not exists pcp_comercial_especificacoes(
 id uuid primary key default gen_random_uuid(),
 pedido varchar(80) not null references pcp_controle_entregas(pedido) on delete restrict,
 item varchar(50) not null,
 familia varchar(40) not null, descricao varchar(400) not null,
 tipo_porta varchar(90) not null default '',material varchar(90) not null default '',
 comprimento_mm numeric(12,2),largura_mm numeric(12,2),espessura_mm numeric(12,2),
 quantidade integer not null check(quantidade>0),
 lado varchar(30) not null default '',rebaixo varchar(60) not null default '',
 tipo_usinagem varchar(160) not null default '',fechadura varchar(160) not null default '',
 dobradica varchar(160) not null default '',contratesta varchar(160) not null default '',
 batente varchar(200) not null default '',alizar varchar(200) not null default '',
 acabamento varchar(160) not null default '',cor varchar(160) not null default '',
 observacao text not null default '',status varchar(20) not null default 'RASCUNHO',
 usuario varchar(100) not null default '',atualizado_em timestamptz not null default now(),
 criado_em timestamptz not null default now(),unique(pedido,item)
 )`;
 return db;
}
export async function GET(req:Request){
 try{await requireRoles(["PCP","GERENTE","ENCARREGADO","COMERCIAL"]);const db=await dbReady();
 const pedido=new URL(req.url).searchParams.get("pedido")||"";
 const itens=pedido?await db`select * from pcp_comercial_especificacoes where pedido=${pedido} order by item`:
 await db`select * from pcp_comercial_especificacoes order by atualizado_em desc limit 1000`;
 return NextResponse.json({itens},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Erro ao consultar especificações"},{status:403})}
}
export async function PUT(req:Request){
 try{const user=await requireRoles(["PCP","GERENTE","ENCARREGADO","COMERCIAL"]);const b=await req.json();
 const pedido=String(b.pedido||"").trim(),item=String(b.item||"").trim().slice(0,50);
 const familia=String(b.familia||"").toUpperCase(),descricao=String(b.descricao||"").trim().slice(0,400);
 const quantidade=Number(b.quantidade);
 if(!/^\d{4,10}$/.test(pedido)||!item||!descricao||!["PORTA","BATENTE","TRAVESSA BATENTE","ALIZAR","TRAVESSA ALIZAR","KIT CORRER","BAGUETE","FERRAGEM","OUTROS"].includes(familia)||!Number.isSafeInteger(quantidade)||quantidade<=0||quantidade>1000000)
 return NextResponse.json({error:"Informe pedido, item, família, descrição e quantidade válidos."},{status:400});
 const dimension=(v:any)=>v===null||v===undefined||v===""?null:Number(v);
 const c=dimension(b.comprimento_mm),l=dimension(b.largura_mm),e=dimension(b.espessura_mm);
 if([c,l,e].some(x=>x!==null&&(!Number.isFinite(x)||x<=0||x>100000)))return NextResponse.json({error:"Medidas em milímetros inválidas"},{status:400});
 const texto=(s:string,n=160)=>String(b[s]||"").trim().slice(0,n);
 const tipo=texto("tipo_porta",90),material=texto("material",90),lado=texto("lado",30),rebaixo=texto("rebaixo",60),
 usinagem=texto("tipo_usinagem"),fechadura=texto("fechadura"),dobradica=texto("dobradica"),
 contratesta=texto("contratesta"),batente=texto("batente",200),alizar=texto("alizar",200),
 acabamento=texto("acabamento"),cor=texto("cor"),obs=texto("observacao",3000);
 const status=String(b.status||"RASCUNHO").toUpperCase();
 if(!["RASCUNHO","EM_REVISAO","APROVADO"].includes(status))return NextResponse.json({error:"Status inválido"},{status:400});
 const db=await dbReady();
 if(!(await db`select pedido from pcp_controle_entregas where pedido=${pedido}`).length)return NextResponse.json({error:"Cadastre o pedido no Comercial antes de incluir especificações."},{status:404});
 const [anterior]=await db`select * from pcp_comercial_especificacoes where pedido=${pedido} and item=${item}`;
 await db`insert into pcp_comercial_especificacoes(pedido,item,familia,descricao,tipo_porta,material,comprimento_mm,largura_mm,espessura_mm,quantidade,lado,rebaixo,tipo_usinagem,fechadura,dobradica,contratesta,batente,alizar,acabamento,cor,observacao,status,usuario)
 values(${pedido},${item},${familia},${descricao},${tipo},${material},${c},${l},${e},${quantidade},${lado},${rebaixo},${usinagem},${fechadura},${dobradica},${contratesta},${batente},${alizar},${acabamento},${cor},${obs},${status},${user.usuario})
 on conflict(pedido,item) do update set familia=excluded.familia,descricao=excluded.descricao,tipo_porta=excluded.tipo_porta,material=excluded.material,comprimento_mm=excluded.comprimento_mm,largura_mm=excluded.largura_mm,espessura_mm=excluded.espessura_mm,quantidade=excluded.quantidade,lado=excluded.lado,rebaixo=excluded.rebaixo,tipo_usinagem=excluded.tipo_usinagem,fechadura=excluded.fechadura,dobradica=excluded.dobradica,contratesta=excluded.contratesta,batente=excluded.batente,alizar=excluded.alizar,acabamento=excluded.acabamento,cor=excluded.cor,observacao=excluded.observacao,status=excluded.status,usuario=excluded.usuario,atualizado_em=now()`;
 await db`insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
 values(${pedido},'ESPECIFICACAO_COMERCIAL',${JSON.stringify(anterior||{})}::jsonb,${JSON.stringify({item,familia,descricao,quantidade,status})}::jsonb,${user.usuario})`;
 return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e?.message||"Erro ao salvar especificação"},{status:500})}
}