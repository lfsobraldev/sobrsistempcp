import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

async function unidadeGET(req:Request){
  try{
    await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER","LIDER_ENTREGAS"]);
    const incluir=new URL(req.url).searchParams.get("arquivadas")==="true";
    const rows=await sql()`
      select coalesce((to_jsonb(g)->>'arquivada')::boolean,false) arquivada,id,filtro,to_char(data_programacao,'DD/MM/YYYY') data,turno,status,origem,criado_em,encerrado_em,
             import_linhas,import_pedidos,import_ofs,import_pecas,import_operacoes
      from pcp_programacoes g where (${incluir} or not coalesce((to_jsonb(g)->>'arquivada')::boolean,false)) order by criado_em desc limit 200
    `;
    return NextResponse.json({itens:rows},{headers:{"Cache-Control":"no-store"}});
  }catch(e:any){
    const status=e?.message==="SEM_PERMISSAO"?403:500;
    return NextResponse.json({error:status===403?"Sem permissão.":e.message},{status});
  }
}


async function unidadeDELETE(){
  try{
    await requireRoles(["PCP"]);
    const db=sql();

    const [schema]=await db`select to_regprocedure('pcp_arquivar_historico(text)') as fn`;
    if(!schema?.fn)return NextResponse.json({error:'Módulo aguardando migração',codigo:'MIGRACAO_PENDENTE'},{status:503});
    const s=await requireRoles(['PCP']);
    const [r]=await db`select pcp_arquivar_historico(${s.usuario}) as arquivadas`;
    return NextResponse.json({ok:true,arquivadas:r.arquivadas,mensagem:'Programações arquivadas. Produtos, apontamentos e auditoria foram preservados.'});
  }catch(e:any){
    const status=e?.message==="SEM_PERMISSAO"?403:500;
    return NextResponse.json(
      {error:status===403?"Sem permissão.":e?.message || "Falha ao apagar histórico."},
      {status}
    );
  }
}

export const GET = unidadeHandler(unidadeGET);
export const DELETE = unidadeHandler(unidadeDELETE);
