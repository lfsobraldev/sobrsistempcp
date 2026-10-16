import crypto from "node:crypto";
import {lerControleEntregas} from "@/lib/gestao-entregas-import";
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
 await db`alter table pcp_entregas_gestao add column if not exists cliente varchar(240) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists representante varchar(120) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists tipo_pedido varchar(100) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists colecao varchar(150) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists status_ferragens varchar(50) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists uf varchar(2) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists cidade varchar(150) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists tipo_frete varchar(12) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists origem_unidade varchar(35) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists destino_unidade varchar(35) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists pedido_sul varchar(50) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists status_montagem varchar(40) not null default ''`;
 await db`alter table pcp_entregas_gestao add column if not exists data_montagem date`;
 await db`alter table pcp_entregas_gestao add column if not exists previsao_saida date`;
 await db`alter table pcp_entregas_gestao add column if not exists volume_m3 numeric(16,3)`;
 await db`alter table pcp_entregas_gestao add column if not exists peso_kg numeric(16,3)`;
 await db`alter table pcp_entregas_gestao add column if not exists previsao_informada date`;
 await db`create table if not exists pcp_entregas_eventos(
  id uuid primary key default gen_random_uuid(),
  programacao_id uuid not null references pcp_programacoes(id) on delete cascade,
  pedido varchar(80) not null,
  tipo varchar(50) not null,
  dados_antes jsonb,
  dados_depois jsonb,
  usuario varchar(100) not null,
  criado_em timestamptz not null default now()
 )`;
 await db`create index if not exists ix_pcp_entregas_eventos_pedido on pcp_entregas_eventos(programacao_id,pedido,criado_em desc)`;
}
export async function GET(){
 try{
  await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
  const db=sql();await ensure(db);
  const [pg]=await db`select id,filtro from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  if(!pg)return NextResponse.json({pedidos:[],filtro:""},{headers:{"Cache-Control":"no-store"}});
  const produtos=await db`select pedido,count(*)::int linhas,count(distinct nullif(of,''))::int ofs,coalesce(sum(quantidade),0) pecas,coalesce(avg(percentual_produto),0) percentual from pcp_produtos where programacao_id=${pg.id} group by pedido order by pedido`;
  const entregas=await db`select pedido,transportadora,nota_fiscal,data_saida::text,previsao_entrega::text,data_entrega::text,status,local_montagem,observacao,atualizado_em,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,status_montagem,data_montagem::text,previsao_saida::text,volume_m3,peso_kg,previsao_informada::text from pcp_entregas_gestao where programacao_id=${pg.id}`;
  const eventos=await db`select pedido,tipo,usuario,criado_em from pcp_entregas_eventos where programacao_id=${pg.id} order by criado_em desc limit 300`;
  const mapa=new Map(entregas.map((e:any)=>[String(e.pedido),e]));
  return NextResponse.json({filtro:pg.filtro,eventos,pedidos:produtos.map((p:any)=>({...p,pecas:Number(p.pecas),percentual:Number(p.percentual),entrega:mapa.get(String(p.pedido))||null}))},{headers:{"Cache-Control":"no-store"}});
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
  const cliente=String(b.cliente||"").slice(0,240),representante=String(b.representante||"").slice(0,120),
    tipoPedido=String(b.tipoPedido||"").slice(0,100),colecao=String(b.colecao||"").slice(0,150),
    ferragens=String(b.statusFerragens||"").slice(0,50),uf=String(b.uf||"").trim().toUpperCase().slice(0,2),
    cidade=String(b.cidade||"").slice(0,150),frete=String(b.tipoFrete||"").toUpperCase(),
    origem=String(b.origemUnidade||"").toUpperCase(),destino=String(b.destinoUnidade||"").toUpperCase(),
    pedidoSul=String(b.pedidoSul||"").slice(0,50),montagem=String(b.statusMontagem||"").toUpperCase(),
    dataMontagem=dt(b.dataMontagem),previsaoSaida=dt(b.previsaoSaida),previsaoInformada=dt(b.previsaoInformada);
  const volume=b.volumeM3===null||b.volumeM3===""?null:Number(b.volumeM3),
    peso=b.pesoKg===null||b.pesoKg===""?null:Number(b.pesoKg);
  if(!["","CIF","FOB"].includes(frete)||!["","SUL","NORDESTE"].includes(origem)||!["","SUL","NORDESTE"].includes(destino)||!["","PENDENTE","AGUARDANDO","EM_ANDAMENTO","CONCLUIDA","NAO_APLICAVEL"].includes(montagem))return NextResponse.json({error:"Frete, região ou montagem inválidos"},{status:400});
  if([b.dataMontagem,b.previsaoSaida,b.previsaoInformada].some(v=>v&&!dt(v)))return NextResponse.json({error:"Data de montagem, saída ou previsão inválida"},{status:400});
  if([volume,peso].some(v=>v!==null&&(!Number.isFinite(v)||v<0||v>999999999)))return NextResponse.json({error:"Volume ou peso inválidos"},{status:400});

  const db=sql();await ensure(db);
  const [pg]=await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  if(!pg)return NextResponse.json({error:"Programação ativa não encontrada"},{status:404});
  const existe=await db`select id from pcp_produtos where programacao_id=${pg.id} and pedido=${pedido} limit 1`;
  if(!existe.length)return NextResponse.json({error:"Pedido inexistente na programação ativa"},{status:404});
  const [anterior]=await db`select transportadora,nota_fiscal,data_saida::text,previsao_entrega::text,data_entrega::text,status,local_montagem,observacao from pcp_entregas_gestao where programacao_id=${pg.id} and pedido=${pedido}`;
  await db`insert into pcp_entregas_gestao(programacao_id,pedido,transportadora,nota_fiscal,data_saida,previsao_entrega,data_entrega,status,local_montagem,observacao,atualizado_por,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,status_montagem,data_montagem,previsao_saida,volume_m3,peso_kg,previsao_informada)
   values(${pg.id},${pedido},${tr},${nf},${saida}::date,${prev}::date,${entrega}::date,${status},${local},${obs},${user.usuario},${cliente},${representante},${tipoPedido},${colecao},${ferragens},${uf},${cidade},${frete},${origem},${destino},${pedidoSul},${montagem},${dataMontagem}::date,${previsaoSaida}::date,${volume},${peso},${previsaoInformada}::date)
   on conflict(programacao_id,pedido) do update set transportadora=excluded.transportadora,nota_fiscal=excluded.nota_fiscal,data_saida=excluded.data_saida,previsao_entrega=excluded.previsao_entrega,data_entrega=excluded.data_entrega,status=excluded.status,local_montagem=excluded.local_montagem,observacao=excluded.observacao,cliente=excluded.cliente,representante=excluded.representante,tipo_pedido=excluded.tipo_pedido,colecao=excluded.colecao,status_ferragens=excluded.status_ferragens,uf=excluded.uf,cidade=excluded.cidade,tipo_frete=excluded.tipo_frete,origem_unidade=excluded.origem_unidade,destino_unidade=excluded.destino_unidade,pedido_sul=excluded.pedido_sul,status_montagem=excluded.status_montagem,data_montagem=excluded.data_montagem,previsao_saida=excluded.previsao_saida,volume_m3=excluded.volume_m3,peso_kg=excluded.peso_kg,previsao_informada=excluded.previsao_informada,atualizado_por=excluded.atualizado_por,atualizado_em=now()`;
  const depois={transportadora:tr,notaFiscal:nf,dataSaida:saida,previsaoEntrega:prev,dataEntrega:entrega,status,localMontagem:local,observacao:obs,cliente,representante,tipoPedido,colecao,ferragens,uf,cidade,frete,origem,destino,pedidoSul,montagem,dataMontagem,previsaoSaida,volume,peso,previsaoInformada};
  await db`insert into pcp_entregas_eventos(programacao_id,pedido,tipo,dados_antes,dados_depois,usuario) values(${pg.id},${pedido},'ENTREGA_ATUALIZADA',${JSON.stringify(anterior||{})}::jsonb,${JSON.stringify(depois)}::jsonb,${user.usuario})`;
  await publishRealtimeEvent("GESTAO_ATUALIZADA",{pedido,tipo:"ENTREGA"});
  return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e.message==="SEM_PERMISSAO"?"Sem permissão":e.message||"Falha ao salvar"},{status:e.message==="SEM_PERMISSAO"?403:500})}
}

export async function POST(req:Request){
 try{
  const user=await requireRoles(["PCP"]);
  const fd=await req.formData(),file=fd.get("arquivo"),aplicar=fd.get("aplicar")==="true";
  if(!(file instanceof File)||file.size<100||file.size>10_000_000||!file.name.toLowerCase().endsWith(".xlsx"))return NextResponse.json({error:"Informe o Excel .xlsx de Controle de Entregas (máx. 10 MB)."}, {status:400});
  const bytes=Buffer.from(await file.arrayBuffer()),hash=crypto.createHash("sha256").update(bytes).digest("hex");
  const {itens,linhasPorAba}=await lerControleEntregas(bytes);
  if(!itens.length)return NextResponse.json({error:"Não foi possível identificar pedidos nas abas do arquivo."},{status:422});
  const db=sql();await ensure(db);
  const [pg]=await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  if(!pg)return NextResponse.json({error:"Nenhuma programação ativa."},{status:404});
  const ativos=await db`select distinct pedido from pcp_produtos where programacao_id=${pg.id}`;
  const ids=new Set(ativos.map((v:any)=>String(v.pedido)));
  const encontrados=itens.filter(x=>ids.has(x.pedido));
  const ausentes=itens.filter(x=>!ids.has(x.pedido)).map(x=>x.pedido);
  const resumo={arquivo:file.name,linhasPorAba,totalNaPlanilha:itens.length,correspondentes:encontrados.length,foraDaProgramacao:ausentes.length,naoEncontrados:ausentes.slice(0,50),amostra:encontrados.slice(0,10)};
  if(!aplicar)return NextResponse.json({previa:true,...resumo});
  if(!encontrados.length)return NextResponse.json({error:"Nenhum pedido do Excel foi encontrado na programação ativa.",...resumo},{status:422});
  await db`create table if not exists pcp_entregas_importacoes(programacao_id uuid not null references pcp_programacoes(id) on delete cascade,arquivo_sha256 varchar(64) not null,arquivo_nome varchar(200) not null,linhas_lidas int not null,pedidos_encontrados int not null,usuario varchar(100) not null,criado_em timestamptz not null default now(),primary key(programacao_id,arquivo_sha256))`;
  const [previa]=await db`select arquivo_sha256 from pcp_entregas_importacoes where programacao_id=${pg.id} and arquivo_sha256=${hash} limit 1`;
  if(previa)return NextResponse.json({ok:true,repetido:true,atualizados:0,...resumo});
  // Importação histórica: somente completar campos vazios, jamais sobrescrever
  // status, datas ou apontamentos oficiais do PCP com valores antigos do Excel.
  const payload=JSON.stringify(encontrados);
  await db`insert into pcp_entregas_gestao as t(programacao_id,pedido,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,local_montagem,transportadora,volume_m3,peso_kg)
    select ${pg.id}::uuid,x.pedido,coalesce(x.cliente,''),coalesce(x.representante,''),coalesce(x.tipo_pedido,''),coalesce(x.colecao,''),coalesce(x.status_ferragens,''),coalesce(x.uf,''),coalesce(x.cidade,''),coalesce(x.tipo_frete,''),coalesce(x.origem_unidade,''),coalesce(x.destino_unidade,''),coalesce(x.pedido_sul,''),coalesce(x.local_montagem,''),coalesce(x.transportadora,''),x.volume_m3,x.peso_kg
    from jsonb_to_recordset(${payload}::jsonb) as x(pedido text,cliente text,representante text,tipo_pedido text,colecao text,status_ferragens text,uf text,cidade text,tipo_frete text,origem_unidade text,destino_unidade text,pedido_sul text,local_montagem text,transportadora text,volume_m3 numeric,peso_kg numeric)
    on conflict(programacao_id,pedido) do update set
    cliente=coalesce(nullif(trim(t.cliente),''),excluded.cliente),
    representante=coalesce(nullif(trim(t.representante),''),excluded.representante),
    tipo_pedido=coalesce(nullif(trim(t.tipo_pedido),''),excluded.tipo_pedido),
    colecao=coalesce(nullif(trim(t.colecao),''),excluded.colecao),
    status_ferragens=coalesce(nullif(trim(t.status_ferragens),''),excluded.status_ferragens),
    uf=coalesce(nullif(trim(t.uf),''),excluded.uf),
    cidade=coalesce(nullif(trim(t.cidade),''),excluded.cidade),
    tipo_frete=coalesce(nullif(trim(t.tipo_frete),''),excluded.tipo_frete),
    origem_unidade=coalesce(nullif(trim(t.origem_unidade),''),excluded.origem_unidade),
    destino_unidade=coalesce(nullif(trim(t.destino_unidade),''),excluded.destino_unidade),
    pedido_sul=coalesce(nullif(trim(t.pedido_sul),''),excluded.pedido_sul),
    local_montagem=coalesce(nullif(trim(t.local_montagem),''),excluded.local_montagem),
    transportadora=coalesce(nullif(trim(t.transportadora),''),excluded.transportadora),
    volume_m3=coalesce(t.volume_m3,excluded.volume_m3),
    peso_kg=coalesce(t.peso_kg,excluded.peso_kg)
  `;
  await db`insert into pcp_entregas_importacoes(programacao_id,arquivo_sha256,arquivo_nome,linhas_lidas,pedidos_encontrados,usuario) values(${pg.id},${hash},${file.name.slice(0,200)},${itens.length},${encontrados.length},${user.usuario}) on conflict do nothing`;
  await publishRealtimeEvent("GESTAO_ATUALIZADA",{tipo:"PLANILHA_IMPORTADA",pedidos:encontrados.length});
  return NextResponse.json({ok:true,atualizados:encontrados.length,...resumo});
 }catch(e:any){return NextResponse.json({error:e.message==="SEM_PERMISSAO"?"Sem permissão":e.message||"Falha ao importar planilha"},{status:e.message==="SEM_PERMISSAO"?403:500})}
}
