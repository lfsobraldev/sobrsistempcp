import test from "node:test";
import assert from "node:assert/strict";
import { compareProduction, familiaIndustrial } from "../lib/domain/industrial";

test("ordem fixa: portas, batentes, alizares, bandeiras, kits e ferragens", () => {
  const itens = [
    {categoria:"FERRAGEM",descricao:"DOBRADICA",prioridade:"URGENTE"},
    {categoria:"KIT CORRER",descricao:"KIT DE CORRER",prioridade:"URGENTE"},
    {categoria:"BANDEIRA",descricao:"BANDEIRA DOBRAVEL",prioridade:"NORMAL"},
    {categoria:"ALIZAR • PERNA",descricao:"PERNA DE ALIZAR",prioridade:"NORMAL"},
    {categoria:"BATENTE • PERNA",descricao:"PERNA DE BATENTE",prioridade:"NORMAL"},
    {categoria:"PORTA",descricao:"FOLHA PORTA",prioridade:"NORMAL"},
  ];
  const ordenados = [...itens].sort(compareProduction);
  assert.deepEqual(ordenados.map(familiaIndustrial),
    ["PORTAS","BATENTES","ALIZARES","BANDEIRA","KIT CORRER","FERRAGENS"]);
});

test("larguras maiores primeiro dentro da mesma familia", () => {
  const itens = [
    {categoria:"PORTA",descricao:"PORTA",medida:"2100x800x35"},
    {categoria:"PORTA",descricao:"PORTA",medida:"2100x1000x35"},
  ];
  assert.deepEqual([...itens].sort(compareProduction).map(x=>x.medida),
    ["2100x1000x35","2100x800x35"]);
});
