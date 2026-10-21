import { unidadeHandler } from "@/lib/unidades/handler";
import {NextResponse} from "next/server";
import {multiAtiva} from "@/lib/unidades/core";
import {unidadeAtual} from "@/lib/unidades/context";
import {sql,identitySql} from "@/lib/db";
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
 if(multiAtiva()){
  const central=identitySql();const unidade=unidadeAtual();
  const rows=await central`select a.etapa from pcp_lider_unidade_etapas a join pcp_usuarios u on u.id=a.usuario_id where u.usuario=${usuario} and u.ativo and u.perfil='LIDER_ENTREGAS' and a.unidade=${unidade}`;
  return rows.map(r=>String(r.etapa));
 }
 const rows=await db`select a.etapa from pcp_lider_etapa_acessos a join pcp_usuarios u on lower(u.usuario)=lower(a.usuario) where lower(a.usuario)=lower(${usuario}) and u.ativo=true and u.perfil='LIDER_ENTREGAS'`;
 return rows.map(x=>String(x.etapa));
}
async function unidadeGET(req:Request){
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
async function unidadePOST(req:Request){
 try{
  const u=await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]),b=await req.json();
  const programacaoId=String(b.programacaoId||"").trim(),rows=Array.isArray(b.rows)?b.rows:[];
  if(!programacaoId||!rows.length)return NextResponse.json({error:"Selecione uma programação e envie linhas válidas."},{status:400});
  if(rows.length>10000)return NextResponse.json({error:"A planilha excede o limite de 10.000 linhas por importação."},{status:413});
  const db=await ensure();
  const allowed=u.perfil==="LIDER_ENTREGAS"?await permitidas(db,u.usuario):AREAS.PRODUCAO;
  let atualizados=0,ignorados=0;
  const allowedSet=new Set(allowed);
  for(const item of rows){
   const pedido=String(item?.pedido||"").trim(),etapa=String(item?.etapa||"").toUpperCase();
   const date=(v:any)=>{if(!v)return null;const t=String(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return undefined;const d=new Date(t+"T12:00:00Z");return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==t?undefined:t};
   const inicio=date(item?.dataInicio),fim=date(item?.dataConclusao);
   if(!/^\d{4,10}$/.test(pedido)||!AREAS.PRODUCAO.includes(etapa)||!allowedSet.has(etapa)||inicio===undefined||fim===undefined||(inicio&&fim&&fim<inicio)||(!inicio&&!fim)){ignorados++;continue;}
   const origem=await db`select pedido from pcp_produtos where pedido=${pedido} and programacao_id=${programacaoId} limit 1`;
   if(!origem.length){ignorados++;continue;}
   const existeEntrega=await db`select pedido from pcp_controle_entregas where pedido=${pedido} limit 1`;
   if(!existeEntrega.length)await db`insert into pcp_controle_entregas(pedido) values(${pedido}) on conflict do nothing`;
   const prevRows=await db`select * from pcp_controle_entregas_etapas where pedido=${pedido} and programacao_id=${programacaoId} and area='PRODUCAO' and etapa=${etapa} limit 1`;
   const prev=prevRows[0]||null;
   // Importação não sobrescreve datas já lançadas pelo líder: preenche somente campos vazios.
   const result=await db`insert into pcp_controle_entregas_etapas(programacao_id,pedido,area,etapa,data_inicio,data_conclusao,status,observacao,usuario)
    values(${programacaoId},${pedido},'PRODUCAO',${etapa},${inicio}::date,${fim}::date,case when ${fim}::date is not null then 'CONCLUIDA' when ${inicio}::date is not null then 'EM_ANDAMENTO' else 'PENDENTE' end,'',${u.usuario})
    on conflict(programacao_id,pedido,area,etapa) do update set
     data_inicio=coalesce(pcp_controle_entregas_etapas.data_inicio,excluded.data_inicio),
     data_conclusao=coalesce(pcp_controle_entregas_etapas.data_conclusao,excluded.data_conclusao),
     status=case when coalesce(pcp_controle_entregas_etapas.data_conclusao,excluded.data_conclusao) is not null then 'CONCLUIDA' when coalesce(pcp_controle_entregas_etapas.data_inicio,excluded.data_inicio) is not null then 'EM_ANDAMENTO' else pcp_controle_entregas_etapas.status end,
     atualizado_em=now(),usuario=${u.usuario}
    where (pcp_controle_entregas_etapas.data_inicio is null and excluded.data_inicio is not null)
       or (pcp_controle_entregas_etapas.data_conclusao is null and excluded.data_conclusao is not null)
    returning pedido`;
   if(result.length){
    const after=await db`select data_inicio::text as data_inicio,data_conclusao::text as data_conclusao,status from pcp_controle_entregas_etapas where pedido=${pedido} and programacao_id=${programacaoId} and area='PRODUCAO' and etapa=${etapa} limit 1`;
    await db`insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario) values(${pedido},'IMPORTACAO_DATAS',${JSON.stringify(prev||{})}::jsonb,${JSON.stringify({area:'PRODUCAO',etapa,...(after[0]||{})})}::jsonb,${u.usuario})`;
    atualizados++;
   }else{ignorados++;}
  }
  return NextResponse.json({ok:true,atualizados,ignorados});
 }catch(e:any){return NextResponse.json({error:e?.message||"Falha ao importar datas"},{status:e?.message==="SEM_PERMISSAO"?403:500})}
}
async function unidadePUT(req:Request){
 try{
 const u=await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER_ENTREGAS"]),b=await req.json();
 const pedido=String(b.pedido||"").trim(),area=String(b.area||"").toUpperCase(),etapa=String(b.etapa||"").toUpperCase();
 const requestedProgramacaoId=String(b.programacaoId||"").trim();
 const date=(v:any)=>{if(!v)return null;const t=String(v);if(!/^\d{4}-\d{2}-\d{2}$/.test(t))return undefined;const d=new Date(t+"T12:00:00Z");return Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==t?undefined:t};
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

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
export const PUT = unidadeHandler(unidadePUT);
