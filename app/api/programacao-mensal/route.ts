import { unidadeHandler } from "@/lib/unidades/handler";
import { NextResponse } from "next/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { acessoMensal, consultarMensal, selecionarFiliais } from "@/lib/programacao-mensal-service";
import { unidadeSchema, mesSchema, previaMensal, csvSeguro } from "@/lib/programacao-mensal";
export const runtime = "nodejs";
export const maxDuration = 60;
function erro(e: unknown) {
  console.error('[PROGRAMACAO_MENSAL]',e);
  const msg = e instanceof Error ? e.message : "Falha na programação mensal";
  const status = msg==='SEM_PERMISSAO'?403:e instanceof z.ZodError?400:/relation .* does not exist/.test(msg)?503:400;
  return NextResponse.json({error:status===403?'Sem permissão para esta unidade.':status===503?'Programação mensal ainda não instalada. Aplique a fundação e a migração 03 no ambiente correto. Nenhum dado foi alterado.':msg},{status,headers:{'Cache-Control':'no-store'}});
}
async function unidadeGET(req: Request) {
 try {
  if(new URL(req.url).searchParams.get("acao")==="escopos") {
   const {filiais}=await acessoMensal();
   return NextResponse.json({filiais},{headers:{"Cache-Control":"no-store"}});
  }
  const {q,rows,resumo,mensal,opcoes,lotes,pagina,porPagina,podeImportar,sessao,db} = await consultarMensal(req);
  if(q.formato) {
   if(rows.length>10000) return NextResponse.json({error:'Exportação limitada a 10.000 linhas. Refine os filtros.'},{status:422});
   await db`insert into pcp_auditoria_global(ator,acao,entidade,depois) values(${sessao.usuario},'EXPORTAR','PROGRAMACAO_MENSAL',${JSON.stringify({unidade:q.unidade,mes:q.mes,linhas:rows.length,formato:q.formato})}::jsonb)`;
   const dados = rows.map(r=>({Unidade:r.unidade,Competencia:String(r.competencia).slice(0,7),Filtro:r.filtro,Pedido:r.pedido,Item:r.item,Produto:r.produto,Descricao:r.descricao,Quantidade:Number(r.quantidade),Data:r.data,Origem:r.origem}));
   if(q.formato==='csv') {
    const csv='\uFEFF'+[Object.keys(dados[0]??{Unidade:''}).map(csvSeguro).join(';'),...dados.map(r=>Object.values(r).map(csvSeguro).join(';'))].join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="programacao.csv"','Cache-Control':'no-store'}});
   }
   const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(dados),'Programacao');
   return new Response(new Uint8Array(XLSX.write(wb,{type:'buffer',bookType:'xlsx'})),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':'attachment; filename="programacao.xlsx"','Cache-Control':'no-store'}});
  }
  return NextResponse.json({rows,resumo,mensal,opcoes,lotes,pagina,porPagina,podeImportar},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return erro(e);}
}
async function unidadePOST(req: Request) {
 try {
  // Validação e autorização antes de carregar/interpretar o arquivo.
  if(Number(req.headers.get('content-length')||0)>5*1024*1024) throw new Error('Arquivo excede o limite de 4 MB.');
  const {sessao,db,filiais}=await acessoMensal(true);
  const fd=await req.formData();
  const unidade=unidadeSchema.parse(fd.get('unidade'));
  const ids=selecionarFiliais(filiais,unidade);
  const filialId=z.string().uuid().parse(fd.get('filialId'));
  if(!ids.includes(filialId)) throw new Error('SEM_PERMISSAO');
  const acao=z.enum(['PREVIA','CONFIRMAR','DESFAZER']).parse(fd.get('acao'));
  if(acao==='DESFAZER') {
   const id=z.string().uuid().parse(fd.get('id'));
   const [l]=await db`select filial_id from pcp_programacao_lotes where id=${id}::uuid`;
   if(!l || String(l.filial_id)!==filialId) throw new Error('SEM_PERMISSAO');
   const [r]=await db`select pcp_desfazer_mensal(${id}::uuid,${sessao.usuario}) as resultado`;
   return NextResponse.json(r.resultado);
  }
  const mes=mesSchema.parse(fd.get('mes'));
  const modo=z.enum(['ACRESCENTAR','SUBSTITUIR']).parse(fd.get('modo'));
  const file=fd.get('arquivo'); if(!(file instanceof File)) throw new Error('Selecione CSV ou XLSX.');
  const previa=await previaMensal(file,mes);
  if(acao==='PREVIA') return NextResponse.json({...previa,linhas:previa.linhas.slice(0,100),erros:previa.erros.slice(0,100),avisos:previa.avisos.slice(0,100),totalErros:previa.erros.length,totalAvisos:previa.avisos.length});
  if(previa.erros.length) return NextResponse.json({error:'Corrija os erros antes de confirmar.',erros:previa.erros.slice(0,100)},{status:422});
  if(fd.get('hash')!==previa.hash) throw new Error('Refaça a prévia; o arquivo mudou.');
  const [r]=await db`select pcp_importar_mensal(${filialId}::uuid,${mes+'-01'}::date,${file.name.slice(0,240)},${previa.hash},${sessao.usuario},${modo},${JSON.stringify(previa.linhas)}::jsonb) as resultado`;
  return NextResponse.json(r.resultado);
 }catch(e){return erro(e);}
}
export async function OPTIONS() {return new Response(null,{headers:{Allow:'GET, POST, OPTIONS'}});}

export const GET = unidadeHandler(unidadeGET);
export const POST = unidadeHandler(unidadePOST);
