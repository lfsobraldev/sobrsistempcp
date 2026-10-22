import { z } from 'zod';
const valores = z.array(z.string().trim().min(1).max(100)).max(100).transform(a => [...new Set(a)].sort());
export const filtrosPCPSchema = z.object({
  mes: z.string().default('SELECAO').refine(v => ['SELECAO','ATIVO','TODOS'].includes(v) || /^\d{4}-(0[1-9]|1[0-2])$/.test(v), 'Mês inválido.'),
  estado:z.enum(['ATIVO','PLANEJADO','ENCERRADO','TODOS']).default('ATIVO'),
  filtros: valores.default([]), pedidos: valores.default([]), programacaoId: z.string().uuid().nullable().default(null),
});
export type FiltrosPCP = z.infer<typeof filtrosPCPSchema>;
export function lerFiltrosPCP(params: URLSearchParams): FiltrosPCP {
  return filtrosPCPSchema.parse({estado:params.get('estado')||'ATIVO',mes:params.get('mes') || 'SELECAO', filtros:params.getAll('filtro'), pedidos:params.getAll('pedido'),programacaoId:params.get('programacaoId') || null});
}
/** Somente aliases fixos internos p/g; todos os valores são parâmetros. */
export function recortePCP(f: FiltrosPCP) {
  return { sql: `g.status in ('ATIVA','ENCERRADA') and not coalesce((to_jsonb(g)->>'arquivada')::boolean,false)
    and (($2='SELECAO' and (($1::uuid is not null and g.id=$1::uuid) or ($1::uuid is null and g.status='ATIVA')))
      or ($2='ATIVO' and g.status='ATIVA') or $2='TODOS' or to_char(g.data_programacao,'YYYY-MM')=$2)
    and (cardinality($3::text[])=0 or coalesce(nullif(p.filtro,''),g.filtro)=any($3::text[]))
    and (cardinality($4::text[])=0 or p.pedido=any($4::text[]))`,
    values:[f.programacaoId,f.mes,f.filtros,f.pedidos] };
}
export function parametrosPCP(f: FiltrosPCP): string {
  const q=new URLSearchParams();q.set('mes',f.mes);q.set('estado',f.estado);if(f.programacaoId)q.set('programacaoId',f.programacaoId);
  f.filtros.forEach(v=>q.append('filtro',v));f.pedidos.forEach(v=>q.append('pedido',v));return q.toString();
}

export const OPCOES_PCP_SQL = `select
 array(select distinct coalesce(nullif(p.filtro,''),g.filtro) from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where g.status in ('ATIVA','ENCERRADA') order by 1 limit 500) filtros,
 array(select distinct to_char(data_programacao,'YYYY-MM') from pcp_programacoes where status in ('ATIVA','ENCERRADA') order by 1 desc limit 120) meses,
 array(select distinct pedido from pcp_produtos order by pedido limit 500) pedidos`;

export async function idsProdutosRecorte(db:{query:(sql:string,args?:unknown[])=>Promise<Record<string,unknown>[]>},params:URLSearchParams){
 const r=recortePCP(lerFiltrosPCP(params));
 return db.query(`select p.id,p.programacao_id,p.pedido,p.produto from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${r.sql}`,r.values);
}
