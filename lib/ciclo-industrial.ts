import {z} from 'zod';
import type {Db} from './db';
import {unidadeAtual} from './unidades/context';
const uuid=z.string().uuid(),q=z.number().finite().nonnegative().max(1000000).refine(v=>Math.abs(v*1000-Math.round(v*1000))<0.000001,'Use até três casas decimais.');
const data=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>{const d=new Date(v+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v;},'Data inválida.');
export const operacaoRoteiro=z.object({sequencia:z.number().int().min(1).max(1000),processo:z.string().trim().min(1).max(80),centro_id:uuid,chave:z.enum(['INTERNA','EXTERNA']),setup:q,ciclo:q.refine(v=>v>0),parcial:z.boolean(),entrada:z.boolean(),componentes:z.array(z.object({produto_id:uuid,consumo:z.enum(['AUTOMATICO','MANUAL'])}).strict()).max(200)}).strict();
export const engenhariaCiclo=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('CICLO_CENTRO'),processo:z.string().trim().min(1).max(80),maquina:z.string().trim().min(1).max(120),turno:z.string().trim().min(1).max(20),minutos:q.refine(v=>v>0&&v<=1440),dias:z.array(z.number().int().min(1).max(7)).min(1).max(7)}).strict(),
 z.object({acao:z.literal('CICLO_ROTEIRO'),produtoId:uuid,operacoes:z.array(operacaoRoteiro).min(1).max(100),requestId:uuid}).strict(),
 z.object({acao:z.literal('CICLO_APROVAR_ROTEIRO'),id:uuid}).strict(),
 z.object({acao:z.literal('CICLO_VERSAO'),estruturaId:uuid,roteiroId:uuid,inicio:data,fim:data.nullable(),minimo:q,maximo:q.nullable()}).strict(),
]);
export const ofCiclo=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('CICLO_GERAR'),origemId:uuid,prazo:data,localId:uuid,faltaSaldo:z.enum(['BLOQUEAR','PENDENTE']),usarSaldo:z.boolean()}).strict(),
 z.object({acao:z.literal('CICLO_CONFIRMAR'),id:uuid}).strict(),
]);
export const apontamentoPayload=z.object({boa:q,refugo:q,motivo:z.string().trim().max(200).default(''),setupMin:q.default(0),maquinaMin:q.default(0),turno:z.string().max(20).default(''),consumirRefugo:z.boolean().default(true),lote:z.string().trim().max(80).default(''),serie:z.string().trim().max(80).default(''),consumos:z.array(z.object({produtoId:uuid,localId:uuid.optional(),loteId:uuid.optional(),quantidade:q.optional()}).strict()).max(200).default([])}).strict().refine(v=>v.boa+v.refugo>0,'Informe quantidade boa ou refugo.').refine(v=>v.refugo===0||v.motivo.length>0,'Informe o motivo do refugo.').refine(v=>new Set(v.consumos.map(c=>c.produtoId)).size===v.consumos.length,'Componente repetido.');
export const operacaoCiclo=z.discriminatedUnion('action',[
 z.object({action:z.literal('CICLO_APONTAR'),requestId:uuid,payload:apontamentoPayload}).strict(),
 z.object({action:z.literal('CICLO_REPROCESSAR'),apontamentoId:z.number().int().positive()}).strict(),
 z.object({action:z.literal('CICLO_ESTORNAR'),apontamentoId:z.number().int().positive(),requestId:uuid}).strict(),
 z.object({action:z.literal('CICLO_FINALIZAR')}).strict(),
]);
export const recebimentoCiclo=z.object({acao:z.literal('CICLO_RECEBER'),produtoId:uuid,localId:uuid,quantidade:q.refine(v=>v>0),custoUnitario:q,lote:z.string().trim().min(1).max(80),serie:z.string().trim().max(80).default(''),validade:data.nullable().default(null),requestId:uuid}).strict();
export function cicloAtivo(){return process.env.ERP_CICLO_INDUSTRIAL==='enabled';}
export async function exigirCiclo(db:Db){
 if(!cicloAtivo())throw new Error('Ciclo industrial desativado.');
 const [r]=await db`select to_regprocedure('erp_ciclo_apontar(uuid,jsonb,uuid,text)') is not null and to_regclass('erp_versoes_producao') is not null instalado`;
 if(!r?.instalado)throw new Error('Módulo aguardando migração');
}
/** Filial deriva da identidade do banco homologado, nunca de parâmetros da escrita. */
export async function escopoCiclo(db:Db){
 const unidade=unidadeAtual();
 const rows=await db`select f.empresa_id,f.id filial_id from erp_identidade_banco b join pcp_empresas e on e.codigo='PCP_LEGADO' and e.ativo join pcp_filiais f on f.empresa_id=e.id and f.codigo=b.unidade and f.ativo where b.singleton and b.unidade is not null and (${unidade}::text is null or b.unidade=${unidade})`;
 if(rows.length!==1)throw new Error('Homologue a unidade e o vínculo empresa/filial antes de usar o ciclo industrial.');return rows[0] as {empresa_id:string;filial_id:string};
}
export async function gravarEngenhariaCiclo(db:Db,entrada:unknown,ator:string){
 await exigirCiclo(db);const b=engenhariaCiclo.parse(entrada),s=await escopoCiclo(db);
 if(b.acao==='CICLO_CENTRO')return db`with n as(insert into pcp_capacidades_maquina(processo,maquina,turno,minutos_disponiveis,calendario,empresa_id,filial_id,atualizado_por) values(${b.processo},${b.maquina},${b.turno},${b.minutos},${JSON.stringify({dias:b.dias,fuso:'America/Sao_Paulo'})}::jsonb,${s.empresa_id}::uuid,${s.filial_id}::uuid,${ator}) on conflict(processo,maquina,turno) do update set minutos_disponiveis=excluded.minutos_disponiveis,calendario=excluded.calendario,empresa_id=excluded.empresa_id,filial_id=excluded.filial_id,atualizado_por=excluded.atualizado_por where pcp_capacidades_maquina.empresa_id is null or (pcp_capacidades_maquina.empresa_id=excluded.empresa_id and pcp_capacidades_maquina.filial_id=excluded.filial_id) returning *) insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select ${ator},'CONFIGURAR_CENTRO','CAPACIDADE_MAQUINA',id::text,to_jsonb(n) from n returning entidade_id id`;
 if(b.acao==='CICLO_ROTEIRO')return db`select erp_ciclo_roteiro(${s.empresa_id}::uuid,${s.filial_id}::uuid,${b.produtoId}::uuid,${JSON.stringify(b.operacoes)}::jsonb,${b.requestId}::uuid,${ator}) id`;
 if(b.acao==='CICLO_APROVAR_ROTEIRO'){
 const [r]=await db`select id from erp_roteiros where id=${b.id}::uuid and empresa_id=${s.empresa_id}::uuid and filial_id=${s.filial_id}::uuid`;if(!r)throw new Error('Roteiro não encontrado.');return db`select erp_ciclo_aprovar_roteiro(${b.id}::uuid,${ator}) id`;
 }
 return db`select erp_ciclo_versao(${s.empresa_id}::uuid,${s.filial_id}::uuid,${b.estruturaId}::uuid,${b.roteiroId}::uuid,${b.inicio}::date,${b.fim}::date,${b.minimo},${b.maximo},${ator}) id`;
}
export async function gravarOFCiclo(db:Db,entrada:unknown,ator:string){
 await exigirCiclo(db);const b=ofCiclo.parse(entrada),s=await escopoCiclo(db);
 if(b.acao==='CICLO_CONFIRMAR'){
 const [o]=await db`select id from erp_ordens_fabricacao where id=${b.id}::uuid and empresa_id=${s.empresa_id}::uuid and filial_id=${s.filial_id}::uuid`;if(!o)throw new Error('OF não encontrada.');return db`select erp_ciclo_confirmar(${b.id}::uuid,${ator}) id`;
 }
 const [p]=await db`select ep.id,p.quantidade from pcp_produtos p join est_produtos ep on ep.codigo=upper(regexp_replace(trim(p.produto),'[[:space:]]+','','g')) and ep.ativo where p.id=${b.origemId}::uuid`;
 if(!p)throw new Error('Vincule o código programado a um produto de estoque.');
 return db`select erp_ciclo_gerar(${s.empresa_id}::uuid,${s.filial_id}::uuid,${p.id}::uuid,${p.quantidade},${b.prazo}::date,${b.localId}::uuid,${b.faltaSaldo},${b.usarSaldo},${b.origemId}::uuid,${b.origemId}::uuid,null,${ator}) id`;
}
export async function gravarOperacaoCiclo(db:Db,id:string,entrada:unknown,ator:string,processos?:string[],restrito=false){
 await exigirCiclo(db);const b=operacaoCiclo.parse(entrada),s=await escopoCiclo(db);
 const [op]=await db`select op.id,op.processo from pcp_operacoes op join erp_ordens_fabricacao o on o.id=op.of_id where op.id=${id}::uuid and o.empresa_id=${s.empresa_id}::uuid and o.filial_id=${s.filial_id}::uuid`;
 if(!op)throw new Error('Operação integrada não encontrada.');
 if(restrito&&(!processos?.length||!processos.includes(op.processo)))throw new Error('SEM_PERMISSAO');
 if(b.action==='CICLO_APONTAR')return db`select erp_ciclo_apontar(${id}::uuid,${JSON.stringify(b.payload)}::jsonb,${b.requestId}::uuid,${ator}) id`;
 if(b.action==='CICLO_FINALIZAR')return db`select erp_ciclo_finalizar(${id}::uuid,${ator}) id`;
 const [a]=await db`select id from pcp_apontamentos where id=${b.apontamentoId} and operacao_id=${id}::uuid`;if(!a)throw new Error('Apontamento não pertence à operação.');
 if(b.action==='CICLO_REPROCESSAR')return db`select erp_ciclo_processar(${b.apontamentoId},${ator}) id`;
 return db`select erp_ciclo_estornar(${b.apontamentoId},${b.requestId}::uuid,${ator}) id`;
}
