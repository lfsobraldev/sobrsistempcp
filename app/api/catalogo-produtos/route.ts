import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { requireRoles } from "@/lib/auth";
import { sql } from "@/lib/db";
import { ensureCatalogo, consolidarCatalogo } from "@/lib/catalogo-consistem";
export const runtime="nodejs";
export const maxDuration=300;
export async function GET() {
  try {
    await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
    const db=sql();
    await ensureCatalogo(db);
    const [r]=await db`select id,total,conflitos,ativo_em from pcp_catalogo_versoes where status='ATIVA' order by ativo_em desc limit 1`;
    return NextResponse.json({ativo:r || null},{headers:{"Cache-Control":"no-store"}});
  } catch(e:any) {return NextResponse.json({error:e?.message||"Falha no catálogo"},{status:500});}
}
export async function POST(req:Request) {
  try {
    await requireRoles(["PCP"]);
    const fd=await req.formData();
    const file=fd.get("arquivo");
    if(!(file instanceof File) || !/\\.xlsx?$/i.test(file.name)) return NextResponse.json({error:"Envie a planilha XLSX/XLS com Código e Narrativa."},{status:400});
    if(file.size>25*1024*1024) return NextResponse.json({error:"Planilha acima do limite de 25 MB."},{status:413});
    const workbook=XLSX.read(Buffer.from(await file.arrayBuffer()),{type:"buffer",cellDates:false});
    const sheet=workbook.Sheets[workbook.SheetNames[0]];
    if(!sheet) return NextResponse.json({error:"Planilha sem aba de produtos."},{status:400});
    const raw=XLSX.utils.sheet_to_json<(string|number)[]>(sheet,{header:1,defval:"",raw:false});
    const headers=(raw[0]||[]).map(v=>String(v).trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase());
    const indexCodigo=headers.indexOf("CODIGO"), indexNarrativa=headers.indexOf("NARRATIVA");
    if(indexCodigo<0 || indexNarrativa<0) return NextResponse.json({error:"Cabeçalhos Código e Narrativa não identificados na primeira linha."},{status:400});
    const itens=consolidarCatalogo(raw.slice(1).map(x=>({codigo:String(x[indexCodigo]??""),narrativa:String(x[indexNarrativa]??"")})));
    if(!itens.length) return NextResponse.json({error:"Nenhum código encontrado."},{status:400});
    const db=sql();
    await ensureCatalogo(db);
    const versao=crypto.randomUUID();
    await db`insert into pcp_catalogo_versoes(id,status) values(${versao}::uuid,'PREPARANDO')`;
    // A versão anterior continua ativa mesmo quando o upload ou processamento falha.
    for(let i=0;i<itens.length;i+=1500) {
      const batch=JSON.stringify(itens.slice(i,i+1500));
      await db`insert into pcp_catalogo_produtos(versao,codigo,narrativa,conflito,vazio,variantes)
        select ${versao}::uuid,x.codigo,x.narrativa,x.conflito,x.vazio,x.variantes
        from jsonb_to_recordset(${batch}::jsonb)
        as x(codigo text,narrativa text,conflito boolean,vazio boolean,variantes jsonb)`;
    }
    const conflicts=itens.filter(x=>x.conflito).length;
    // A ativação só ocorre depois de gravar integralmente a nova versão.
    await db`update pcp_catalogo_versoes set status='SUBSTITUIDA' where status='ATIVA'`;
    await db`update pcp_catalogo_versoes set status='ATIVA',ativo_em=now(),total=${itens.length},conflitos=${conflicts} where id=${versao}::uuid`;
    return NextResponse.json({ok:true,total:itens.length,conflitos:conflicts,semNarrativa:itens.filter(x=>x.vazio).length});
  } catch(e:any) {
    return NextResponse.json({error:e?.message||"Falha ao cadastrar catálogo."},{status:e?.message==="SEM_PERMISSAO"?403:500});
  }
}
