import {z} from 'zod';
import type {Db} from './db';
import type {Unidade} from './unidades/core';
import {identitySql} from './db';
import {estadoUnidades,verificarBanco} from './unidades/access';
import {cicloAtivo} from './ciclo-industrial';
import {unidadeSchema} from './unidades/core';
const uuid=z.string().uuid();
export const transferenciaEntrada=z.discriminatedUnion('acao',[
 z.object({acao:z.literal('CICLO_TRANSFERIR'),requestId:uuid,destino:unidadeSchema,loteId:uuid,localOrigemId:uuid,produtoDestinoId:uuid,localDestinoId:uuid,quantidade:z.number().finite().positive().max(1000000).refine(v=>Math.abs(v*1000-Math.round(v*1000))<0.000001)}).strict(),
 z.object({acao:z.literal('CICLO_RECEBER_TRANSFERENCIA'),id:uuid}).strict(),
]);
async function contexto(){
 if(!cicloAtivo())throw new Error('Ciclo industrial desativado.');const e=await estadoUnidades();
 if(!['PCP','GERENTE','ENCARREGADO','LOGISTICA'].includes(e.sessao.perfil)||!e.permitidas.includes('SUL')||!e.permitidas.includes('NORDESTE')||!e.selecionada)throw new Error('SEM_PERMISSAO');
 const db=identitySql();const [r]=await db`select to_regclass('est_transferencias_unidades') is not null instalado`;if(!r?.instalado)throw new Error('Módulo aguardando migração');return {e,db};
}
export async function listarTransferencias(page:number,q?:URLSearchParams){const {db}=await contexto();
 if(q?.get('destino')){const banco=await verificarBanco(unidadeSchema.parse(q.get('destino'))),busca='%'+(q.get('q')||'').slice(0,100)+'%';return {produtos:await banco`select id,codigo,descricao,unidade_base from est_produtos where ativo and (codigo ilike ${busca} or descricao ilike ${busca}) order by codigo limit 50 offset ${(page-1)*50}`,locais:await banco`select id,codigo from est_locais where ativo order by codigo limit 100`,page};}
 return {transferencias:await db`select id,origem,destino,status,requisicao,custo_total,criado_em,recebido_em,count(*) over()::int total from est_transferencias_unidades order by criado_em desc,id limit 50 offset ${(page-1)*50}`,page};}
