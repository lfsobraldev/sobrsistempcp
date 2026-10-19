import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

export async function GET(){
  try{
    await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER","LIDER_ENTREGAS"]);
    const rows=await sql()`
      select id,filtro,to_char(data_programacao,'DD/MM/YYYY') data,turno,status,origem,criado_em,encerrado_em,
             import_linhas,import_pedidos,import_ofs,import_pecas,import_operacoes
      from pcp_programacoes order by criado_em desc limit 200
    `;
    return NextResponse.json({itens:rows},{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){
    const status=e?.message==="SEM_PERMISSAO"?403:500;
    return NextResponse.json({error:status===403?"Sem permissão.":e.message},{status});
  }
}


export async function DELETE(){
  try{
    await requireRoles(["PCP"]);
    const db=sql();

    const removidas=await db`
      delete from pcp_programacoes
      where status <> 'ATIVA'
      returning id
    `;

    const eventos=await db`
      delete from pcp_eventos
      returning id
    `;

    return NextResponse.json({
      ok:true,
      programacoes:removidas.length,
      eventos:eventos.length,
      mensagem:"Histórico de programações encerradas e auditoria operacional apagados."
    });
  }catch(e:any){
    const status=e?.message==="SEM_PERMISSAO"?403:500;
    return NextResponse.json(
      {error:status===403?"Sem permissão.":e?.message || "Falha ao apagar histórico."},
      {status}
    );
  }
}
