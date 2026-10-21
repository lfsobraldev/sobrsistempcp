import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { parse } from "csv-parse/sync";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";

export const runtime = "nodejs";
const cols: Record<string,string[]> = {
  PREPARACAO:["PREPARACAO"],
  LIXAR:["LIXAR"],
  "USINAGEM-1":["USINAGEM-PORTAS","USINAGEM-TRAVESSAS"],
  RECOBRIDORA:["RECOBRIDORA","RECOBRIDORA-2"],
  "USINAGEM-2":["USINAGEM-CONTRATESTA","USINAGEM-DOBRADICAS","USINAGEM-TUPIA"],
  LUSTRACAO:["LUSTRACAO"],
  TERCEIROS:["TERCEIROS"],
  EMBALAGEM:["EMBALAGEM-PORTAS","EMBALAGEM-1","EMBALAGEM-2","EMBALAGEM-3","EMBALAGEM-4","EMBALAGEM-5","EMBALAGEM-6","EMBALAGEM-7","EMBALAGEM-REVENDA","EMBALAGEM-ENGENHARIA"],
  EXPEDICAO:["EXPEDICAO"],
};
const norm=(s:unknown)=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toUpperCase();
const numero=(s:unknown)=>{const n=Number(String(s??"").replace(/\./g,"").replace(",",".").trim());return Number.isFinite(n)?n:NaN;};
const percentual=(s:unknown)=>{const t=String(s??"").trim();if(!t||norm(t)==="N/A")return null;const n=numero(t);return Number.isFinite(n)&&n>=0&&n<=100?n:null;};
type Linha={pedido:string;of:string;produto:string;pct:number|null;setores:Record<string,number|null>};
async function unidadePOST(req:Request){
  try {
    await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
    const fd=await req.formData();const file=fd.get("arquivo");const aplicar=fd.get("aplicar")==="true";
    if(!(file instanceof File)||file.size>8_000_000)return NextResponse.json({error:"Selecione um CSV válido de até 8 MB."},{status:400});
    const bytes=Buffer.from(await file.arrayBuffer());
    const text=new TextDecoder("windows-1252").decode(bytes);
    const parsed=parse(text,{columns:true,delimiter:";",bom:true,skip_empty_lines:true,relax_column_count:true}) as Record<string,string>[];
    const rows:Linha[]=[];const invalidos:string[]=[];
    for(const [i,raw] of parsed.entries()){
      const p=Object.fromEntries(Object.entries(raw).map(([k,v])=>[norm(k),v]));
      const pedido=String(p.PEDIDO||"").trim(),of=String(p["OF'S"]||p.OF||"").trim(),produto=String(p.PRODUTO||"").trim();
      if(!pedido||!of){if(pedido)invalidos.push("Linha "+(i+2)+": sem OF");continue;}
      const setores:Record<string,number|null>={};
      for(const c of Object.keys(cols))setores[c]=percentual(p[c]);
      rows.push({pedido,of,produto,pct:percentual(p["% CONCLUIDO PRODUTO"]),setores});
    }
    if(!rows.length)return NextResponse.json({error:"Nenhuma OF válida encontrada. Confira se é o CSV da tela Detalhada."},{status:422});
    const db=sql();
    const active=await db`select id from pcp_programacoes where status='ATIVA' order by criado_em desc limit 1`;
    if(!active.length)return NextResponse.json({error:"Não existe programação ativa."},{status:404});
    const id=String(active[0].id);
    const produtos=await db`select id,pedido,of,produto,percentual_produto from pcp_produtos where programacao_id=${id}`;
    const operations=await db`select o.id,o.produto_id,o.processo,o.percentual from pcp_operacoes o join pcp_produtos p on p.id=o.produto_id where p.programacao_id=${id}`;
    const byKey=new Map<string,any[]>();
    for(const p of produtos){const k=[p.pedido,p.of].join("|");byKey.set(k,[...(byKey.get(k)||[]),p]);}
    const byProduct=new Map<string,any[]>();
    for(const o of operations){const k=String(o.produto_id);byProduct.set(k,[...(byProduct.get(k)||[]),o]);}
    const changes:Array<{kind:"produto"|"operacao";id:string;from:number;to:number;processo?:string;of:string}>=[];
    const divergencias:string[]=[...invalidos];let correspondencias=0;
    const seen=new Set<string>();
    for(const row of rows){
      const k=row.pedido+"|"+row.of;
      if(seen.has(k)){divergencias.push("OF repetida no CSV: "+k);continue;}seen.add(k);
      const matches=byKey.get(k)||[];
      const exact=matches.filter(p=>!row.produto||String(p.produto)===row.produto);
      if(exact.length!==1){divergencias.push("OF sem correspondência única: "+k);continue;}
      const p=exact[0];correspondencias++;
      if(row.pct!==null&&Number(p.percentual_produto)!==row.pct)changes.push({kind:"produto",id:String(p.id),from:Number(p.percentual_produto),to:row.pct,of:row.of});
      const ops=byProduct.get(String(p.id))||[];
      for(const [col,targets] of Object.entries(cols)){
        const pct=row.setores[col];if(pct===null)continue;
        const candidates=ops.filter(o=>targets.includes(String(o.processo)));
        // Se o Consistem agrupa vários subprocessos em uma coluna, não inventar distribuição.
        if(candidates.length!==1){if(candidates.length>1)divergencias.push(k+": "+col+" corresponde a múltiplas operações; revisão necessária");continue;}
        const o=candidates[0];
        if(Number(o.percentual)!==pct)changes.push({kind:"operacao",id:String(o.id),from:Number(o.percentual),to:pct,processo:String(o.processo),of:row.of});
      }
    }
    if(!aplicar)return NextResponse.json({previsao:true,linhas:rows.length,correspondencias,alteracoes:changes.length,divergencias:divergencias.slice(0,150),amostra:changes.slice(0,25)});
    // Requer correspondência substancial para impedir aplicação do filtro/mês errado.
    if(correspondencias===0||correspondencias/rows.length<0.75)return NextResponse.json({error:"Correspondência insuficiente com a programação ativa. Não aplicado.",correspondencias,linhas:rows.length,divergencias:divergencias.slice(0,50)},{status:422});
    let feitas=0,ignoradas=0;
    for(const change of changes){
      if(change.kind==="produto"){
        const v=await db`update pcp_produtos set percentual_produto=${change.to} where id=${change.id}::uuid and programacao_id=${id}::uuid and percentual_produto=${change.from} returning id`;
        if(v.length)feitas++;else ignoradas++;
      }else{
        const status=change.to===100?"CONCLUIDA":change.to>0?"EM_ANDAMENTO":"PENDENTE";
        const v=await db`update pcp_operacoes set percentual=${change.to},status=${status},atualizado_em=now() where id=${change.id}::uuid and percentual=${change.from} and produto_id in (select id from pcp_produtos where programacao_id=${id}::uuid) returning id`;
        if(v.length)feitas++;else ignoradas++;
      }
    }
    return NextResponse.json({ok:true,linhas:rows.length,correspondencias,alteracoes:feitas,ignoradas,divergencias:divergencias.slice(0,150)});
  }catch(e:any){return NextResponse.json({error:e?.message==="SEM_PERMISSAO"?"Sem permissão.":e?.message||"Falha ao processar CSV."},{status:e?.message==="SEM_PERMISSAO"?403:500});}
}

export const POST = unidadeHandler(unidadePOST);
