import test from "node:test";
import assert from "node:assert/strict";
import { familiaIndustrial, tipoPeca, medidaDoItem } from "../lib/domain/industrial";

const linhas = [
  { categoria:"ALIZAR TRAVESSA", descricao:"TRAVESSA DE ALIZAR 900x50x9",medida:"900x50x9" },
  { categoria:"ALIZAR PERNA", descricao:"PERNA DE ALIZAR 2110x50x9",medida:"2110x50x9" },
  { categoria:"BATENTE TRAVESSA", descricao:"TRAVESSA DE BATENTE 900x130x30",medida:"900x130x30" },
];
test("travessa de alizar 50x9 não inclui perna da mesma medida",()=>{
 const filtradas=linhas.filter(p=>familiaIndustrial(p)==="ALIZARES" && tipoPeca(p)==="TRAVESSA" && medidaDoItem(p)[1]===50 && medidaDoItem(p)[2]===9);
 assert.equal(filtradas.length,1);
 assert.match(filtradas[0].descricao,/TRAVESSA/);
});
test("pernas de alizar são contadas separadas das travessas",()=>{
 const filtradas=linhas.filter(p=>familiaIndustrial(p)==="ALIZARES" && tipoPeca(p)==="PERNA" && medidaDoItem(p)[1]===50 && medidaDoItem(p)[2]===9);
 assert.equal(filtradas.length,1);
 assert.match(filtradas[0].descricao,/PERNA/);
});