/** Saga explícita. Falha entre fontes conserva intenção; repetir usa a mesma chave em cada ledger. */
export type TransferPorts={contexto:()=>Promise<{e:Pick<Awaited<ReturnType<typeof estadoUnidades>>,'selecionada'|'permitidas'|'sessao'>;db:Db}>;verificarBanco:(unidade:Unidade)=>Promise<Db>};
export async function gravarTransferencia(entrada:unknown,ports:TransferPorts={contexto,verificarBanco}){
 const b=transferenciaEntrada.parse(entrada),{e,db}=await ports.contexto(),ator=e.sessao.usuario;
 if(b.acao==='CICLO_TRANSFERIR'){
  const origem=e.selecionada!;if(origem===b.destino)throw new Error('Escolha outra unidade.');
  const fonte=await ports.verificarBanco(origem),dest=await ports.verificarBanco(b.destino);
  const [instaladoOrigem]=await fonte`select to_regprocedure('erp_ciclo_mov(text,uuid,uuid,numeric,uuid,uuid,bigint,uuid,text,text,numeric,bigint)') is not null ok`;
  const [instaladoDestino]=await dest`select to_regprocedure('erp_ciclo_receber(uuid,uuid,uuid,uuid,numeric,numeric,text,text,date,uuid,text)') is not null ok`;if(!instaladoOrigem?.ok||!instaladoDestino?.ok)throw new Error('Módulo aguardando migração');
  const [lote]=await fonte`select l.*,p.unidade_base from est_lotes l join est_produtos p on p.id=l.produto_id join pcp_filiais f on f.id=l.filial_id and f.empresa_id=l.empresa_id join erp_identidade_banco ident on ident.singleton and ident.unidade=f.codigo where l.id=${b.loteId}::uuid`;
  const [produto]=await dest`select id,unidade_base from est_produtos where id=${b.produtoDestinoId}::uuid and ativo`;
  const [local]=await dest`select id from est_locais where id=${b.localDestinoId}::uuid and ativo`;
  if(!lote||!produto||!local||lote.unidade_base!==produto.unidade_base)throw new Error('Confira lote, produto e depósito de destino. As unidades base precisam coincidir.');
  const filiais=await db`select f.id,f.empresa_id,f.codigo from pcp_filiais f join pcp_empresas p on p.id=f.empresa_id and p.codigo='PCP_LEGADO' and p.ativo where f.codigo in(${origem},${b.destino}) and f.ativo`;
  const de=filiais.find(f=>f.codigo===origem),para=filiais.find(f=>f.codigo===b.destino);if(!de||!para||de.empresa_id!==para.empresa_id)throw new Error('Configure as filiais na identidade central.');
  const payload={...b,origem,produtoOrigemId:lote.produto_id,serie:lote.serie,validade:lote.validade};
  const [documento]=await db`with n as(insert into est_transferencias_unidades(id,empresa_id,filial_id,filial_destino_id,origem,destino,requisicao,criado_por) values(${b.requestId}::uuid,${de.empresa_id}::uuid,${de.id}::uuid,${para.id}::uuid,${origem},${b.destino},${JSON.stringify(payload)}::jsonb,${ator}) on conflict(id) do update set id=est_transferencias_unidades.id where est_transferencias_unidades.requisicao=excluded.requisicao returning *),a as(insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select ${ator},'INTENCAO_TRANSFERENCIA','TRANSFERENCIA',id::text,to_jsonb(n) from n where status='PENDENTE_ENVIO' returning entidade_id) select * from n`;
  if(!documento)throw new Error('Chave de transferência reutilizada com outros dados.');if(documento.status!=='PENDENTE_ENVIO')return documento;
  const [mov]=await fonte`select erp_ciclo_mov('SAIDA',${lote.produto_id}::uuid,${b.localOrigemId}::uuid,${b.quantidade},null,null,null,${b.loteId}::uuid,${b.requestId},${ator}) id`;
  const [saida]=await fonte`select custo_total from est_movimentos where id=${mov.id}`;
  const [r]=await db`with n as(update est_transferencias_unidades set status='EM_TRANSITO',movimento_origem=${mov.id},custo_total=${saida.custo_total} where id=${b.requestId}::uuid and status='PENDENTE_ENVIO' returning *) insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select ${ator},'TRANSFERIR_EM_TRANSITO','TRANSFERENCIA',id::text,to_jsonb(n) from n returning entidade_id id`;
  return r||documento;
 }
 const [doc]=await db`select * from est_transferencias_unidades where id=${b.id}::uuid`;if(!doc)throw new Error('Transferência não encontrada.');if(e.selecionada!==doc.destino)throw new Error('Selecione a unidade de destino para confirmar o recebimento.');if(doc.status==='RECEBIDA')return doc;if(doc.status!=='EM_TRANSITO')throw new Error('Confirme primeiro o envio na origem.');
 const dest=await ports.verificarBanco(unidadeSchema.parse(doc.destino));const p=doc.requisicao as {produtoDestinoId:string;localDestinoId:string;quantidade:number;serie:string|null;validade:string|null};
 const [esc]=await dest`select f.id,f.empresa_id from erp_identidade_banco b join pcp_empresas e on e.codigo='PCP_LEGADO' and e.ativo join pcp_filiais f on f.empresa_id=e.id and f.codigo=b.unidade and f.ativo where b.singleton`;
 if(!esc)throw new Error('Filial de destino não homologada.');
 const [mov]=await dest`select erp_ciclo_receber(${esc.empresa_id}::uuid,${esc.id}::uuid,${p.produtoDestinoId}::uuid,${p.localDestinoId}::uuid,${p.quantidade},${doc.custo_total}::numeric/${p.quantidade}::numeric,${'TR-'+b.id},${p.serie||''},${p.validade}::date,${b.id}::uuid,${ator}) id`;
 const [r]=await db`with n as(update est_transferencias_unidades set status='RECEBIDA',movimento_destino=${mov.id},recebido_por=${ator},recebido_em=now() where id=${b.id}::uuid and status='EM_TRANSITO' returning *) insert into pcp_auditoria_global(ator,acao,entidade,entidade_id,depois) select ${ator},'RECEBER_TRANSFERENCIA','TRANSFERENCIA',id::text,to_jsonb(n) from n returning entidade_id id`;
 return r||doc;
}
