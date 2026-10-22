import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {consultaModulo} from '../lib/unidades/consolidado-modulo';
import type {Db} from '../lib/db';
import {consultarEngenhariaCiclo,consultarOFCiclo,consultarLotesCiclo} from '../lib/ciclo-consultas';
import {gravarTransferencia,type TransferPorts} from '../lib/transferencias-unidades';
import {PGlite} from '@electric-sql/pglite';
function adapter(db:PGlite,intercept?:(sql:string)=>void){const query=async(sql:string,args:unknown[]=[])=>{intercept?.(sql);return (await db.query(sql,args)).rows;};const tagged=(parts:TemplateStringsArray,...values:unknown[])=>query(parts.reduce((s,p,i)=>s+(i?'$'+i:'')+p,''),values);tagged.query=query;return tagged as unknown as Db;}
async function banco(){const db=new PGlite();
 const base=(await readFile('database/schema.sql','utf8')).replace(/create extension if not exists pgcrypto;/gi,'');await db.exec(base);
 await db.exec(`create table if not exists pcp_capacidades_maquina(id uuid primary key default gen_random_uuid(),processo text,maquina text,turno text);`);
 await db.exec((await readFile('database/migrations/2026-10-21_fundacao_multiempresa.sql','utf8')).replace('create extension if not exists pgcrypto;',''));
 for(const f of ['2026-10-21_06_engenharia_of.sql','2026-10-22_10_ciclo_industrial.sql']){const up=(await readFile('database/migrations/'+f,'utf8')).split('-- migrate:down')[0];await db.exec(up);if(f.includes('_10_'))await db.exec(up);}
return db;}
test('ciclo industrial SQL: engenharia, filha, reservas, parcial, ledger, pendência, estorno e rastreio',async()=>{
 const db=await banco();try{
 const one=async<T extends Record<string,unknown>>(q:string,args:unknown[]=[]) => (await db.query<T>(q,args)).rows[0];
 const {id:emp}=await one("insert into pcp_empresas(codigo,razao_social) values('TESTE','Teste') returning id");
 const {id:fil}=await one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'SUL','Sul') returning id",[emp]);
 const {id:local}=await one("insert into est_locais(codigo) values('PADRAO') returning id");
 const {id:centro}=await one("insert into pcp_capacidades_maquina(processo,maquina,turno,empresa_id,filial_id) values('CORTE','M1','A',$1,$2) returning id",[emp,fil]);
 const prod=async(code:string,tipo:string)=>(await one("insert into est_produtos(codigo,unidade_base,classificacao) values($1,'UN',$2) returning id",[code,tipo])).id;
 const raw=await prod('RAW','INSUMO'),semi=await prod('SEMI','SEMIACABADO'),final=await prod('FINAL','ACABADO');
 const version=async(p:unknown,component:unknown,mult:number)=>{
  const {id:bom}=await one('select erp_criar_estrutura($1,$2,$3,\'teste\') id',[p,JSON.stringify([{componente_id:component,quantidade:mult,perda_percentual:0}]),crypto.randomUUID()]);await one('select erp_aprovar_estrutura($1,\'teste\')',[bom]);
  const ops=[{sequencia:1,processo:'CORTE',centro_id:centro,chave:'INTERNA',setup:0,ciclo:1,parcial:true,entrada:true,componentes:[{produto_id:component,consumo:'AUTOMATICO'}]}];
  const {id:route}=await one('select erp_ciclo_roteiro($1,$2,$3,$4,$5,\'teste\') id',[emp,fil,p,JSON.stringify(ops),crypto.randomUUID()]);await one('select erp_ciclo_aprovar_roteiro($1,\'teste\')',[route]);
  await one("select erp_ciclo_versao($1,$2,$3,$4,'2026-01-01',null,0,null,'teste')",[emp,fil,bom,route]);return {bom,route};
 };
 await version(semi,raw,3);await version(final,semi,2);
 const pg=crypto.randomUUID(),origem=crypto.randomUUID();await db.query("insert into pcp_programacoes(id,filtro,data_programacao,turno,status) values($1,'F','2026-10-01','A','ATIVA')",[pg]);
 await db.query("insert into pcp_produtos(id,programacao_id,produto,pedido,of,descricao,quantidade) values($1,$2,'FINAL','P1','1','Final',10)",[origem,pg]);
 await db.query("insert into pcp_operacoes(produto_id,processo,sequencia,quantidade_planejada) values($1,'CORTE',1,10)",[origem]);
 const {id:of}=await one("select erp_ciclo_gerar($1,$2,$3,10,'2026-10-31',$4,'BLOQUEAR',true,$5,$5,null,'teste') id",[emp,fil,final,local,origem]);
 const child=await one('select * from erp_ordens_fabricacao where of_pai_id=$1',[of]);const cons=consultaModulo('apontamento',new URLSearchParams('mes=TODOS'),true);assert.equal((await db.query(cons.sql,cons.values)).rows.length,2);assert.equal(Number(child.quantidade),20);assert.equal(child.origem_produto_id,null);
 await assert.rejects(one("select erp_ciclo_confirmar($1,'teste')",[of]),/SALDO_INSUFICIENTE/);
 await db.query('insert into est_saldos(produto_id,local_id,fisico) values($1,$2,60)',[raw,local]);
 await one("select erp_ciclo_confirmar($1,'teste')",[of]);assert.equal(Number((await one('select reservado from est_saldos where produto_id=$1',[raw])).reservado),60);
 const cop=await one('select id from pcp_operacoes where of_id=$1',[child.id]);const pop=await one('select id from pcp_operacoes where of_id=$1',[of]);
 const payload={boa:5,refugo:0,consumirRefugo:true,consumos:[]};const key=crypto.randomUUID();
 const {id:ap}=await one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[cop.id,JSON.stringify(payload),key]);
 assert.equal((await one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[cop.id,JSON.stringify(payload),key])).id,ap);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[raw])).fisico),45);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[semi])).fisico),5);
 const {id:parentAp}=await one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[pop.id,JSON.stringify({...payload,boa:2}),crypto.randomUUID()]);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[semi])).fisico),1);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[final])).fisico),2);
 assert.equal((await db.query('select * from est_movimentos where apontamento_id=$1 and lote_id is not null',[parentAp])).rows.length,2);
 await assert.rejects(one("select erp_ciclo_estornar($1,$2,'teste')",[ap,crypto.randomUUID()]),/SALDO_INSUFICIENTE/);
 await one("select erp_ciclo_estornar($1,$2,'teste')",[parentAp,crypto.randomUUID()]);await one("select erp_ciclo_estornar($1,$2,'teste')",[ap,crypto.randomUUID()]);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[raw])).fisico),60);
 assert.equal(Number((await one('select reservado from est_saldos where produto_id=$1',[raw])).reservado),60);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[final])).fisico),0);
 assert.equal(Number((await one('select quantidade_produzida from pcp_operacoes where id=$1',[cop.id])).quantidade_produzida),0);
 await db.query("update erp_ordens_fabricacao set falta_saldo='PENDENTE' where id=$1",[of]);
 const {id:pending}=await one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[pop.id,JSON.stringify({...payload,boa:1}),crypto.randomUUID()]);
 assert.equal((await one('select estoque_status from pcp_apontamentos where id=$1',[pending])).estoque_status,'PENDENTE');
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[final])).fisico),0);
 await one("select erp_ciclo_apontar($1,$2,$3,'teste')",[cop.id,JSON.stringify(payload),crypto.randomUUID()]);
 await one("select erp_ciclo_processar($1,'teste')",[pending]);await one("select erp_ciclo_processar($1,'teste')",[pending]);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[final])).fisico),1);
 assert.equal(Number((await one('select quantidade_produzida from pcp_operacoes where id=$1',[pop.id])).quantidade_produzida),1);
 await assert.rejects(one("update erp_ordens_fabricacao set snapshot='{}' where id=$1 returning id",[of]),/imutáveis/);
 await assert.rejects(one('update pcp_operacoes set quantidade_produzida=10 where id=$1 returning id',[pop.id]),/integrado/);
 await assert.rejects(one("select erp_ciclo_apontar($1,$2,$3,'teste')",[cop.id,JSON.stringify({...payload,boa:6}),key]),/outros dados/);
 const receiptKey=crypto.randomUUID();await one("select erp_ciclo_receber($1,$2,$3,$4,10,2,'R1','',null,$5,'teste')",[emp,fil,raw,local,receiptKey]);
 await one("select erp_ciclo_receber($1,$2,$3,$4,10,2,'R1','',null,$5,'teste')",[emp,fil,raw,local,receiptKey]);
 assert.equal((await db.query('select * from est_movimentos where request_id=$1',[receiptKey])).rows.length,1);
 await assert.rejects(one("select erp_ciclo_receber($1,$2,$3,$4,10,3,'R1','',null,$5,'teste')",[emp,fil,raw,local,receiptKey]),/reutilizada/);
 await one("select erp_ciclo_apontar($1,$2,$3,'teste')",[cop.id,JSON.stringify({...payload,boa:15}),crypto.randomUUID()]);
 await one("select erp_ciclo_finalizar($1,'teste')",[cop.id]);
 await one("select erp_ciclo_apontar($1,$2,$3,'teste')",[pop.id,JSON.stringify({...payload,boa:8,refugo:1,motivo:'Perda na operação final',consumirRefugo:false}),crypto.randomUUID()]);
 await one("select erp_ciclo_mov('RESERVA',$1,$2,2,$3,null,null,null,$4,'teste')",[semi,local,of,'teste-reserva-final:'+crypto.randomUUID()]);
 await one("select erp_ciclo_finalizar($1,'teste')",[pop.id]);
 assert.equal((await one('select status from erp_ordens_fabricacao where id=$1',[of])).status,'CONCLUIDA');
 assert.equal(Number((await one('select reservado from est_saldos where produto_id=$1',[semi])).reservado),0);
 assert.ok((await db.query('select * from pcp_auditoria_global')).rows.length>10);
 }finally{await db.close();}
});
test('duas operações: consumo só da operação, PEPS, concorrência idempotente e estorno em ordem',async()=>{
 const db=await banco();try{
 const one=async(q:string,args:unknown[]=[]) => (await db.query<Record<string,unknown>>(q,args)).rows[0];
 const {id:emp}=await one("insert into pcp_empresas(codigo,razao_social) values('PCP_LEGADO','Teste') returning id");
 const {id:fil}=await one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'SUL','Sul') returning id",[emp]);
 const {id:local}=await one("insert into est_locais(codigo) values('L') returning id");
 const {id:centro}=await one("insert into pcp_capacidades_maquina(processo,empresa_id,filial_id) values('CORTE',$1,$2) returning id",[emp,fil]);
 const prod=async(c:string,t:string)=>(await one("insert into est_produtos(codigo,unidade_base,classificacao) values($1,'UN',$2) returning id",[c,t])).id;
 const a=await prod('A','INSUMO'),b=await prod('B','INSUMO'),final=await prod('F','ACABADO');
 const {id:bom}=await one("select erp_criar_estrutura($1,$2,$3,'teste') id",[final,JSON.stringify([{componente_id:a,quantidade:1,perda_percentual:0},{componente_id:b,quantidade:2,perda_percentual:0}]),crypto.randomUUID()]);await one("select erp_aprovar_estrutura($1,'teste')",[bom]);
 const ops=[{sequencia:1,processo:'CORTE',centro_id:centro,chave:'INTERNA',setup:5,ciclo:1,parcial:true,entrada:false,componentes:[{produto_id:a,consumo:'AUTOMATICO'}]},{sequencia:2,processo:'CORTE',centro_id:centro,chave:'INTERNA',setup:0,ciclo:1,parcial:true,entrada:true,componentes:[{produto_id:b,consumo:'MANUAL'}]}];
 const {id:r}=await one("select erp_ciclo_roteiro($1,$2,$3,$4,$5,'teste') id",[emp,fil,final,JSON.stringify(ops),crypto.randomUUID()]);await one("select erp_ciclo_aprovar_roteiro($1,'teste')",[r]);
 await one("select erp_ciclo_versao($1,$2,$3,$4,'2026-01-01',null,0,null,'teste')",[emp,fil,bom,r]);
 await assert.rejects(db.query("update erp_roteiros set operacoes='[]' where id=$1",[r]),/imutável/);
 const pg=crypto.randomUUID(),orig=crypto.randomUUID();await one("insert into pcp_programacoes(id,data_programacao) values($1,'2026-10-01') returning id",[pg]);await one("insert into pcp_produtos(id,programacao_id,produto,pedido,descricao,quantidade) values($1,$2,'F','P2','Final',10) returning id",[orig,pg]);
 await db.query("insert into pcp_operacoes(produto_id,processo,sequencia,quantidade_planejada) values($1,'CORTE',1,10),($1,'CORTE',2,10)",[orig]);
 for(const [p,l,q,c] of [[a,'A1',5,2],[a,'A2',5,4],[b,'B1',20,3]])await one("select erp_ciclo_receber($1,$2,$3,$4,$5,$6,$7,'',null,$8,'teste')",[emp,fil,p,local,q,c,l,crypto.randomUUID()]);
 const {id:of}=await one("select erp_ciclo_gerar($1,$2,$3,10,'2026-10-31',$4,'BLOQUEAR',true,$5,$5,null,'teste') id",[emp,fil,final,local,orig]);await one("select erp_ciclo_confirmar($1,'teste')",[of]);
 const op=(await db.query<{id:string}>('select id from pcp_operacoes where of_id=$1 order by sequencia',[of])).rows;
 const payload={boa:4,refugo:0,consumirRefugo:true,consumos:[]},key=crypto.randomUUID();
 const promises=await Promise.all([one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[op[0].id,JSON.stringify(payload),key]),one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[op[0].id,JSON.stringify(payload),key])]);assert.equal(promises[0].id,promises[1].id);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[a])).fisico),6);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[b])).fisico),20);
 assert.equal((await db.query('select * from est_movimentos where of_id=$1 and produto_id=$2',[of,final])).rows.length,0);
 const {id:mov}=await one("select id from est_movimentos where apontamento_id=$1 and tipo='SAIDA'",[promises[0].id]);
 assert.equal(Number((await one('select sum(custo) custo from est_custeio_alocacoes where saida_id=$1',[mov])).custo),8);
 assert.equal(Number((await one('select custo_total from est_movimentos where id=$1',[mov])).custo_total),12);
 await assert.rejects(one("select erp_ciclo_apontar($1,$2,$3,'teste')",[op[1].id,JSON.stringify({...payload,boa:2}),crypto.randomUUID()]),/REQUISICAO_MANUAL/);
 const {id:ap2}=await one("select erp_ciclo_apontar($1,$2,$3,'teste') id",[op[1].id,JSON.stringify({...payload,boa:2,consumos:[{produtoId:b,quantidade:4}]}),crypto.randomUUID()]);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[b])).fisico),16);
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[final])).fisico),2);
 await db.exec("create table erp_identidade_banco(singleton boolean,unidade text);insert into erp_identidade_banco values(true,'SUL')");
 const antigaFlag=process.env.ERP_CICLO_INDUSTRIAL;process.env.ERP_CICLO_INDUSTRIAL='enabled';try{
 const port=adapter(db),engenharia=await consultarEngenhariaCiclo(port,1);assert.equal(engenharia.roteiros.length,1);
 const detalhe=await consultarOFCiclo(port,String(of),1);assert.equal(detalhe.operacoes?.length||0,2);
 const lotes=await consultarLotesCiclo(port,new URLSearchParams(),1);assert.ok((lotes.lotes?.length||0)>=3);
 const {id:finalLot}=await one("select lote_id id from est_movimentos where apontamento_id=$1 and tipo='ENTRADA'",[ap2]);
 const frente=await consultarLotesCiclo(port,new URLSearchParams({loteId:String(finalLot),direcao:'TRAS'}),1);assert.ok((frente.rastreio?.length||0)>1);
 }finally{if(antigaFlag===undefined)delete process.env.ERP_CICLO_INDUSTRIAL;else process.env.ERP_CICLO_INDUSTRIAL=antigaFlag;}
 const pal=await one('select * from pcp_pallets where apontamento_id=$1',[ap2]);assert.equal(pal.qualidade_status,'PENDENTE');assert.ok(pal.lote_id);
 await assert.rejects(one("select erp_ciclo_estornar($1,$2,'teste')",[promises[0].id,crypto.randomUUID()]),/posteriores/);
 await one("select erp_ciclo_estornar($1,$2,'teste')",[ap2,crypto.randomUUID()]);await one("select erp_ciclo_estornar($1,$2,'teste')",[promises[0].id,crypto.randomUUID()]);
 assert.equal((await one('select status from pcp_pallets where id=$1',[pal.id])).status,'BLOQUEADO');
 assert.equal(Number((await one('select fisico from est_saldos where produto_id=$1',[a])).fisico),10);
 assert.equal(Number((await one('select sum(quantidade) quantidade from est_custeio_alocacoes where entrada_id in(select id from est_movimentos where produto_id=$1)',[a])).quantidade),0);
 await assert.rejects(db.query('delete from est_movimentos where id=$1',[mov]),/histórico auditável/);
 await assert.rejects(db.query('delete from pcp_apontamentos where id=$1',[ap2]),/não pode ser apagado/);
 await assert.rejects(db.query("update pcp_apontamentos set quantidade=99 where id=$1",[ap2]),/imutável/);
 }finally{await db.close();}
});
test('transferência em trânsito: fontes independentes e reenvio sem duplicar saída ou entrada',async()=>{
 const origem=await banco(),destino=await banco();try{
 const setup=async(db:PGlite,unidade:string)=>{
 const one=async(q:string,args:unknown[]=[]) => (await db.query<Record<string,unknown>>(q,args)).rows[0];
 const {id:emp}=await one("insert into pcp_empresas(codigo,razao_social) values('PCP_LEGADO','Teste') returning id"),{id:fil}=await one('insert into pcp_filiais(empresa_id,codigo,nome) values($1,$2,$2) returning id',[emp,unidade]),{id:local}=await one("insert into est_locais(codigo) values('L') returning id"),{id:prod}=await one("insert into est_produtos(codigo,unidade_base) values('P','UN') returning id");return {one,emp,fil,local,prod};};
 const de=await setup(origem,'SUL'),para=await setup(destino,'NORDESTE');assert.notEqual(de.prod,para.prod);
 const up=(await readFile('database/migrations/2026-10-22_11_transferencias_unidades.sql','utf8')).split('-- migrate:down')[0];await origem.exec(up);await origem.exec(up);
 const {id:filDestinoCentral}=await de.one("insert into pcp_filiais(empresa_id,codigo,nome) values($1,'NORDESTE','Nordeste') returning id",[de.emp]);
 await de.one("select erp_ciclo_receber($1,$2,$3,$4,10,5,'ORIGEM','',null,$5,'teste')",[de.emp,de.fil,de.prod,de.local,crypto.randomUUID()]);
 const {id:lote}=await de.one("select id from est_lotes where codigo='ORIGEM'"),id=crypto.randomUUID();
 await origem.exec("create table erp_identidade_banco(singleton boolean,unidade text);insert into erp_identidade_banco values(true,'SUL')");await destino.exec("create table erp_identidade_banco(singleton boolean,unidade text);insert into erp_identidade_banco values(true,'NORDESTE')");
 let selecionada:'SUL'|'NORDESTE'='SUL',falharRecebimento=true;
 const identidade=adapter(origem,sql=>{if(sql.includes("set status='RECEBIDA'")&&falharRecebimento){falharRecebimento=false;throw new Error('Interrupção simulada após crédito no destino');}});
 const ports:TransferPorts={contexto:async()=>({db:identidade,e:{selecionada,permitidas:['SUL','NORDESTE'],sessao:{usuario:'teste',perfil:'PCP',processos:[]}}}),verificarBanco:async u=>adapter(u==='SUL'?origem:destino)};
 const body={acao:'CICLO_TRANSFERIR',requestId:id,destino:'NORDESTE',loteId:lote,localOrigemId:de.local,produtoDestinoId:para.prod,localDestinoId:para.local,quantidade:4};
 await gravarTransferencia(body,ports);await gravarTransferencia(body,ports);
 assert.equal((await de.one('select status from est_transferencias_unidades where id=$1',[id])).status,'EM_TRANSITO');
 assert.equal(Number((await de.one('select fisico from est_saldos where produto_id=$1',[de.prod])).fisico),6);
 assert.equal((await destino.query('select * from est_saldos')).rows.length,0);
 selecionada='NORDESTE';await assert.rejects(gravarTransferencia({acao:'CICLO_RECEBER_TRANSFERENCIA',id},ports),/Interrupção simulada/);
 assert.equal((await de.one('select status from est_transferencias_unidades where id=$1',[id])).status,'EM_TRANSITO');
 await gravarTransferencia({acao:'CICLO_RECEBER_TRANSFERENCIA',id},ports);await gravarTransferencia({acao:'CICLO_RECEBER_TRANSFERENCIA',id},ports);
 assert.equal(Number((await para.one('select fisico from est_saldos where produto_id=$1',[para.prod])).fisico),4);
 assert.equal((await origem.query("select * from est_movimentos where tipo='SAIDA'")).rows.length,1);
 assert.equal((await destino.query("select * from est_movimentos where tipo='ENTRADA'")).rows.length,1);
 await assert.rejects(origem.query("update est_transferencias_unidades set status='EM_TRANSITO' where id=$1",[id]),/imutável/);
 await assert.rejects(origem.query('delete from est_transferencias_unidades where id=$1',[id]),/apagada/);
 }finally{await origem.close();await destino.close();}
});
