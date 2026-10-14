import test from "node:test";
import assert from "node:assert/strict";
import {simularCapacidadeMaquinas, type MaquinaAPS, type TarefaAPS} from "../lib/ia/aps-machine";

const m=(maquina:string,processo="RECOBRIDORA",c=100):MaquinaAPS=>({
 maquina,processo,pecas_hora:c,minutos_disponiveis:480,eficiencia:100,setup_medio:30,compatibilidades:[],
});
const t=(id:string,quantidade:number,extra:Partial<TarefaAPS>={}):TarefaAPS=>({
 id,processo:"RECOBRIDORA",pedido:"P"+id,of:"OF"+id,produto:"A",quantidade,
 ...extra
});
test("distribui por termino mais cedo e nao soma operacoes em um total ficticio",()=>{
 const r=simularCapacidadeMaquinas([t("1",200),t("2",200)],[m("M1"),m("M2")]);
 assert.equal(r.alocacoes.length,2);
 assert.deepEqual(new Set(r.alocacoes.map(x=>x.maquina)),new Set(["M1","M2"]));
 assert.equal(r.alocacoes.reduce((n,x)=>n+x.quantidade,0),400);
});
test("setup so ocorre quando grupo muda na maquina",()=>{
 const r=simularCapacidadeMaquinas([
  t("1",20,{cor:"BRANCO"}),t("2",20,{cor:"BRANCO"}),t("3",20,{cor:"PRETO"})
 ],[m("M1")]);
 assert.deepEqual(r.alocacoes.map(x=>x.minutosSetup),[0,0,30]);
});
test("sem capacidade cadastrada nao inventa tempo e deixa operacao pendente",()=>{
 const r=simularCapacidadeMaquinas([t("1",20)],[m("M1","RECOBRIDORA",0)]);
 assert.equal(r.alocacoes.length,0);
 assert.equal(r.pendentes.length,1);
});
test("compatibilidade e processo impedem alocacao errada",()=>{
 const r=simularCapacidadeMaquinas([t("1",20,{material:"MDF ULTRA"})],[
  {...m("M1"),compatibilidades:["MDF STD"]},
  m("M2","LIXADEIRA")
 ]);
 assert.equal(r.alocacoes.length,0);
 assert.equal(r.pendentes.length,1);
});
test("fila fixada tem precedencia para preservar programacao homologada",()=>{
 const r=simularCapacidadeMaquinas([
  t("urgente",30,{prioridade:"URGENTE",fixada:false}),
  t("fixa",10,{prioridade:"NORMAL",fixada:true})
 ],[m("M1")]);
 assert.equal(r.alocacoes[0].id,"fixa");
});
test("simulacao nao altera tarefas originais",()=>{
 const tarefas=[t("1",150)];
 simularCapacidadeMaquinas(tarefas,[m("M1")]);
 assert.equal(tarefas[0].quantidade,150);
});
