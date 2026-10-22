import {test} from 'node:test';
import assert from 'node:assert/strict';
import {apontamentoPayload,engenhariaCiclo,exigirCiclo,gravarOperacaoCiclo} from '../lib/ciclo-industrial';
import {mesmaFila} from '../lib/chao-fila';
import type {Db} from '../lib/db';
const id='00000000-0000-4000-8000-000000000001';
test('contratos do ciclo: precisão, refugo, componentes repetidos e isolamento da fila',()=>{
 assert.equal(apontamentoPayload.safeParse({boa:0.0001,refugo:0}).success,false);
 assert.equal(apontamentoPayload.safeParse({boa:0,refugo:1}).success,false);
 assert.equal(apontamentoPayload.safeParse({boa:1,refugo:0,consumos:[{produtoId:id},{produtoId:id}]}).success,false);
 assert.equal(engenhariaCiclo.safeParse({acao:'CICLO_CENTRO',processo:'CORTE',maquina:'M',turno:'A',minutos:1500,dias:[1]}).success,false);
 assert.equal(mesmaFila({usuario:'a',unidade:'SUL'},'a','NORDESTE'),false);
 assert.equal(mesmaFila({usuario:'a',unidade:'SUL'},'b','SUL'),false);
 assert.equal(mesmaFila({usuario:'a',unidade:'SUL'},'a','SUL'),true);
});
test('flag desligada não consulta schema; migração ausente e setor não autorizado impedem escrita',async()=>{
 const anterior=process.env.ERP_CICLO_INDUSTRIAL;let chamadas=0;let respostas:Record<string,unknown>[][]=[];
 const db=((..._args:unknown[])=>{chamadas++;return Promise.resolve(respostas.shift()||[]);}) as unknown as Db;
 try{
 delete process.env.ERP_CICLO_INDUSTRIAL;await assert.rejects(exigirCiclo(db),/desativado/);assert.equal(chamadas,0);
 process.env.ERP_CICLO_INDUSTRIAL='enabled';respostas=[[{instalado:false}]];await assert.rejects(exigirCiclo(db),/aguardando migração/);
 respostas=[[{instalado:true}],[{empresa_id:id,filial_id:id}],[{id,processo:'CORTE'}]];
 await assert.rejects(gravarOperacaoCiclo(db,id,{action:'CICLO_APONTAR',requestId:id,payload:{boa:1,refugo:0}},'operador',[],true),/SEM_PERMISSAO/);
 assert.equal(respostas.length,0);assert.equal(chamadas,4);
 }finally{if(anterior===undefined)delete process.env.ERP_CICLO_INDUSTRIAL;else process.env.ERP_CICLO_INDUSTRIAL=anterior;}
});
