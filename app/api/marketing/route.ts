import {NextResponse} from 'next/server';
import {unidadeHandler} from '@/lib/unidades/handler';
import {requireRoles} from '@/lib/auth';
import {sql} from '@/lib/db';
import {marketingEntrada} from '@/lib/marketing';
export const runtime='nodejs';
const falha=(e:unknown)=>{const m=e instanceof Error?e.message:'';return NextResponse.json({error:m==='SEM_PERMISSAO'?'Sem permissão.':/does not exist/.test(m)?'Aplique a migração de marketing neste ambiente.':m||'Falha no marketing.'},{status:m==='SEM_PERMISSAO'?403:/does not exist/.test(m)?503:409});};
export const GET=unidadeHandler(async(req:Request)=>{try{
 await requireRoles(['PCP','GERENTE','COMERCIAL']);const db=sql(),params=new URL(req.url).searchParams;const page=Number(params.get('page')||1);if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});const q=(params.get('q')||'').slice(0,100);
 const [campanhas,total,oportunidades]=await Promise.all([
 db`select c.*,(select coalesce(sum(d.centavos),0)::text from erp_marketing_despesas d where d.campanha_id=c.id) gasto_centavos,
 (select count(*)::int from erp_marketing_oportunidades a where a.campanha_id=c.id) oportunidades,
 (select count(*)::int from erp_marketing_oportunidades a join crm_oportunidades o on o.id=a.oportunidade_id where a.campanha_id=c.id and o.status in ('GANHA','CONVERTIDA')) ganhas,
 (select coalesce(sum(o.valor_estimado),0)::text from erp_marketing_oportunidades a join crm_oportunidades o on o.id=a.oportunidade_id where a.campanha_id=c.id and o.status in ('GANHA','CONVERTIDA')) valor_comercial_estimado
 from erp_marketing_campanhas c order by criado_em desc limit 50 offset ${(page-1)*50}`,
 db`select count(*)::int total from erp_marketing_campanhas`,
 db`select o.id,o.titulo,c.razao_social from crm_oportunidades o join crm_clientes c on c.id=o.cliente_id where o.titulo ilike ${'%'+q+'%'} or c.razao_social ilike ${'%'+q+'%'} order by o.criado_em desc limit 50`]);
 return NextResponse.json({campanhas,total:total[0].total,page,oportunidades},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return falha(e);}});
export const POST=unidadeHandler(async(req:Request)=>{try{
 const s=await requireRoles(['PCP','GERENTE','COMERCIAL']);const p=marketingEntrada.safeParse(await req.json());if(!p.success)return NextResponse.json({error:p.error.issues.map(i=>i.message).join(' ')},{status:400});const db=sql();const [r]=await db`select erp_marketing_acao(${p.data.acao},${JSON.stringify(p.data)}::jsonb,${s.usuario}) id`;
 return NextResponse.json({ok:true,id:r.id});
 }catch(e){return falha(e);}});
