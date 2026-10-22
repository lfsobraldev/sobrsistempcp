import {idsProdutosRecorte} from '@/lib/pcp-filters';
import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";import { sql } from "@/lib/db";import { requireRoles } from "@/lib/auth";
async function unidadeGET(req:Request){try{await requireRoles(["PCP","GERENTE","ENCARREGADO"]);const db=sql(),q=new URL(req.url).searchParams,ids=q.get('recorte')==='1'?(await idsProdutosRecorte(db,q)).map(p=>String(p.id)):null;const rows=await db`select id,usuario,tipo,descricao,of,processo,antes,depois,criado_em from pcp_eventos where (${ids}::uuid[] is null or operacao_id in(select id from pcp_operacoes where produto_id=any(${ids}::uuid[]))) order by criado_em desc limit 200`;return NextResponse.json({itens:rows},{headers:{"Cache-Control":"no-store"}})}catch(e:any){const s=e?.message==="SEM_PERMISSAO"?403:500;return NextResponse.json({error:s===403?"Sem permissão.":e.message},{status:s})}}

export const GET = unidadeHandler(unidadeGET);
