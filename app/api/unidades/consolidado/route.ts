import {OPCOES_PCP_SQL} from "@/lib/pcp-filters";
import {consultaModulo,moduloConsolidado,janelasConsolidadas} from "@/lib/unidades/consolidado-modulo";
import { NextResponse } from 'next/server';
import { estadoUnidades,verificarBanco } from '@/lib/unidades/access';
import type { Unidade } from '@/lib/unidades/core';
export const runtime='nodejs';
const indicadores=[
 {codigo:'clientes',titulo:'Clientes cadastrados',tabelas:['crm_clientes'],query:'select count(*)::text valor from crm_clientes'},
 {codigo:'representantes',titulo:'Representantes cadastrados',tabelas:['crm_representantes'],query:'select count(*)::text valor from crm_representantes'},
 {codigo:'oportunidades',titulo:'Oportunidades abertas',tabelas:['crm_oportunidades'],query:"select count(*)::text valor from crm_oportunidades where status not in ('GANHA','PERDIDA','CONVERTIDA')"},
 {codigo:'carteira_comercial',titulo:'Valor estimado de oportunidades abertas (R$)',tabelas:['crm_oportunidades'],query:"select coalesce(sum(valor_estimado),0)::text valor from crm_oportunidades where status not in ('GANHA','PERDIDA','CONVERTIDA')"},
 {codigo:'programado',titulo:'Peças em programações ativas',tabelas:['pcp_produtos','pcp_programacoes'],query:"select coalesce(sum(p.quantidade),0)::text valor from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where g.status='ATIVA'"},
 {codigo:'operacoes',titulo:'Operações em andamento',tabelas:['pcp_operacoes'],query:"select count(*)::text valor from pcp_operacoes where status='EM_ANDAMENTO'"},
 {codigo:'estoque',titulo:'Posições de estoque com saldo',tabelas:['est_saldos'],query:'select count(*)::text valor from est_saldos where fisico>0'},
 {codigo:'galpoes',titulo:'Locais de estoque ativos',tabelas:['est_locais'],query:'select count(*)::text valor from est_locais where ativo'},
 {codigo:'sac',titulo:'Atendimentos SAC abertos',tabelas:['pcp_sac_atendimentos'],query:"select count(*)::text valor from pcp_sac_atendimentos where status not in ('CONCLUIDO','CANCELADO')"},
 {codigo:'medicoes',titulo:'Revisões de medição aguardando aprovação',tabelas:['pcp_medicao_revisoes'],query:"select count(*)::text valor from pcp_medicao_revisoes where status='AGUARDANDO_APROVACAO'"},
 {codigo:'pallets',titulo:'Pallets liberados',tabelas:['pcp_pallets'],query:"select count(*)::text valor from pcp_pallets where status='LIBERADO'"},
] as const;
export async function GET(req:Request){try{
 const e=await estadoUnidades();if(!e.ativo||!e.consolidado)return NextResponse.json({error:'A visão consolidada exige perfil de gestão e acesso às duas unidades.'},{status:403});
 const params=new URL(req.url).searchParams;
 if(params.has('modulo')){
  const modulo=moduloConsolidado.parse(params.get('modulo')),page=Number(params.get('page')||1);
  if(!Number.isInteger(page)||page<1||page>100000)return NextResponse.json({error:'Página inválida.'},{status:400});
  const consulta=consultaModulo(modulo,params);
  const fontes=await Promise.all((['SUL','NORDESTE'] as Unidade[]).map(async unidade=>{
   const db=await verificarBanco(unidade);
   const schema=await db`select to_regclass(x) tabela from unnest(${consulta.tabelas}::text[]) x`;
   if(schema.some(t=>!t.tabela))throw new Error('MIGRACAO_PENDENTE');
   const [c]=await db.query(`select count(*)::int total from (${consulta.sql}) x`,consulta.values);
   const [opcoes]=await db.query(OPCOES_PCP_SQL);return {db,unidade,total:Number(c.total),opcoes};
  }));
  const janelas=janelasConsolidadas(fontes.map(f=>f.total),page);
  const partes=await Promise.all(fontes.map(async(f,i)=>janelas[i].limit?(await f.db.query(`select * from (${consulta.sql}) x order by id limit $${consulta.values.length+1} offset $${consulta.values.length+2}`,[...consulta.values,janelas[i].limit,janelas[i].offset])).map(r=>({...r,unidade:f.unidade})):[]));
  return NextResponse.json({opcoes:{filtros:[...new Set(fontes.flatMap(f=>f.opcoes.filtros))],meses:[...new Set(fontes.flatMap(f=>f.opcoes.meses))],pedidos:[...new Set(fontes.flatMap(f=>f.opcoes.pedidos))]},modulo,colunas:['unidade',...consulta.colunas],rows:partes.flat(),total:fontes.reduce((s,f)=>s+f.total,0),comparativo:fontes.map(({unidade,total})=>({unidade,total})),page},{headers:{'Cache-Control':'no-store'}});
 }
 const resultados=await Promise.all((['SUL','NORDESTE'] as Unidade[]).map(async unidade=>{
  try{const db=await verificarBanco(unidade);const dados=[];
   for(const i of indicadores){const tables=await db`select x.nome,to_regclass(x.nome) is not null as existe from unnest(${[...i.tabelas]}::text[]) x(nome)`;
    if(tables.some(t=>!t.existe)){dados.push({codigo:i.codigo,titulo:i.titulo,valor:null,status:'NAO_INSTALADO'});continue;}
    const [r]=await db.query(i.query);dados.push({codigo:i.codigo,titulo:i.titulo,valor:String(r.valor),status:'OK'});
   }
   return {unidade,status:'OK',indicadores:dados};
  }catch{ return {unidade,status:'INDISPONIVEL',indicadores:[]};}
 }));
 return NextResponse.json({unidades:resultados,atualizadoEm:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}});
}catch(e){return NextResponse.json({error:e instanceof Error&&/MIGRACAO_PENDENTE|does not exist/.test(e.message)?'Módulo aguardando migração':'Não foi possível consultar o consolidado.'},{status:503});}}
