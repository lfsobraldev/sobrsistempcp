import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const AREAS:Record<string,string[]>={
 PRODUCAO_SUL:["LIBERACAO","APONTAMENTO_SUL","DISPONIVEL_EXPEDICAO","CARREGAMENTO_SUL","SAIDA_SUL","CHEGADA_NORDESTE"],
 PRODUCAO:["PREPARACAO","COLAGEM_PORTAS","ESQUADRIAS_BORDAS","RECOBRIDORA_PERFIL","USINAGEM_2","LUSTRACAO","CNC","USINAGEM","PLASTIFICADORA","EMBALAGEM","EXPEDICAO"],
 MONTAGEM:["FINALIZACAO","TRANSPORTE_REDESPACHO","INICIO_MONTAGEM","FIM_MONTAGEM"],
 LOGISTICA:["DISPONIVEL_EXPEDICAO","FATURAMENTO","CARREGAMENTO","SAIDA_EXPEDICAO","ENTREGA_CLIENTE"],
};
async function ensure(){
 const db=sql();await db`create table if not exists pcp_controle_entregas_etapas(
   pedido varchar(80) not null references pcp_controle_entregas(pedido) on delete restrict,
   area varchar(40) not null, etapa varchar(50) not null, data_inicio date,
   data_conclusao date,status varchar(24) not null default 'PENDENTE',
   observacao text not null default '', usuario varchar(100) not null default '',
   atualizado_em timestamptz not null default now(),
   primary key(pedido,area,etapa)
 )`;
 await db`create table if not exists pcp_lider_etapa_acessos(usuario varchar(100) not null, etapa varchar(50) not null, primary key(usuario,etapa))`;
 return db;
}
async function permitidas(db:ReturnType<typeof sql>,usuario:string){
 const rows=await db`select etapa from pcp_lider_etapa_acessos where lower(usuario)=lower(${usuario})`;
 return rows.map(x=>String(x.etapa));
}
export async function GET(req:Request){
 try{
  await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]);
  const user=await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]);
  const db=await ensure(),pedido=new URL(req.url).searchParams.get("pedido")||"";
  const etapas=pedido?await db`select *,data_inicio::text as data_inicio,data_conclusao::text as data_conclusao from pcp_controle_entregas_etapas where pedido=${pedido} order by area,etapa`:
   await db`select *,data_inicio::text as data_inicio,data_conclusao::text as data_conclusao from pcp_controle_entregas_etapas order by atualizado_em desc limit 1500`;
  return NextResponse.json({etapas,permitidas:user.perfil==="LIDER_ENTREGAS"?await permitidas(db,user.usuario):AREAS.PRODUCAO},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha nas etapas"},{status:403})}
}
export async function PUT(req:Request){
 try{
 const u=await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]),b=await req.json();
 const pedido=String(b.pedido||"").trim(),area=String(b.area||"").toUpperCase(),etapa=String(b.etapa||"").toUpperCase();
 const date=(v:any)=>!v?null:/^\d{4}-\d{2}-\d{2}$/.test(String(v))?String(v):undefined;
 const inicio=date(b.dataInicio),fim=date(b.dataConclusao),status=String(b.status||"PENDENTE").toUpperCase(),observacao=String(b.observacao||"").slice(0,2000);
 if(!/^\d{4,10}$/.test(pedido)||!AREAS[area]?.includes(etapa)||!["PENDENTE","EM_ANDAMENTO","CONCLUIDA","BLOQUEADA","NAO_APLICAVEL"].includes(status)||inicio===undefined||fim===undefined||(inicio&&fim&&fim<inicio))
 return NextResponse.json({error:"Dados inválidos. Verifique pedido, etapa, situação e datas."},{status:400});
 const db=await ensure();
 if(u.perfil==="LIDER_ENTREGAS"){
  const allowed=await permitidas(db,u.usuario);
  if(area!=="PRODUCAO"||!allowed.includes(etapa))
   return NextResponse.json({error:"Você pode alterar somente as datas do seu setor."},{status:403});
 }
 const existe=await db`select pedido from pcp_controle_entregas where pedido=${pedido} limit 1`;
 if(!existe.length)return NextResponse.json({error:"Pedido não encontrado. Cadastre primeiro."},{status:404});
 const [prev]=await db`select * from pcp_controle_entregas_etapas where pedido=${pedido} and area=${area} and etapa=${etapa}`;
 if(u.perfil==="LIDER_ENTREGAS"&&prev){
   const oldStart=prev.data_inicio?new Date(prev.data_inicio).toISOString().slice(0,10):null;
   const oldEnd=prev.data_conclusao?new Date(prev.data_conclusao).toISOString().slice(0,10):null;
   if((oldStart&&inicio!==oldStart)||(oldEnd&&fim!==oldEnd))
    return NextResponse.json({error:"Datas já registradas não podem ser alteradas pelo líder. Solicite correção ao gerente."},{status:403});
 }
 await db`insert into pcp_controle_entregas_etapas(pedido,area,etapa,data_inicio,data_conclusao,status,observacao,usuario)
 values(${pedido},${area},${etapa},${inicio}::date,${fim}::date,${status},${observacao},${u.usuario})
 on conflict(pedido,area,etapa) do update set data_inicio=excluded.data_inicio,data_conclusao=excluded.data_conclusao,status=excluded.status,observacao=excluded.observacao,usuario=excluded.usuario,atualizado_em=now()`;
 await db`insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
 values(${pedido},'ETAPA_ATUALIZADA',${JSON.stringify(prev||{})}::jsonb,${JSON.stringify({area,etapa,inicio,fim,status,observacao})}::jsonb,${u.usuario})`;
 return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao registrar etapa"},{status:500})}
}
