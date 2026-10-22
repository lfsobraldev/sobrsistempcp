import {lerFiltrosPCP,recortePCP} from '@/lib/pcp-filters';
import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { requireRoles } from "@/lib/auth";

async function unidadeGET(req:Request){
  try{
    await requireRoles(["PCP","GERENTE","ENCARREGADO","LIDER","LIDER_ENTREGAS"]);
    const params=new URL(req.url).searchParams,incluir=params.get('arquivadas')==='true',page=Number(params.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});
    const db=sql(),f=lerFiltrosPCP(params),r=recortePCP(f);let where=r.sql;
    if(incluir)where=where.replace("and not coalesce((to_jsonb(g)->>'arquivada')::boolean,false)",'');
    const rows=await db.query(`select g.id,g.filtro,to_char(g.data_programacao,'DD/MM/YYYY') data,g.turno,g.status,g.origem,g.criado_em,g.encerrado_em,coalesce((to_jsonb(g)->>'arquivada')::boolean,false) arquivada,g.import_linhas,g.import_pedidos,g.import_ofs,g.import_pecas,g.import_operacoes,count(*) over()::int total from pcp_programacoes g where exists(select 1 from pcp_produtos p where p.programacao_id=g.id and ${where}) order by g.criado_em desc,g.id limit $${r.values.length+1} offset $${r.values.length+2}`,[...r.values,50,(page-1)*50]);
    return NextResponse.json({itens:rows,total:Number(rows[0]?.total||0),page},{headers:{"Cache-Control":"no-store"}});
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
