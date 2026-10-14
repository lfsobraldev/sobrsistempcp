import test from "node:test";
import assert from "node:assert/strict";
import { buildProcessingFromFilterProducts } from "../lib/romaneio/parser";

test("romaneio preserva duas linhas fisicas identicas de OFs distintas", () => {
  const item = {
    item:"1",produto:"001",descricao:"PORTA 2100x800x35 PET BRANCO",
    categoria:"PORTA",quantidade:4,medida:"2100x800x35"
  };
  const result = buildProcessingFromFilterProducts({
    orderNumber:"25981",client:"CLIENTE TESTE",
    products:[{...item},{...item}],
  });
  const qty = result.packages.flatMap(p=>p.rows).reduce((n,r)=>n+Number(r.quantity||0),0);
  assert.equal(qty,8,"todas as pecas fisicas das OFs devem permanecer");
  assert.equal(result.sourceItemCount,2);
  assert.equal(result.reconciliation?.unmapped,0);
});

test("romaneio preserva todas as familias do mesmo pedido", () => {
  const products=[
    {item:"1",produto:"PORTA",descricao:"PORTA 2100x820x35",categoria:"PORTA",quantidade:2,medida:"2100x820x35"},
    {item:"2",produto:"BATENTE",descricao:"BATENTE PERNA 2110x130x30",categoria:"BATENTE • PERNA",quantidade:4,medida:"2110x130x30"},
    {item:"3",produto:"ALIZAR",descricao:"PERNA ALIZAR 2200x50x9",categoria:"ALIZAR • PERNA",quantidade:8,medida:"2200x50x9"},
    {item:"4",produto:"KIT",descricao:"SUPORTE DE TRILHO 2200x55x45",categoria:"SUPORTE TRILHO",quantidade:2,medida:"2200x55x45"},
    {item:"5",produto:"FERRAGEM",descricao:"DOBRADICA",categoria:"FERRAGEM",quantidade:6},
  ];
  const result=buildProcessingFromFilterProducts({orderNumber:"25981",products});
  const all=result.packages.flatMap(p=>p.rows);
  assert.equal(all.reduce((n,r)=>n+Number(r.quantity||0),0),22);
  assert.equal(result.sourceItemCount,5);
  assert.equal(result.reconciliation?.unmapped,0);
});
