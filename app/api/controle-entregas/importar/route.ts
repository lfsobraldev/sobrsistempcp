import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
import {lerControleEntregas} from "@/lib/gestao-entregas-import";
export const runtime="nodejs";
const AREAS:Record<string,string[]>={
 PRODUCAO_SUL:["LIBERACAO","APONTAMENTO_SUL","DISPONIVEL_EXPEDICAO","CARREGAMENTO_SUL","SAIDA_SUL","CHEGADA_NORDESTE"],
 PRODUCAO:["PREPARACAO","COLAGEM_PORTAS","ESQUADRIAS_BORDAS","RECOBRIDORA_PERFIL","USINAGEM_2","LUSTRACAO","CNC","USINAGEM","PLASTIFICADORA","PLASTIFICADORA_PORTAS","EMBALAGEM","EXPEDICAO"],
 MONTAGEM:["FINALIZACAO","TRANSPORTE_REDESPACHO","INICIO_MONTAGEM","FIM_MONTAGEM"],
 LOGISTICA:["DISPONIVEL_EXPEDICAO","FATURAMENTO","CARREGAMENTO","SAIDA_EXPEDICAO","ENTREGA_CLIENTE"],
};
async function getFile(data:FormData){
 const file=data.get("arquivo"),urlText=String(data.get("url")||"").trim();
 if(file instanceof File&&file.size>0){
  if(!file.name.toLowerCase().endsWith(".xlsx")||file.size>12_000_000)throw new Error("Selecione um Excel .xlsx com até 12 MB.");
  return {bytes:Buffer.from(await file.arrayBuffer()),name:file.name};
 }
 if(!urlText)throw new Error("Selecione um arquivo Excel ou informe o link da planilha Google.");
 let url:URL;
 try{url=new URL(urlText)}catch{throw new Error("O link informado não é válido.");}
 if(url.protocol!=="https:"||url.hostname!=="docs.google.com"||!url.pathname.startsWith("/spreadsheets/d/"))throw new Error("Por segurança, o link precisa ser uma planilha do Google Sheets (docs.google.com/spreadsheets/d/...).");
 const id=url.pathname.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
 if(!id)throw new Error("Não consegui identificar o código da planilha Google.");
 const exportUrl=`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx`;
 const response=await fetch(exportUrl,{redirect:"follow",cache:"no-store",signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw new Error(response.status===401||response.status===403?"A planilha Google está restrita. Libere acesso de leitura para o sistema ou use o arquivo Excel.":"O Google Sheets não permitiu exportar a planilha. Confira o acesso e tente novamente.");
 const bytes=Buffer.from(await response.arrayBuffer());
 if(bytes.length<100||bytes.length>12_000_000)throw new Error("A exportação não retornou um Excel válido ou excede 12 MB. Verifique se o link está acessível.");
 if(bytes.subarray(0,2).toString()!=="PK")throw new Error("O Google não retornou um arquivo XLSX. A planilha pode exigir login ou autorização de acesso.");
 return {bytes,name:"Google Sheets "+id+".xlsx"};
}
export async function POST(req:Request){
 try{
  const user=await requireRoles(["PCP","GERENTE"]);
  const data=await req.formData(),aplicar=data.get("aplicar")==="true";
  const {bytes,name}=await getFile(data);
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  const {itens,datasEtapas,linhasPorAba}=await lerControleEntregas(bytes);
  if(!itens.length&&!datasEtapas.length)return NextResponse.json({error:"Não encontrei pedidos ou datas reconhecíveis na planilha."},{status:422});
  const summary={arquivo:name,totalNaPlanilha:itens.length,linhasPorAba,correspondentes:itens.length,foraDaProgramacao:0,amostra:itens.slice(0,12).map(x=>({pedido:x.pedido,cliente:x.cliente})),datasDetectadas:datasEtapas.length,atualizados:0,datasAtualizadas:0,datasIgnoradas:0};
  if(!aplicar)return NextResponse.json({previa:true,...summary});
  const db=sql();
  await db`create table if not exists pcp_controle_entregas_importacoes(
    hash varchar(64) primary key,arquivo varchar(200) not null,pedidos integer not null,
    usuario varchar(100) not null,criado_em timestamptz not null default now()
  )`;
  const [registrada]=await db`select hash from pcp_controle_entregas_importacoes where hash=${hash}`;
  if(registrada)return NextResponse.json({ok:true,repetido:true,...summary});
  let atualizados=0,datasAtualizadas=0,datasIgnoradas=0;
  if(itens.length){
   const json=JSON.stringify(itens);
   const [count]=await db`with importados as(
    select * from jsonb_to_recordset(${json}::jsonb) as x(
      pedido text,cliente text,representante text,tipo_pedido text,colecao text,
      status_ferragens text,uf text,cidade text,tipo_frete text,
      origem_unidade text,destino_unidade text,pedido_sul text,
      local_montagem text,transportadora text,volume_m3 numeric,peso_kg numeric
    )
   ),ins as(
    insert into pcp_controle_entregas as t(
      pedido,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,
      origem_unidade,destino_unidade,pedido_sul,local_montagem,transportadora,volume_m3,peso_kg
    )
    select pedido,coalesce(cliente,''),coalesce(representante,''),coalesce(tipo_pedido,''),
      coalesce(colecao,''),coalesce(status_ferragens,''),coalesce(uf,''),coalesce(cidade,''),
      coalesce(tipo_frete,''),coalesce(origem_unidade,''),coalesce(destino_unidade,''),
      coalesce(pedido_sul,''),coalesce(local_montagem,''),coalesce(transportadora,''),volume_m3,peso_kg from importados
    on conflict(pedido) do update set
      cliente=coalesce(nullif(t.cliente,''),excluded.cliente),
      representante=coalesce(nullif(t.representante,''),excluded.representante),
      tipo_pedido=coalesce(nullif(t.tipo_pedido,''),excluded.tipo_pedido),
      colecao=coalesce(nullif(t.colecao,''),excluded.colecao),
      status_ferragens=coalesce(nullif(t.status_ferragens,''),excluded.status_ferragens),
      uf=coalesce(nullif(t.uf,''),excluded.uf),cidade=coalesce(nullif(t.cidade,''),excluded.cidade),
      tipo_frete=coalesce(nullif(t.tipo_frete,''),excluded.tipo_frete),
      origem_unidade=coalesce(nullif(t.origem_unidade,''),excluded.origem_unidade),
      destino_unidade=coalesce(nullif(t.destino_unidade,''),excluded.destino_unidade),
      pedido_sul=coalesce(nullif(t.pedido_sul,''),excluded.pedido_sul),
      local_montagem=coalesce(nullif(t.local_montagem,''),excluded.local_montagem),
      transportadora=coalesce(nullif(t.transportadora,''),excluded.transportadora),
      volume_m3=coalesce(t.volume_m3,excluded.volume_m3),peso_kg=coalesce(t.peso_kg,excluded.peso_kg)
    returning pedido
   )select count(*)::int as total from ins`;
   atualizados=Number(count?.total||0);
  }
  const requestedProgramacaoId=String(data.get("programacaoId")||"").trim();
  let programacaoId=requestedProgramacaoId;
  if(programacaoId){
   const found=await db`select id from pcp_programacoes where id=${programacaoId} limit 1`;
   if(!found.length)throw new Error("A programação selecionada não existe. Atualize a tela e tente novamente.");
  }else{
   const [active]=await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
   programacaoId=String(active?.id||"");
  }
  if(datasEtapas.length){
   await db`create table if not exists pcp_controle_entregas_etapas(
    pedido varchar(80) not null references pcp_controle_entregas(pedido) on delete restrict,
    area varchar(40) not null,etapa varchar(50) not null,data_inicio date,data_conclusao date,
    status varchar(24) not null default 'PENDENTE',observacao text not null default '',
    usuario varchar(100) not null default '',atualizado_em timestamptz not null default now(),
    primary key(pedido,area,etapa)
   )`;
   await db`alter table pcp_controle_entregas_etapas add column if not exists programacao_id uuid references pcp_programacoes(id) on delete cascade`;
   await db`update pcp_controle_entregas_etapas e set programacao_id=(select p.programacao_id from pcp_produtos p join pcp_programacoes pg on pg.id=p.programacao_id where p.pedido=e.pedido order by pg.criado_em desc,pg.id desc limit 1) where e.programacao_id is null and exists(select 1 from pcp_produtos p where p.pedido=e.pedido)`;
   await db`alter table pcp_controle_entregas_etapas drop constraint if exists pcp_controle_entregas_etapas_pkey`;
   await db`create unique index if not exists ux_pcp_etapas_programacao_pedido_area on pcp_controle_entregas_etapas(programacao_id,pedido,area,etapa)`;
  }
  if(datasEtapas.length&&!programacaoId)datasIgnoradas=datasEtapas.length;
  if(datasEtapas.length&&programacaoId){
   for(const item of datasEtapas){
    const pedido=String(item.pedido||"").trim(),area=String(item.area||"").toUpperCase(),etapa=String(item.etapa||"").toUpperCase();
    const inicio=item.dataInicio||null,fim=item.dataConclusao||null;
    if(!/^\d{4,10}$/.test(pedido)||!AREAS[area]?.includes(etapa)||(!inicio&&!fim)|| (inicio&&!/^\d{4}-\d{2}-\d{2}$/.test(inicio))||(fim&&!/^\d{4}-\d{2}-\d{2}$/.test(fim))||(inicio&&fim&&fim<inicio)){datasIgnoradas++;continue;}
    const [exists]=await db`select pedido from pcp_produtos where pedido=${pedido} and programacao_id=${programacaoId} limit 1`;
    if(!exists){datasIgnoradas++;continue;}
    await db`insert into pcp_controle_entregas(pedido) values(${pedido}) on conflict(pedido) do nothing`;
    const result=await db`insert into pcp_controle_entregas_etapas(programacao_id,pedido,area,etapa,data_inicio,data_conclusao,status,observacao,usuario)
     values(${programacaoId},${pedido},${area},${etapa},${inicio}::date,${fim}::date,case when ${fim}::date is not null then 'CONCLUIDA' when ${inicio}::date is not null then 'EM_ANDAMENTO' else 'PENDENTE' end,'',${user.usuario})
     on conflict(programacao_id,pedido,area,etapa) do update set
      data_inicio=coalesce(pcp_controle_entregas_etapas.data_inicio,excluded.data_inicio),
      data_conclusao=coalesce(pcp_controle_entregas_etapas.data_conclusao,excluded.data_conclusao),
      status=case when coalesce(pcp_controle_entregas_etapas.data_conclusao,excluded.data_conclusao) is not null then 'CONCLUIDA' when coalesce(pcp_controle_entregas_etapas.data_inicio,excluded.data_inicio) is not null then 'EM_ANDAMENTO' else pcp_controle_entregas_etapas.status end,
      atualizado_em=now(),usuario=${user.usuario}
     where (pcp_controle_entregas_etapas.data_inicio is null and excluded.data_inicio is not null)
        or (pcp_controle_entregas_etapas.data_conclusao is null and excluded.data_conclusao is not null)
     returning pedido`;
    if(result.length)datasAtualizadas++;else datasIgnoradas++;
   }
  }
  await db`insert into pcp_controle_entregas_importacoes(hash,arquivo,pedidos,usuario) values(${hash},${name.slice(0,200)},${itens.length},${user.usuario}) on conflict do nothing`;
  return NextResponse.json({ok:true,...summary,atualizados,datasAtualizadas,datasIgnoradas});
 }catch(e:any){return NextResponse.json({error:e?.message==="SEM_PERMISSAO"?"Sem permissão":e?.message||"Falha ao importar"},{status:e?.message==="SEM_PERMISSAO"?403:500})}
}
