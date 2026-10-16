import {NextResponse} from "next/server";
import {sql} from "@/lib/db";
import {requireRoles} from "@/lib/auth";
export const runtime="nodejs";
const ALLOWED=["PLANEJADO","EM_PRODUCAO","AGUARDANDO_MONTAGEM","PRONTO_EXPEDICAO","EM_TRANSITO","ENTREGA_PARCIAL","ENTREGUE","PENDENCIA"];
const DATE_FIELDS=["data_saida","previsao_entrega","data_entrega","data_montagem","previsao_saida","previsao_informada"] as const;
const TEXT_FIELDS=["cliente","representante","tipo_pedido","colecao","status_ferragens","uf","cidade","tipo_frete","origem_unidade","destino_unidade","pedido_sul","local_montagem","status_montagem","transportadora","nota_fiscal","observacao"] as const;
async function ensure(db:ReturnType<typeof sql>){
 await db`create table if not exists pcp_controle_entregas(
  pedido varchar(80) primary key,
  cliente varchar(240) not null default '', representante varchar(120) not null default '',
  tipo_pedido varchar(100) not null default '', colecao varchar(150) not null default '',
  status_ferragens varchar(50) not null default '',uf varchar(2) not null default '',
  cidade varchar(150) not null default '',tipo_frete varchar(12) not null default '',
  origem_unidade varchar(35) not null default '',destino_unidade varchar(35) not null default '',
  pedido_sul varchar(50) not null default '',local_montagem varchar(100) not null default '',
  status_montagem varchar(40) not null default '',data_montagem date,
  previsao_saida date,previsao_informada date,volume_m3 numeric(16,3),peso_kg numeric(16,3),
  transportadora varchar(160) not null default '',nota_fiscal varchar(100) not null default '',
  data_saida date, previsao_entrega date,data_entrega date,
  status varchar(25) not null default 'PLANEJADO',observacao text not null default '',
  atualizado_por varchar(100) not null default '',atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
 )`;
 await db`create table if not exists pcp_controle_entregas_eventos(
  id uuid primary key default gen_random_uuid(),pedido varchar(80) not null references pcp_controle_entregas(pedido),
  acao varchar(40) not null, anterior jsonb, atual jsonb,
  usuario varchar(100) not null,criado_em timestamptz not null default now()
 )`;
 await db`create index if not exists ix_controle_entregas_eventos on pcp_controle_entregas_eventos(pedido,criado_em desc)`;
 // Migração não destrutiva: aproveitar controles já salvos na integração anterior.
 const tabela=await db`select to_regclass('public.pcp_entregas_gestao') as nome`;
 if(tabela[0]?.nome){
   await db`insert into pcp_controle_entregas(pedido,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,local_montagem,status_montagem,data_montagem,previsao_saida,previsao_informada,volume_m3,peso_kg,transportadora,nota_fiscal,data_saida,previsao_entrega,data_entrega,status,observacao)
    select distinct on(pedido) pedido,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,local_montagem,status_montagem,data_montagem,previsao_saida,previsao_informada,volume_m3,peso_kg,transportadora,nota_fiscal,data_saida,previsao_entrega,data_entrega,status,observacao
    from pcp_entregas_gestao order by pedido,atualizado_em desc
    on conflict(pedido) do nothing`;
 }
}
const mapInput=(b:any)=>{
 const data:Record<string,any>={};
 for(const k of TEXT_FIELDS)data[k]=String(b[k]??"").trim().slice(0,k==="observacao"?3000:k==="cliente"?240:160);
 for(const k of DATE_FIELDS){const v=String(b[k]||"").trim();if(v&&!/^\d{4}-\d{2}-\d{2}$/.test(v))throw new Error("Data inválida: "+k);data[k]=v||null;}
 for(const k of ["volume_m3","peso_kg"]){const v=b[k];data[k]=v===""||v===null||v===undefined?null:Number(v);if(data[k]!==null&&(!Number.isFinite(data[k])||data[k]<0||data[k]>999999999))throw new Error("Valor inválido: "+k);}
 data.status=String(b.status||"PLANEJADO").toUpperCase();
 if(!ALLOWED.includes(data.status))throw new Error("Situação inválida");
 if(!["","CIF","FOB"].includes(data.tipo_frete.toUpperCase()))throw new Error("Tipo de frete inválido");
 if(!["","SUL","NORDESTE"].includes(data.origem_unidade.toUpperCase())||!["","SUL","NORDESTE"].includes(data.destino_unidade.toUpperCase()))throw new Error("Unidade inválida");
 return data;
};
export async function GET(){
 try{
  await requireRoles(["PCP","GERENTE","ENCARREGADO","COMERCIAL","LOGISTICA","LIDER_ENTREGAS"]);
  const db=sql();await ensure(db);
  const [active]=await db`select id,filtro from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
  // Para pedidos que reaparecem em filtros diferentes, somente a versão mais
  // recente entra no resumo. Somar todas as programações inflaria peças e OFs.
  const pcp=await db`with versoes as (
      select p.pedido,p.programacao_id,max(pg.criado_em) as criado_em
      from pcp_produtos p join pcp_programacoes pg on pg.id=p.programacao_id
      group by p.pedido,p.programacao_id
    ),mais_recente as (
      select distinct on(pedido) pedido,programacao_id from versoes
      order by pedido,criado_em desc,programacao_id desc
    )
    select p.pedido,count(*)::int linhas,count(distinct nullif(p.of,''))::int ofs,
      coalesce(sum(p.quantidade),0) pecas,coalesce(avg(p.percentual_produto),0) percentual, max(nullif(trim(p.pedido_cliente),'')) as cliente_pcp
    from pcp_produtos p join mais_recente m on m.pedido=p.pedido and m.programacao_id=p.programacao_id
    group by p.pedido`;
  const controls=await db`select *,data_saida::text as data_saida,previsao_entrega::text as previsao_entrega,data_entrega::text as data_entrega,data_montagem::text as data_montagem,previsao_saida::text as previsao_saida,previsao_informada::text as previsao_informada from pcp_controle_entregas order by pedido`;
  const events=await db`select pedido,acao as tipo,usuario,criado_em from pcp_controle_entregas_eventos order by criado_em desc limit 300`;
  const map=new Map(controls.map((x:any)=>[String(x.pedido),x]));
  const orders=new Map<string,any>();
  for(const p of pcp)orders.set(String(p.pedido),{pedido:String(p.pedido),linhas:Number(p.linhas),ofs:Number(p.ofs),pecas:Number(p.pecas),percentual:Number(p.percentual),entrega:map.get(String(p.pedido))||null,clientePcp:String(p.cliente_pcp||'')});
  for(const c of controls)if(!orders.has(String(c.pedido)))orders.set(String(c.pedido),{pedido:String(c.pedido),linhas:0,ofs:0,pecas:0,percentual:0,entrega:c});
  return NextResponse.json({filtro:active?.filtro||"",pedidos:[...orders.values()].sort((a,b)=>a.pedido.localeCompare(b.pedido,"pt-BR",{numeric:true})),eventos:events},{headers:{"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message==="SEM_PERMISSAO"?"Sem permissão":e?.message||"Falha ao consultar"},{status:e?.message==="SEM_PERMISSAO"?403:500})}
}
function userScope(role:string,comercial:string[],logistica:string[]){return role==="COMERCIAL"?comercial:role==="LOGISTICA"?logistica:null;}
export async function PUT(req:Request){
 try{
  const u=await requireRoles(["PCP","GERENTE","ENCARREGADO","COMERCIAL","LOGISTICA"]),b=await req.json();
  const pedido=String(b.pedido||"").trim();
  if(!/^\d{4,10}$/.test(pedido))return NextResponse.json({error:"Informe um número de pedido válido."},{status:400});
  const db=sql();await ensure(db);
  const [prev]=await db`select *,data_saida::text as data_saida,previsao_entrega::text as previsao_entrega,data_entrega::text as data_entrega,data_montagem::text as data_montagem,previsao_saida::text as previsao_saida,previsao_informada::text as previsao_informada from pcp_controle_entregas where pedido=${pedido}`;
  const comercial=["cliente","representante","tipo_pedido","colecao","status_ferragens","uf","cidade","previsao_informada"];
  const logistica=["transportadora","nota_fiscal","tipo_frete","data_saida","previsao_entrega","data_entrega","previsao_saida","peso_kg","volume_m3","status"];
  const limitados=userScope(u.perfil,comercial,logistica);
  if(limitados && Object.keys(b).some(k=>k!=="pedido"&&!limitados.includes(k)))return NextResponse.json({error:"Campo não permitido para seu setor"},{status:403});
  const data=mapInput({...prev,...b});
  // Atualização transacional única: histórico e cadastro na mesma operação SQL.
  const payload=JSON.stringify({...data,pedido});
  await db`with dados as(select * from jsonb_to_record(${payload}::jsonb) as x(
  pedido text,cliente text,representante text,tipo_pedido text,colecao text,status_ferragens text,uf text,cidade text,tipo_frete text,origem_unidade text,destino_unidade text,pedido_sul text,local_montagem text,status_montagem text,data_montagem text,previsao_saida text,previsao_informada text,volume_m3 numeric,peso_kg numeric,transportadora text,nota_fiscal text,data_saida text,previsao_entrega text,data_entrega text,status text,observacao text))
  insert into pcp_controle_entregas(pedido,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,local_montagem,status_montagem,data_montagem,previsao_saida,previsao_informada,volume_m3,peso_kg,transportadora,nota_fiscal,data_saida,previsao_entrega,data_entrega,status,observacao,atualizado_por)
  select pedido,cliente,representante,tipo_pedido,colecao,status_ferragens,uf,cidade,tipo_frete,origem_unidade,destino_unidade,pedido_sul,local_montagem,status_montagem,data_montagem::date,previsao_saida::date,previsao_informada::date,volume_m3,peso_kg,transportadora,nota_fiscal,data_saida::date,previsao_entrega::date,data_entrega::date,status,observacao,${u.usuario} from dados
  on conflict(pedido) do update set
  cliente=excluded.cliente,representante=excluded.representante,tipo_pedido=excluded.tipo_pedido,colecao=excluded.colecao,status_ferragens=excluded.status_ferragens,uf=excluded.uf,cidade=excluded.cidade,tipo_frete=excluded.tipo_frete,origem_unidade=excluded.origem_unidade,destino_unidade=excluded.destino_unidade,pedido_sul=excluded.pedido_sul,local_montagem=excluded.local_montagem,status_montagem=excluded.status_montagem,data_montagem=excluded.data_montagem,previsao_saida=excluded.previsao_saida,previsao_informada=excluded.previsao_informada,volume_m3=excluded.volume_m3,peso_kg=excluded.peso_kg,transportadora=excluded.transportadora,nota_fiscal=excluded.nota_fiscal,data_saida=excluded.data_saida,previsao_entrega=excluded.previsao_entrega,data_entrega=excluded.data_entrega,status=excluded.status,observacao=excluded.observacao,atualizado_por=excluded.atualizado_por,atualizado_em=now()`;
  await db`insert into pcp_controle_entregas_eventos(pedido,acao,anterior,atual,usuario) values(${pedido},${prev?"EDITADO":"CRIADO"},${JSON.stringify(prev||{})}::jsonb,${payload}::jsonb,${u.usuario})`;
  return NextResponse.json({ok:true});
 }catch(e:any){return NextResponse.json({error:e?.message==="SEM_PERMISSAO"?"Sem permissão":e?.message||"Falha ao salvar"},{status:e?.message==="SEM_PERMISSAO"?403:400})}
}
