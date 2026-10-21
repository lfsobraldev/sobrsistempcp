import { unidadeHandler } from "@/lib/unidades/handler";
import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const profiles=["PCP","GERENTE","ENCARREGADO"] as const;
async function ensure(){
 const db=sql();
 await db`create table if not exists pcp_controle_entregas_carregamentos(
  id uuid primary key default gen_random_uuid(),
  pedido varchar(80) not null references pcp_controle_entregas(pedido) on delete restrict,
  romaneio varchar(100) not null default '',
  quantidade integer not null check(quantidade>0),
  volume_m3 numeric(16,3) check(volume_m3>=0),
  nota_fiscal varchar(100) not null default '',
  transportadora varchar(160) not null default '',
  data_saida date, data_entrega date,
  status varchar(24) not null default 'PROGRAMADO',
  observacao text not null default '',
  usuario varchar(100) not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
 )`;
 await db`create index if not exists ix_controle_carregamentos_pedido on pcp_controle_entregas_carregamentos(pedido,criado_em desc)`;
 return db;
}
async function unidadeGET(req:Request){
 try{
 // Leitura liberada também a Comercial e Logística (já enxergam os mesmos pedidos); gravação continua restrita.
 await requireRoles(["PCP","GERENTE","ENCARREGADO","COMERCIAL","LOGISTICA"]);
 const db=await ensure();
 const pedido=new URL(req.url).searchParams.get("pedido")||"";
 const cargas=pedido?await db`select *,data_saida::text as data_saida,data_entrega::text as data_entrega from pcp_controle_entregas_carregamentos where pedido=${pedido} order by criado_em desc`
  :await db`select *,data_saida::text as data_saida,data_entrega::text as data_entrega from pcp_controle_entregas_carregamentos order by criado_em desc limit 500`;
 return NextResponse.json({cargas},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message==="SEM_PERMISSAO"?"Sem permissão":e?.message||"Falha ao listar carregamentos"},{status:e?.message==="SEM_PERMISSAO"?403:500})}
}
async function unidadePOST(req:Request){
 try{
 const user=await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
 const b=await req.json();
 const pedido=String(b.pedido||"").trim(),q=Number(b.quantidade);
 const romaneio=String(b.romaneio||"").trim().slice(0,100);
 const nf=String(b.notaFiscal||"").trim().slice(0,100);
 const transportadora=String(b.transportadora||"").trim().slice(0,160);
 const obs=String(b.observacao||"").trim().slice(0,1000);
 const volume=b.volumeM3===null||b.volumeM3===""||b.volumeM3===undefined?null:Number(b.volumeM3);
 const date=(v:any)=>{const s=String(v||"").trim();return !s?null:/^\d{4}-\d{2}-\d{2}$/.test(s)?s:undefined};
 const saida=date(b.dataSaida),entrega=date(b.dataEntrega);
 const status=String(b.status||"PROGRAMADO").toUpperCase();
 if(!/^\d{4,10}$/.test(pedido)||!Number.isSafeInteger(q)||q<=0||q>10_000_000||
    (volume!==null&&(!Number.isFinite(volume)||volume<0||volume>999999999))||
    saida===undefined||entrega===undefined||!["PROGRAMADO","EM_TRANSITO","ENTREGUE","CANCELADO"].includes(status))
  return NextResponse.json({error:"Confira pedido, quantidade, datas, volume e situação."},{status:400});
 if(status==="ENTREGUE"&&!entrega)return NextResponse.json({error:"Informe a data de entrega para confirmar este carregamento."},{status:400});
 const db=await ensure();
 const existe=await db`select pedido from pcp_controle_entregas where pedido=${pedido}`;
 if(!existe.length)return NextResponse.json({error:"Cadastre o pedido antes de registrar o carregamento."},{status:404});
 const [row]=await db`insert into pcp_controle_entregas_carregamentos(pedido,romaneio,quantidade,volume_m3,nota_fiscal,transportadora,data_saida,data_entrega,status,observacao,usuario)
  values(${pedido},${romaneio},${q},${volume},${nf},${transportadora},${saida}::date,${entrega}::date,${status},${obs},${user.usuario}) returning id`;
 await db`insert into pcp_controle_entregas_eventos(pedido,acao,atual,usuario)
  values(${pedido},'CARREGAMENTO_CRIADO',${JSON.stringify({id:row.id,romaneio,quantidade:q,notaFiscal:nf,status})}::jsonb,${user.usuario})`;
 return NextResponse.json({ok:true,id:row.id});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao cadastrar carregamento"},{status:500})}
}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
