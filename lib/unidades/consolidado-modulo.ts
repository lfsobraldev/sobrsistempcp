import {z} from 'zod';
import {lerFiltrosPCP,recortePCP} from '../pcp-filters';
import type {Unidade} from './core';
export const moduloConsolidado=z.enum(['pcp','apontamento','estoque','programacao']);
export function consultaModulo(modulo:z.infer<typeof moduloConsolidado>,params:URLSearchParams,ciclo=false){
 const q=new URLSearchParams(params);q.delete('programacaoId');if(!q.has('mes')||q.get('mes')==='SELECAO')q.set('mes','ATIVO');
 const f=lerFiltrosPCP(q),r=recortePCP(f);
 const pcp=`from pcp_produtos p join pcp_programacoes g on g.id=p.programacao_id where ${r.sql}`;
 if(modulo==='pcp')return{sql:`select p.id::text,p.pedido,coalesce(nullif(p.filtro,''),g.filtro) filtro,to_char(g.data_programacao,'YYYY-MM-DD') data,p.produto codigo,p.descricao,p.quantidade::text quantidade,p.percentual_produto::text percentual ${pcp}`,values:r.values,tabelas:['pcp_produtos','pcp_programacoes'],colunas:['pedido','filtro','data','codigo','descricao','quantidade','percentual']};
 if(modulo==='apontamento'){
 const origem=ciclo?'coalesce(o.produto_id,ofc.origem_raiz_id)':'o.produto_id',joins=ciclo?'left join erp_ordens_fabricacao ofc on ofc.id=o.of_id left join est_produtos ep on ep.id=ofc.produto_estoque_id':'';
 return{sql:`select o.id::text,p.pedido,coalesce(nullif(p.filtro,''),g.filtro) filtro,${ciclo?'coalesce(ep.codigo,p.produto)':'p.produto'} codigo,o.processo,o.status,o.quantidade_planejada::text planejada,o.quantidade_produzida::text produzida,o.quantidade_refugo::text refugo from pcp_operacoes o ${joins} join pcp_produtos p on p.id=${origem} join pcp_programacoes g on g.id=p.programacao_id where ${r.sql}`,values:r.values,tabelas:['pcp_produtos','pcp_programacoes','pcp_operacoes',...(ciclo?['erp_ordens_fabricacao','est_produtos']:[])],colunas:['pedido','filtro','codigo','processo','status','planejada','produzida','refugo']};
 }
 if(modulo==='estoque'){
  const escopo=f.filtros.length>0||f.pedidos.length>0||!['ATIVO','TODOS'].includes(f.mes);
  return{sql:`select s.produto_id::text||':'||s.local_id::text id,p.codigo,p.descricao,p.unidade_base,l.codigo deposito,s.fisico::text fisico,s.reservado::text reservado,s.bloqueado::text bloqueado,(s.fisico-s.reservado-s.bloqueado)::text disponivel from est_saldos s join est_produtos p on p.id=s.produto_id join est_locais l on l.id=s.local_id where ($5::boolean=false or p.codigo in(select p.produto ${pcp}))`,values:[...r.values,escopo],tabelas:['est_saldos','est_produtos','est_locais','pcp_produtos','pcp_programacoes'],colunas:['codigo','descricao','unidade_base','deposito','fisico','reservado','bloqueado','disponivel']};
 }
 const estado=z.enum(['ATIVO','PLANEJADO','ENCERRADO','TODOS']).parse(params.get('estado')||'ATIVO');
 return{sql:`select b.id::text,b.pedido,b.filtro,to_char(b.competencia,'YYYY-MM') competencia,b.produto codigo,b.descricao,b.quantidade::text quantidade,c.status from pcp_programacao_mensal_efetiva b join pcp_programacao_competencias c on c.filial_id=b.filial_id and c.competencia=b.competencia where ($2 in ('ATIVO','TODOS') or to_char(b.competencia,'YYYY-MM')=$2) and (cardinality($3::text[])=0 or b.filtro=any($3::text[])) and (cardinality($4::text[])=0 or b.pedido=any($4::text[])) and ($5='TODOS' or c.status=$5) and ($1::uuid is null)`,values:[null,f.mes,f.filtros,f.pedidos,estado],tabelas:['pcp_programacao_mensal_efetiva','pcp_programacao_competencias'],colunas:['pedido','filtro','competencia','codigo','descricao','quantidade','status']};
}
/** Distribui uma página pelas fontes em ordem fixa; nunca soma unidades de medida diferentes. */
export function janelasConsolidadas(contagens:number[],page:number,tamanho=50){let skip=(page-1)*tamanho,restante=tamanho;return contagens.map(total=>{const offset=Math.min(skip,total);skip-=offset;const limit=Math.min(restante,total-offset);restante-=limit;return{offset,limit};});}
export type LinhaUnidade={unidade:Unidade;[key:string]:unknown};
