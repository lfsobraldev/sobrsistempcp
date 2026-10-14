import test from "node:test";
import assert from "node:assert/strict";
import { resumoPorSetor } from "../lib/programacao-auditoria";
import type { Produto } from "../types/pcp";

test("programacao distribui linhas por processo sem perder OFs ou somar como volume global",()=>{
  const p = {
    id:"1",pedido:"100",of:"OF-1",quantidade:10,categoria:"BATENTE",
    material:"MDF STD",medida:"2110x130x30",descricao:"BATENTE",
    operacoes:[
      {processo:"RECOBRIDORA",quantidadePlanejada:10},
      {processo:"LIXAR",quantidadePlanejada:10},
    ]
  } as Produto;
  const q = {...p,id:"2",of:"OF-2",pedido:"101",material:"",operacoes:[
    {processo:"RECOBRIDORA",quantidadePlanejada:5}
  ]} as Produto;
  const a=resumoPorSetor([p,q]);
  const rec=a.find(x=>x.setor==="RECOBRIDORA");
  assert.equal(rec?.pedidos,2);
  assert.equal(rec?.ofs,2);
  assert.equal(rec?.pecas,15);
  assert.equal(rec?.materiaisAusentes,1);
  assert.equal(a.find(x=>x.setor==="LIXAR")?.pecas,10);
});
