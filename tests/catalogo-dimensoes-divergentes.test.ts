import test from "node:test";
import assert from "node:assert/strict";
import {enriquecerProdutoPeloRegistro} from "../lib/catalogo-consistem";
import type {Produto} from "../types/pcp";
test("não sobrescreve dimensões completas do CSV se narrativa divergir",()=>{
 const p={id:"a",produto:"3010600806",medida:"5260x100x30",quantidade:10,of:"123",descricao:"M STD 2130X100X30"} as Produto;
 const x=enriquecerProdutoPeloRegistro(p,{codigo:"3010600806",narrativa:"PERNA DE BATENTE 2130x100x30 MDF STANDARD",conflito:false,vazio:false});
 assert.equal(x.medida,"5260x100x30");
 assert.equal(x.quantidade,10);
 assert.equal(x.of,"123");
});
