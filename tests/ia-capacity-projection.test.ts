import test from "node:test";
import assert from "node:assert/strict";
import { projetarFilaPorCapacidade } from "../lib/ia/capacity-projection";

test("capacidade finita calcula turno de inicio e fim sem ultrapassar carga",()=>{
 const fila=projetarFilaPorCapacidade([{saldo:80},{saldo:40},{saldo:180}],100);
 assert.deepEqual(fila.map(x=>[x.turnoRelativoInicio,x.turnoRelativoFim]),[[1,1],[1,2],[2,3]]);
});
test("capacidade ausente nao gera previsoes ficticias",()=>{
 const fila=projetarFilaPorCapacidade([{saldo:20}],null);
 assert.equal(fila[0].turnoRelativoInicio,null);
 assert.equal(fila[0].turnoRelativoFim,null);
});
test("fila nao altera quantidade nem ordem do pedido",()=>{
 const fila=projetarFilaPorCapacidade([{pedido:"1",saldo:120},{pedido:"2",saldo:15}],100);
 assert.deepEqual(fila.map(x=>x.pedido),["1","2"]);
 assert.deepEqual(fila.map(x=>x.saldo),[120,15]);
});
