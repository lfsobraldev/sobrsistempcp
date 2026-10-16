import {NextResponse} from "next/server";
import crypto from "node:crypto";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
import {lerControleEntregas} from "@/lib/gestao-entregas-import";
export const runtime="nodejs";
export async function POST(req:Request){
 try{
  const user=await requireRoles(["PCP","GERENTE"]);
  const data=await req.formData(),file=data.get("arquivo"),aplicar=data.get("aplicar")==="true";
  if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".xlsx")||file.size<100||file.size>12_000_000)
   return NextResponse.json({error:"Selecione uma planilha .xlsx com até 12 MB."},{status:400});
  const bytes=Buffer.from(await file.arrayBuffer());
  const hash=crypto.createHash("sha256").update(bytes).digest("hex");
  const {itens,linhasPorAba}=await lerControleEntregas(bytes);
  if(!itens.length)return NextResponse.json({error:"Não encontrei pedidos comerciais válidos na planilha."},{status:422});
  const summary={arquivo:file.name,totalNaPlanilha:itens.length,linhasPorAba,correspondentes:itens.length,foraDaProgramacao:0,amostra:itens.slice(0,12)};
  if(!aplicar)return NextResponse.json({previa:true,...summary});
  const db=sql();
  await db`create table if not exists pcp_controle_entregas_importacoes(
    hash varchar(64) primary key,arquivo varchar(200) not null,pedidos integer not null,
    usuario varchar(100) not null,criado_em timestamptz not null default now()
  )`;
  const [registrada]=await db`select hash from pcp_controle_entregas_importacoes where hash=${hash}`;
  if(registrada)return NextResponse.json({ok:true,repetido:true,atualizados:0,...summary});
  // Não alterar dados existentes: migração histórica só preenche campos vazios.
  // Situação operacional e datas são geridas pelo sistema após a migração.
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
      coalesce(pedido_sul,''),coalesce(local_montagem,''),coalesce(transportadora,''),
      volume_m3,peso_kg from importados
    on conflict(pedido) do update set
      cliente=coalesce(nullif(t.cliente,''),excluded.cliente),
      representante=coalesce(nullif(t.representante,''),excluded.representante),
      tipo_pedido=coalesce(nullif(t.tipo_pedido,''),excluded.tipo_pedido),
      colecao=coalesce(nullif(t.colecao,''),excluded.colecao),
      status_ferragens=coalesce(nullif(t.status_ferragens,''),excluded.status_ferragens),
      uf=coalesce(nullif(t.uf,''),excluded.uf),
      cidade=coalesce(nullif(t.cidade,''),excluded.cidade),
      tipo_frete=coalesce(nullif(t.tipo_frete,''),excluded.tipo_frete),
      origem_unidade=coalesce(nullif(t.origem_unidade,''),excluded.origem_unidade),
      destino_unidade=coalesce(nullif(t.destino_unidade,''),excluded.destino_unidade),
      pedido_sul=coalesce(nullif(t.pedido_sul,''),excluded.pedido_sul),
      local_montagem=coalesce(nullif(t.local_montagem,''),excluded.local_montagem),
      transportadora=coalesce(nullif(t.transportadora,''),excluded.transportadora),
      volume_m3=coalesce(t.volume_m3,excluded.volume_m3),
      peso_kg=coalesce(t.peso_kg,excluded.peso_kg)
    returning pedido
  )select count(*)::int as total from ins`;
  await db`insert into pcp_controle_entregas_importacoes(hash,arquivo,pedidos,usuario)
    values(${hash},${file.name.slice(0,200)},${itens.length},${user.usuario})
    on conflict do nothing`;
  return NextResponse.json({ok:true,atualizados:Number(count?.total||0),...summary});
 }catch(e:any){return NextResponse.json({error:e?.message==="SEM_PERMISSAO"?"Sem permissão":e?.message||"Falha ao importar"},{status:e?.message==="SEM_PERMISSAO"?403:500})}
}
