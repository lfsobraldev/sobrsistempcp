import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

export async function GET(){
  try{
    await requireRoles(["PCP","GERENTE","ENCARREGADO"]);
    const rows=await sql()`
      select id,filtro,to_char(data_programacao,'DD/MM/YYYY') data,turno,status,origem,criado_em,encerrado_em,
             import_linhas,import_pedidos,import_ofs,import_pecas,import_operacoes
      from pcp_programacoes order by criado_em desc limit 50
    `;
    return NextResponse.json({itens:rows},{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){
    const status=e?.message==="SEM_PERMISSAO"?403:500;
    return NextResponse.json({error:status===403?"Sem permissão.":e.message},{status});
  }
}
