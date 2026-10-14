import test from "node:test";
import assert from "node:assert/strict";
import {consolidarCatalogo,resolverNarrativaConflitante} from "../lib/catalogo-consistem";
import type {Produto} from "../types/pcp";

test("não gera conflito por caixa ou acento no mesmo texto",()=>{
 const r=consolidarCatalogo([{codigo:"01",narrativa:"BATENTE MDF ULTRA 2110x130x30"},{codigo:"01",narrativa:"batente mdf ultra 2110X130X30"}]);
 assert.equal(r[0].conflito,false);
});
test("resolve código conflitante apenas quando tripla separa uma narrativa",()=>{
 const p={medida:"2110x130x30",descricao:"PERNA BATENTE"} as Produto;
 const narrativas=["PERNA BATENTE 2110x130x30 MDF ULTRA","PERNA BATENTE 2110x150x30 MDF ULTRA"];
 assert.equal(resolverNarrativaConflitante(p,narrativas),narrativas[0]);
});
test("não escolhe se mesma medida tem materiais distintos",()=>{
 const p={medida:"2110x130x30",descricao:"PERNA BATENTE"} as Produto;
 assert.equal(resolverNarrativaConflitante(p,["MDF ULTRA 2110x130x30","MDF STD 2110x130x30"]),null);
});
test("não escolhe narrativa diferente sem tripla completa",()=>{
 const p={medida:"2110x130",descricao:"PERNA BATENTE"} as Produto;
 assert.equal(resolverNarrativaConflitante(p,["MDF ULTRA 2110x130x30","MDF STD 2110x130x30"]),null);
});
