import { cookies } from 'next/headers';
import { session } from '../auth';
import { identitySql,sqlDaUnidade } from '../db';
import { multiAtiva,verificarUnidade,unidadeSchema,type Unidade } from './core';
import type { Sessao } from '@/types/pcp';
export async function unidadesPermitidas(s:Sessao):Promise<Unidade[]>{
 const db=identitySql();
 const rows=await db`select distinct f.codigo from pcp_filiais f join pcp_empresas e on e.id=f.empresa_id and e.ativo
 join pcp_usuario_empresas ue on ue.empresa_id=e.id and ue.ativo
 join pcp_usuarios u on u.id=ue.usuario_id and u.ativo
 where u.usuario=${s.usuario} and u.perfil=${s.perfil} and f.ativo and f.codigo in ('SUL','NORDESTE','MADEIRAS')
 and (ue.escopo_filiais='TODAS' or exists(select 1 from pcp_usuario_filiais uf where uf.usuario_empresa_id=ue.id and uf.filial_id=f.id))`;
 // Bootstrap administrativo por login de ambiente, com grants de unidade explícitos.
 const admin=s.perfil==='PCP'&&[process.env.ADMIN_USER,process.env.PCP_USER].filter(Boolean).includes(s.usuario);
 const bootstrap=admin?(process.env.ERP_ADMIN_UNITS||'').split(',').map(x=>x.trim()):[];
 return [...new Set([...rows.map(r=>r.codigo),...bootstrap].filter((x):x is Unidade=>unidadeSchema.safeParse(x).success))];
}
export async function estadoUnidades(){
 const s=await session();if(!s)throw new Error('NAO_AUTENTICADO');
 if(!multiAtiva())return {ativo:false,selecionada:null,permitidas:[] as Unidade[],consolidado:false,sessao:s};
 const permitidas=await unidadesPermitidas(s);const c=await cookies();
 const selecionada=verificarUnidade(c.get('erp_unidade')?.value,s.usuario,process.env.AUTH_SECRET||'');
 return {ativo:true,selecionada:selecionada&&permitidas.includes(selecionada)?selecionada:null,permitidas,consolidado:['PCP','GERENTE'].includes(s.perfil)&&permitidas.includes('SUL')&&permitidas.includes('NORDESTE'),sessao:s};
}
export async function verificarBanco(unidade:Unidade){
 const db=sqlDaUnidade(unidade);
 const [row]=await db`select unidade from erp_identidade_banco where singleton=true`;
 if(row?.unidade!==unidade)throw new Error('O banco selecionado não está homologado para esta unidade.');
 return db;
}
