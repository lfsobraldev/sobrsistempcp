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
    const [r]=await db`select id,total,conflitos,total_linhas,linhas_sem_codigo,ativo_em from pcp_catalogo_versoes where status='ATIVA' order by ativo_em desc limit 1`;
    return NextResponse.json({ativo:r || null},{headers:{"Cache-Control":"no-store"}});
  } catch(e:any) {return NextResponse.json({error:e?.message||"Falha no catálogo"},{status:500});}
}
export async function POST(req:Request) {
  try {
    await requireRoles(["PCP"]);
    const fd=await req.formData();
    const file=fd.get("arquivo");
    if(!(file instanceof File) || !/\.xlsx?$/i.test(file.name)) return NextResponse.json({error:"Envie a planilha XLSX/XLS com Código e Narrativa."},{status:400});
    if(file.size>25*1024*1024) return NextResponse.json({error:"Planilha acima do limite de 25 MB."},{status:413});
    const workbook=XLSX.read(Buffer.from(await file.arrayBuffer()),{type:"buffer",cellDates:false});
    const linhas: {codigo:string;narrativa:string}[]=[];
    let linhasComDados=0,linhasSemCodigo=0;
    const abasLidas:string[]=[];
    for(const nome of workbook.SheetNames){
      const sheet=workbook.Sheets[nome];if(!sheet)continue;
      const raw=XLSX.utils.sheet_to_json<(string|number)[]>(sheet,{header:1,defval:"",raw:false});
      const headerIdx=raw.findIndex(row=>{
        const hdr=row.map(v=>String(v).trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase());
        return hdr.includes("CODIGO")&&hdr.includes("NARRATIVA");
      });
      if(headerIdx<0)continue;
      const headers=raw[headerIdx].map(v=>String(v).trim().normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toUpperCase());
      const codigoIdx=headers.indexOf("CODIGO"), narrativaIdx=headers.indexOf("NARRATIVA");
      abasLidas.push(nome);
      for(const row of raw.slice(headerIdx+1)){
        const codigo=String(row[codigoIdx]??"").trim();
        const narrativa=String(row[narrativaIdx]??"").trim();
        if(!codigo&&!narrativa)continue;
        linhasComDados++;
        if(!codigo){linhasSemCodigo++;continue;}
        linhas.push({codigo,narrativa});
      }
    }
    if(!abasLidas.length)return NextResponse.json({error:"Nenhuma aba com cabeçalhos Código e Narrativa encontrada."},{status:400});
    const itens=consolidarCatalogo(linhas);
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
    await db`update pcp_catalogo_versoes set status='ATIVA',ativo_em=now(),total=${itens.length},conflitos=${conflicts},total_linhas=${linhasComDados},linhas_sem_codigo=${linhasSemCodigo} where id=${versao}::uuid`;
    return NextResponse.json({ok:true,total:itens.length,totalLinhas:linhasComDados,linhasSemCodigo,linhasRepetidas:linhasComDados-linhasSemCodigo-itens.length,abasLidas,conflitos:conflicts,semNarrativa:itens.filter(x=>x.vazio).length});
  } catch(e:any) {
    return NextResponse.json({error:e?.message||"Falha ao cadastrar catálogo."},{status:e?.message==="SEM_PERMISSAO"?403:500});
  }
}
