import {NextResponse} from 'next/server';
import {unidadeHandler} from '@/lib/unidades/handler';
import {requireRoles} from '@/lib/auth';
import {sql} from '@/lib/db';
import {ofEntrada} from '@/lib/engenharia';
import {MRP_QUERY} from '@/lib/mrp-query';
export const runtime='nodejs';
function falha(e:unknown){const m=e instanceof Error?e.message:'';return NextResponse.json({error:m==='SEM_PERMISSAO'?'Sem permissão.':/does not exist/.test(m)?'Aplique a migração de OF neste ambiente.':m||'Falha na OF.'},{status:m==='SEM_PERMISSAO'?403:/does not exist/.test(m)?503:409});}
export const GET=unidadeHandler(async(req:Request)=>{try{
 await requireRoles(['PCP','GERENTE','ENCARREGADO']);const db=sql();const q=new URL(req.url).searchParams;const page=Number(q.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});
 if(q.get('visao')==='mrp'){
 const rows=await db.query(MRP_QUERY,[(page-1)*50]);
 return NextResponse.json({rows,page,aviso:'MRP consultivo: reservas, compras, consumo e entrada de acabados continuam exigindo movimentação explícita.'},{headers:{'Cache-Control':'no-store'}});
 }
 const [rows,total,estruturas]=await Promise.all([
 db`select o.*,p.codigo,p.descricao,(select count(*)::int from pcp_operacoes op where op.produto_id=o.origem_produto_id and op.status='CONCLUIDA') operacoes_concluidas,(select count(*)::int from pcp_operacoes op where op.produto_id=o.origem_produto_id) operacoes_totais from erp_ordens_fabricacao o join est_produtos p on p.id=o.produto_estoque_id order by o.numero desc limit 50 offset ${(page-1)*50}`,
 db`select count(*)::int total from erp_ordens_fabricacao`,
 db`select e.id,p.codigo,e.versao from erp_estruturas e join est_produtos p on p.id=e.produto_id where e.status='APROVADA' order by p.codigo,e.versao desc limit 500`]);
 return NextResponse.json({rows,total:total[0].total,page,estruturas},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return falha(e);}});
export const POST=unidadeHandler(async(req:Request)=>{try{
 const s=await requireRoles(['PCP','GERENTE']);const parsed=ofEntrada.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join(' ')},{status:400});const b=parsed.data,db=sql();
 const [r]=b.acao==='CRIAR'?await db`select erp_criar_of(${b.origemId}::uuid,${b.estruturaId}::uuid,${b.prazo}::date,${s.usuario}) id`:await db`select erp_transicionar_of(${b.id}::uuid,${b.acao},${s.usuario}) id`;
 return NextResponse.json({ok:true,id:r.id});
 }catch(e){return falha(e);}});
