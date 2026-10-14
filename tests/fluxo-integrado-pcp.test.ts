import test from "node:test";
import assert from "node:assert/strict";
import { auditarCoberturaRomaneio } from "../lib/romaneio/source-audit";
import { buildProcessingFromFilterProducts } from "../lib/romaneio/parser";
import { canGenerate } from "../lib/romaneio/validation";

const base = [
  {pedido:"25981",categoria:"PORTA",descricao:"PORTA 2100x820x35",quantidade:2},
  {pedido:"25981",categoria:"BATENTE",descricao:"PERNA BATENTE",quantidade:4},
  {pedido:"25981",categoria:"ALIZAR",descricao:"PERNA ALIZAR",quantidade:8},
  {pedido:"25982",categoria:"KIT CORRER",descricao:"KIT DE CORRER",quantidade:2},
];
test("auditoria identifica uma familia ausente no romaneio",()=>{
  const erros=auditarCoberturaRomaneio(base,base.filter(x=>x.categoria!=="PORTA"));
  assert.equal(erros.length,1);
  assert.equal(erros[0].pedido,"25981");
  assert.equal(erros[0].quantidadePCP,2);
  assert.equal(erros[0].quantidadeRomaneio,0);
});
test("auditoria preserva quantidades de todos os pedidos",()=>{
  const fonte=[...base,{pedido:"25981",categoria:"FERRAGEM",descricao:"DOBRADICA",quantidade:6}];
  assert.deepEqual(auditarCoberturaRomaneio(base,fonte),[]);
});
test("auditoria encontra pecas extras na fonte",()=>{
  const fonte=[...base,{pedido:"25982",categoria:"PORTA",descricao:"PORTA",quantidade:5}];
  assert.equal(auditarCoberturaRomaneio(base,fonte)[0].quantidadeRomaneio,5);
});
test("exportacoes bloqueadas quando alguma linha da origem ficou sem vinculo",()=>{
  const result=buildProcessingFromFilterProducts({
    orderNumber:"25981",
    client:"Cliente",destination:"Aracaju",
    products:[{item:"1",produto:"Porta",descricao:"PORTA 2100x820x35",categoria:"PORTA",medida:"2100x820x35",quantidade:2}],
  });
  result.reconciliation = {...result.reconciliation!,unmapped:1};
  assert.equal(canGenerate(result),false);
});
