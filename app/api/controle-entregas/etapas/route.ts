import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const AREAS:Record<string,string[]>={
 PRODUCAO_SUL:["LIBERACAO","APONTAMENTO_SUL","DISPONIVEL_EXPEDICAO","CARREGAMENTO_SUL","SAIDA_SUL","CHEGADA_NORDESTE"],
 PRODUCAO:["PREPARACAO","COLAGEM_PORTAS","ESQUADRIAS_BORDAS","RECOBRIDORA_PERFIL","USINAGEM_2","LUSTRACAO","CNC","USINAGEM","PLASTIFICADORA","PLASTIFICADORA_PORTAS","EMBALAGEM","EXPEDICAO"],
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

 // Migração não destrutiva: as datas passam a pertencer à programação, não só ao número do pedido.
 await db`alter table pcp_controle_entregas_etapas add column if not exists programacao_id uuid references pcp_programacoes(id) on delete cascade`;
 await db`update pcp_controle_entregas_etapas e
  set programacao_id=(select p.programacao_id from pcp_produtos p
   join pcp_programacoes pg on pg.id=p.programacao_id
   where p.pedido=e.pedido order by pg.criado_em desc,pg.id desc limit 1)
  where e.programacao_id is null and exists(select 1 from pcp_produtos p where p.pedido=e.pedido)`;
 await db`do $$ begin
  if exists(select 1 from pg_constraint where conname='pcp_controle_entregas_etapas_pkey' and conrelid='public.pcp_controle_entregas_etapas'::regclass) then
   alter table pcp_controle_entregas_etapas drop constraint pcp_controle_entregas_etapas_pkey;
  end if;
 end $$`;
 await db`create unique index if not exists ux_pcp_etapas_programacao_pedido_area on pcp_controle_entregas_etapas(programacao_id,pedido,area,etapa)`;

 return db;
}
async function permitidas(db:ReturnType<typeof sql>,usuario:string){
 const rows=await db`select a.etapa from pcp_lider_etapa_acessos a join pcp_usuarios u on lower(u.usuario)=lower(a.usuario) where lower(a.usuario)=lower(${usuario}) and u.ativo=true and u.perfil='LIDER_ENTREGAS'`;
 return rows.map(x=>String(x.etapa));
}
export async function GET(req:Request){
 try{
  const user=await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]);
  const db=await ensure(),params=new URL(req.url).searchParams,pedido=params.get("pedido")||"",programacaoId=params.get("programacaoId")||"";
  let etapas:any[];
  if(pedido && programacaoId){
   etapas=await db`select *,data_inicio::text as data_inicio,data_conclusao::text as data_conclusao from pcp_controle_entregas_etapas where pedido=${pedido} and programacao_id=${programacaoId} order by area,etapa`;
  }else if(pedido){
   etapas=await db`select *,data_inicio::text as data_inicio,data_conclusao::text as data_conclusao from pcp_controle_entregas_etapas where pedido=${pedido} order by area,etapa`;
  }else if(programacaoId){
   // Retorna datas apenas dos pedidos que pertencem ao filtro/programação escolhidos.
   etapas=await db`select e.*,e.data_inicio::text as data_inicio,e.data_conclusao::text as data_conclusao
    from pcp_controle_entregas_etapas e
    where e.programacao_id=${programacaoId} and e.pedido in (select distinct p.pedido from pcp_produtos p where p.programacao_id=${programacaoId})
    order by e.atualizado_em desc`;
  }else{
   etapas=await db`select *,data_inicio::text as data_inicio,data_conclusao::text as data_conclusao from pcp_controle_entregas_etapas order by atualizado_em desc limit 1500`;
  }
  return NextResponse.json({etapas,permitidas:user.perfil==="LIDER_ENTREGAS"?await permitidas(db,user.usuario):AREAS.PRODUCAO},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha nas etapas"},{status:403})}
}
export async function PUT(req:Request){
 try{
 const u=await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]),b=await req.json();
 const pedido=String(b.pedido||"").trim(),area=String(b.area||"").toUpperCase(),etapa=String(b.etapa||"").toUpperCase();
 const requestedProgramacaoId=String(b.programacaoId||"").trim();
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
 let programacaoId=requestedProgramacaoId;
 if(!programacaoId){
  const origem=await db`select p.programacao_id from pcp_produtos p join pcp_programacoes pg on pg.id=p.programacao_id where p.pedido=${pedido} order by pg.criado_em desc,pg.id desc limit 1`;
  programacaoId=String(origem[0]?.programacao_id||"");
 }
 if(!programacaoId)return NextResponse.json({error:"Pedido não encontrado em uma programação do PCP."},{status:404});
 const origem=await db`select pedido from pcp_produtos where pedido=${pedido} and programacao_id=${programacaoId} limit 1`;
 if(!origem.length)return NextResponse.json({error:"Este pedido não pertence ao filtro selecionado."},{status:404});
 const existe=await db`select pedido from pcp_controle_entregas where pedido=${pedido} limit 1`;
 if(!existe.length)await db`insert into pcp_controle_entregas(pedido) values(${pedido}) on conflict do nothing`;
 const [prev]=await db`select * from pcp_controle_entregas_etapas where pedido=${pedido} and programacao_id=${programacaoId} and area=${area} and etapa=${etapa}`;
 await db`insert into pcp_controle_entregas_etapas(programacao_id,pedido,area,etapa,data_inicio,data_conclusao,status,observacao,usuario)
 values(${programacaoId},${pedido},${area},${etapa},${inicio}::date,${fim}::date,${status},${observacao},${u.usuario})
 on conflict(programacao_id,pedido,area,etapa) do update set data_inicio=excluded.data_inicio,data_conclusao=excluded.data_conclusao,status=excluded.status,observacao=excluded.observacao,usuario=excluded.usuario,atualizado_em=now()`;
 await db`insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario)
 values(${pedido},'ETAPA_ATUALIZADA',${JSON.stringify(prev||{})}::jsonb,${JSON.stringify({area,etapa,inicio,fim,status,observacao})}::jsonb,${u.usuario})`;
 return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao registrar etapa"},{status:500})}
}
