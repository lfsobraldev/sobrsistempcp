import { z } from 'zod';
const valores = z.array(z.string().trim().min(1).max(100)).max(100).transform(a => [...new Set(a)].sort());
export const filtrosPCPSchema = z.object({
  mes: z.string().default('SELECAO').refine(v => ['SELECAO','ATIVO','TODOS'].includes(v) || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), 'Mês inválido.'),
  estado:z.enum(['ATIVO','PLANEJADO','ENCERRADO','TODOS']).default('ATIVO'),
  filtros: valores.default([]), pedidos: valores.default([]), clientes:valores.default([]), representantes:valores.default([]), programacaoId: z.string().uuid().nullable().default(null),
});
export type FiltrosPCP = z.infer<typeof filtrosPCPSchema>;
export function lerFiltrosPCP(params: URLSearchParams): FiltrosPCP {
  return filtrosPCPSchema.parse({estado:params.get('estado')||'ATIVO',clientes:params.getAll('cliente'),representantes:params.getAll('representante'),mes:params.get('mes') || 'SELECAO', filtros:params.getAll('filtro'), pedidos:params.getAll('pedido'),programacaoId:params.get('programacaoId') || null});
}
/** Somente aliases fixos internos p/g; todos os valores são parâmetros. */
export function recortePCP(f: FiltrosPCP) {
  const comercial=f.clientes.length>0||f.representantes.length>0;
  return { sql: `g.status in ('ATIVA','ENCERRADA') and not coalesce((to_jsonb(g)->>'arquivada')::boolean,false)
    and (($2='SELECAO' and (($1::uuid is not null and g.id=$1::uuid) or ($1::uuid is null and g.status='ATIVA')))
      or ($2='ATIVO' and g.status='ATIVA') or $2='TODOS' or to_char(g.data_programacao,'YYYY-MM')=$2)
    and (cardinality($3::text[])=0 or coalesce(nullif(p.filtro,''),g.filtro)=any($3::text[]))
    and (cardinality($4::text[])=0 or p.pedido=any($4::text[])) ${comercial?`and p.id in(select produto_id from pcp_clientes_operacionais where (cardinality($5::text[])=0 or cliente_id::text=any($5::text[]) or cliente_codigo=any($5::text[])) and (cardinality($6::text[])=0 or representante_id::text=any($6::text[]) or representante_codigo=any($6::text[])))`:''}`,
    values:[f.programacaoId,f.mes,f.filtros,f.pedidos,...(comercial?[f.clientes,f.representantes]:[])] };
}
export function parametrosPCP(f: FiltrosPCP): string {
  const q=new URLSearchParams();q.set('mes',f.mes);q.set('estado',f.estado);if(f.programacaoId)q.set('programacaoId',f.programacaoId);
  f.filtros.forEach(v=>q.append('filtro',v));f.pedidos.forEach(v=>q.append('pedido',v));f.clientes.forEach(v=>q.append('cliente',v));f.representantes.forEach(v=>q.append('representante',v));return q.toString();
}

export const OPCOES_PCP_SQL = `select
 array(select distinct coalesce(nullif(p.filtro,''),g.filtro) from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where g.status in ('ATIVA','ENCERRADA') order by 1 limit 500) filtros,
 array(select distinct to_char(data_programacao,'YYYY-MM') from pcp_programacoes where status in ('ATIVA','ENCERRADA') order by 1 desc limit 120) meses,
 array(select distinct pedido from pcp_produtos order by pedido limit 500) pedidos`;

export async function idsProdutosRecorte(db:{query:(sql:string,args?:unknown[])=>Promise<Record<string,unknown>[]>},params:URLSearchParams){
 const r=recortePCP(lerFiltrosPCP(params));
 return db.query(`select p.id,p.programacao_id,p.pedido,p.produto from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${r.sql}`,r.values);
}

export async function opcoesComerciais(db:{query:(sql:string,args?:unknown[])=>Promise<Record<string,unknown>[]>}){
 const [r]=await db.query("select to_regclass('pcp_clientes_operacionais') is not null existe");if(!r?.existe)return {clientes:[],representantes:[]};
 const [c,p]=await Promise.all([db.query("select distinct cliente_id::text id,cliente_codigo codigo,cliente_nome nome from pcp_clientes_operacionais where cliente_id is not null order by cliente_nome,cliente_id::text limit 500"),db.query("select distinct representante_id::text id,representante_codigo codigo,representante_nome nome from pcp_clientes_operacionais where representante_id is not null order by representante_nome,representante_id::text limit 500")]);const schema=z.array(z.object({id:z.string().uuid(),codigo:z.string(),nome:z.string()}));return {clientes:schema.parse(c),representantes:schema.parse(p)};
}
export async function opcoesPCP(db:{query:(sql:string,args?:unknown[])=>Promise<Record<string,unknown>[]>}){const b=(await db.query(OPCOES_PCP_SQL))[0];return {filtros:z.array(z.string()).parse(b.filtros),meses:z.array(z.string()).parse(b.meses),pedidos:z.array(z.string()).parse(b.pedidos),...await opcoesComerciais(db)};}
