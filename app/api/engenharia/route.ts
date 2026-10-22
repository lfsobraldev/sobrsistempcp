import {NextResponse} from 'next/server';
import {unidadeHandler} from '@/lib/unidades/handler';
import {requireRoles} from '@/lib/auth';
import {sql} from '@/lib/db';
import {gravarEngenhariaCiclo} from '@/lib/ciclo-industrial';
import {consultarEngenhariaCiclo} from '@/lib/ciclo-consultas';
import {engenhariaEntrada} from '@/lib/engenharia';
export const runtime='nodejs';
function falha(e:unknown){const m=e instanceof Error?e.message:'';return NextResponse.json({error:m==='SEM_PERMISSAO'?'Sem permissão.':/does not exist|aguardando migração/.test(m)?'Módulo aguardando migração':m||'Falha na engenharia.'},{status:m==='SEM_PERMISSAO'?403:/does not exist|aguardando migração/.test(m)?503:409});}
export const GET=unidadeHandler(async(req:Request)=>{try{
 await requireRoles(new URL(req.url).searchParams.get('visao')==='ciclo'?['PCP','GERENTE','ENCARREGADO','LIDER','APONTADOR']:['PCP','GERENTE','ENCARREGADO']);const db=sql();const u=new URL(req.url);const page=Number(u.searchParams.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});const busca=(u.searchParams.get('q')||'').slice(0,100);if(u.searchParams.get('visao')==='ciclo')return NextResponse.json(await consultarEngenhariaCiclo(db,page),{headers:{'Cache-Control':'no-store'}});
 const [produtos,estruturas,total,totalEstruturas]=await Promise.all([
 db`select id,codigo,descricao,unidade_base,classificacao from est_produtos where ativo and (codigo ilike ${'%'+busca+'%'} or descricao ilike ${'%'+busca+'%'}) order by codigo limit 50 offset ${(page-1)*50}`,
 db`select e.id,e.produto_id,e.versao,e.status,p.codigo,p.descricao,e.criado_em from erp_estruturas e join est_produtos p on p.id=e.produto_id where p.codigo ilike ${'%'+busca+'%'} or p.descricao ilike ${'%'+busca+'%'} order by e.criado_em desc limit 50 offset ${(page-1)*50}`,
 db`select count(*)::int total from est_produtos where ativo and (codigo ilike ${'%'+busca+'%'} or descricao ilike ${'%'+busca+'%'})`,
 db`select count(*)::int total from erp_estruturas e join est_produtos p on p.id=e.produto_id where p.codigo ilike ${'%'+busca+'%'} or p.descricao ilike ${'%'+busca+'%'}`]);
 return NextResponse.json({produtos,estruturas,total:Math.max(total[0].total,totalEstruturas[0].total),page},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return falha(e);}});
export const POST=unidadeHandler(async(req:Request)=>{try{
 const s=await requireRoles(['PCP','GERENTE']);const entrada=await req.json();if(String(entrada.acao||'').startsWith('CICLO_'))return NextResponse.json({ok:true,rows:await gravarEngenhariaCiclo(sql(),entrada,s.usuario)});const parsed=engenhariaEntrada.safeParse(entrada);if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(x=>x.message).join(' ')},{status:400});const b=parsed.data,db=sql();
 if(b.acao==='CLASSIFICAR'){
 const rows=await db`with antigo as(select * from est_produtos where id=${b.produtoId}::uuid for update),novo as(update est_produtos set classificacao=${b.classificacao},atualizado_em=now() where id in(select id from antigo) returning *)
 insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,antes,depois) select ${s.usuario},'CLASSIFICAR_PRODUTO','EST_PRODUTO',n.id::text,to_jsonb(a),to_jsonb(n) from novo n join antigo a on a.id=n.id returning entidade_id`;
 if(!rows.length)return NextResponse.json({error:'Produto não encontrado.'},{status:404});return NextResponse.json({ok:true});
 }
 const [r]=b.acao==='CRIAR_ESTRUTURA'?await db`select erp_criar_estrutura(${b.produtoId}::uuid,${JSON.stringify(b.itens)}::jsonb,${b.requestId}::uuid,${s.usuario}) id`:await db`select erp_aprovar_estrutura(${b.id}::uuid,${s.usuario}) id`;
 return NextResponse.json({ok:true,id:r.id});
 }catch(e){return falha(e);}});
