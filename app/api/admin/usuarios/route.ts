import { NextResponse } from 'next/server';
import { identitySql } from '@/lib/db';
import { administradorCentral,hashSenha,salvarUsuarioSchema,PERFIS,ETAPAS } from '@/lib/unidades/users';
export const runtime='nodejs';
export async function GET(req:Request){try{
 await administradorCentral();const db=identitySql();const page=Math.max(1,Math.min(100000,Number(new URL(req.url).searchParams.get('page')||1)));if(!Number.isInteger(page))return NextResponse.json({error:'Página inválida.'},{status:400});
 const [usuarios,total]=await Promise.all([db`select id,usuario,nome,perfil,ativo,to_char(atualizado_em at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as versao,
 coalesce((select jsonb_agg(jsonb_build_object('unidade',x.codigo,'etapas',coalesce((select jsonb_agg(le.etapa order by le.etapa) from pcp_lider_unidade_etapas le where le.usuario_id=u.id and le.unidade=x.codigo),'[]'::jsonb),'turno',coalesce((select min(le.turno) from pcp_lider_unidade_etapas le where le.usuario_id=u.id and le.unidade=x.codigo),'A'))) from (select distinct f.codigo from pcp_usuario_empresas ue join pcp_filiais f on f.empresa_id=ue.empresa_id and f.ativo where ue.usuario_id=u.id and ue.ativo and f.codigo in ('SUL','NORDESTE') and (ue.escopo_filiais='TODAS' or exists(select 1 from pcp_usuario_filiais uf where uf.usuario_empresa_id=ue.id and uf.filial_id=f.id))) x),'[]'::jsonb) as acessos
 from pcp_usuarios u order by usuario limit 50 offset ${(page-1)*50}`,
 db`select count(*)::int total from pcp_usuarios`]);
 return NextResponse.json({usuarios,total:total[0].total,page,perfis:PERFIS,etapas:ETAPAS},{headers:{'Cache-Control':'no-store'}});
 }catch{return NextResponse.json({error:'Acesso exclusivo do administrador central; verifique também a migração de acessos.'},{status:403});}}
export async function POST(req:Request){try{
 const ator=await administradorCentral();const parsed=salvarUsuarioSchema.safeParse(await req.json());if(!parsed.success)return NextResponse.json({error:parsed.error.issues.map(i=>i.message).join(' ')},{status:400});
 const b=parsed.data;if([process.env.ADMIN_USER,process.env.PCP_USER].filter(Boolean).includes(b.usuario))return NextResponse.json({error:'A conta de administração do ambiente é gerenciada pela configuração do servidor.'},{status:409});
 const {senha,...dados}=b;const db=identitySql();
 const [r]=await db`select erp_salvar_usuario(${b.id}::uuid,${JSON.stringify(dados)}::jsonb,${senha?hashSenha(senha):null},${ator.usuario},${b.versao}::timestamptz) as id`;
 return NextResponse.json({ok:true,id:r.id});
 }catch(e){const message=e instanceof Error?e.message:'';return NextResponse.json({error:message==='SEM_PERMISSAO'?'Sem permissão.':/Versão desatualizada/.test(message)?'Outro administrador alterou esta conta. Recarregue antes de editar.':/unique|duplicad/i.test(message)?'Login já cadastrado.':'Não foi possível salvar a conta. Confira os vínculos de filial e a migração central.'},{status:message==='SEM_PERMISSAO'?403:409});}}
