import test from "node:test";
import assert from "node:assert/strict";
import {diagnosticarSetores,resumoIndustrial} from "../lib/industrial/opportunity";
import type {Produto} from "../types/pcp";
test("separa processos, bloqueios e produção registrada sem prometer OEE",()=>{
 const produtos=[{prioridade:"URGENTE",operacoes:[
  {processo:"RECOBRIDORA",quantidadePlanejada:20,quantidadeProduzida:5,quantidadeRefugo:1,status:"BLOQUEADA"},
  {processo:"LIXAR",quantidadePlanejada:20,quantidadeProduzida:0,quantidadeRefugo:0,status:"PENDENTE"}]}] as Produto[];
 const setores=diagnosticarSetores(produtos);
 assert.equal(setores.length,2);
 assert.equal(setores[0].bloqueado,15);
 assert.equal(setores[0].saldo,15);
 assert.equal(resumoIndustrial(setores).saldoOperacoes,35);
 assert.match(resumoIndustrial(setores).ressalva,/Sem dados de custo/);
});
test("sem operações não inventa desempenho",()=>{
 assert.deepEqual(diagnosticarSetores([]),[]);
});
