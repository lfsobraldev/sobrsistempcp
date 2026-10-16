import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
import {publishRealtimeEvent} from "@/lib/realtime-server";
export const runtime="nodejs";
const roles=["PCP","GERENTE","ENCARREGADO"] as const;
async function ensure(db:ReturnType<typeof sql>){
 await db`create table if not exists pcp_entregas_gestao(
  programacao_id uuid not null references pcp_programacoes(id) on delete cascade,
  pedido varchar(80) not null,
  transportadora varchar(160) not null default '',
  nota_fiscal varchar(100) not null default '',
  data_saida date,
  previsao_entrega date,
  data_entrega date,
  status varchar(25) not null default 'PLANEJADO',
  local_montagem varchar(100) not null default '',
  observacao text not null default '',
  atualizado_por varchar(100) not null default '',
  atualizado_em timestamptz not null default now(),
  primary key(programacao_id,pedido)
 )`;
}
export async function GET(){
 try{
  await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
  const db=sql();await ensure(db);
  const [pg]=await db`select id,filtro from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  if(!pg)return NextResponse.json({pedidos:[],filtro:""},{headers:{"Cache-Control":"no-store"}});
  const produtos=await db`select pedido,count(*)::int linhas,count(distinct nullif(of,''))::int ofs,coalesce(sum(quantidade),0) pecas,coalesce(avg(percentual_produto),0) percentual from pcp_produtos where programacao_id=${pg.id} group by pedido order by pedido`;
  const entregas=await db`select pedido,transportadora,nota_fiscal,data_saida::text,previsao_entrega::text,data_entrega::text,status,local_montagem,observacao,atualizado_em from pcp_entregas_gestao where programacao_id=${pg.id}`;
  const mapa=new Map(entregas.map((e:any)=>[String(e.pedido),e]));
  return NextResponse.json({filtro:pg.filtro,pedidos:produtos.map((p:any)=>({...p,pecas:Number(p.pecas),percentual:Number(p.percentual),entrega:mapa.get(String(p.pedido))||null}))},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e.message==="SEM_PERMISSAO"?"Sem permissão":e.message||"Falha ao carregar"},{status:e.message==="SEM_PERMISSAO"?403:500})}
}
export async function PATCH(req:Request){
 try{
  const user=await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
  const b=await req.json(),pedido=String(b.pedido||"").trim();
  const status=String(b.status||"PLANEJADO").toUpperCase();
  if(!pedido||pedido.length>80||!["PLANEJADO","EM_PRODUCAO","AGUARDANDO_MONTAGEM","PRONTO_EXPEDICAO","EM_TRANSITO","ENTREGA_PARCIAL","ENTREGUE","PENDENCIA"].includes(status))return NextResponse.json({error:"Pedido ou situação inválida"},{status:400});
  const dt=(v:any)=>{const s=String(v||"").trim();return s&&/^\d{4}-\d\d-\d\d$/.test(s)?s:null};
  const saida=dt(b.dataSaida),prev=dt(b.previsaoEntrega),entrega=dt(b.dataEntrega);
  if([b.dataSaida,b.previsaoEntrega,b.dataEntrega].some(v=>v&&!dt(v)))return NextResponse.json({error:"Datas inválidas. Use YYYY-MM-DD"},{status:400});
  const tr=String(b.transportadora||"").slice(0,160),nf=String(b.notaFiscal||"").slice(0,100),local=String(b.localMontagem||"").slice(0,100),obs=String(b.observacao||"").slice(0,3000);
  const db=sql();await ensure(db);
  const [pg]=await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  if(!pg)return NextResponse.json({error:"Programação ativa não encontrada"},{status:404});
  const existe=await db`select id from pcp_produtos where programacao_id=${pg.id} and pedido=${pedido} limit 1`;
  if(!existe.length)return NextResponse.json({error:"Pedido inexistente na programação ativa"},{status:404});
  await db`insert into pcp_entregas_gestao(programacao_id,pedido,transportadora,nota_fiscal,data_saida,previsao_entrega,data_entrega,status,local_montagem,observacao,atualizado_por)
   values(${pg.id},${pedido},${tr},${nf},${saida}::date,${prev}::date,${entrega}::date,${status},${local},${obs},${user.usuario})
   on conflict(programacao_id,pedido) do update set transportadora=excluded.transportadora,nota_fiscal=excluded.nota_fiscal,data_saida=excluded.data_saida,previsao_entrega=excluded.previsao_entrega,data_entrega=excluded.data_entrega,status=excluded.status,local_montagem=excluded.local_montagem,observacao=excluded.observacao,atualizado_por=excluded.atualizado_por,atualizado_em=now()`;
  await publishRealtimeEvent("GESTAO_ATUALIZADA",{pedido,tipo:"ENTREGA"});
  return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e.message==="SEM_PERMISSAO"?"Sem permissão":e.message||"Falha ao salvar"},{status:e.message==="SEM_PERMISSAO"?403:500})}
}
