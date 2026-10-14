import test from "node:test";
import assert from "node:assert/strict";
import { enriquecerProdutoPeloRegistro } from "../lib/catalogo-consistem";
import type { Produto } from "../types/pcp";

test("catálogo corrige medidas truncadas pelo mesmo código sem alterar OF e quantidade",()=>{
  const p={id:"1",produto:"00123",descricao:"BAT MDF ULTRA 2110x50",medida:"2110x50",material:"UL",
    categoria:"BATENTE",of:"4567",pedido:"890",quantidade:14,operacoes:[{processo:"RECOBRIDORA",quantidadePlanejada:14}]} as Produto;
  const out=enriquecerProdutoPeloRegistro(p,{codigo:"00123",narrativa:"BATENTE MDF ULTRA 2110x50x9 PET BRANCO",conflito:false,vazio:false});
  assert.equal(out.medida,"2110x50x9");
  assert.equal(out.material,"MDF ULTRA");
  assert.match(out.descricao,/2110x50x9/);
  assert.equal(out.of,p.of);
  assert.equal(out.quantidade,p.quantidade);
  assert.deepEqual(out.operacoes,p.operacoes);
});
test("narrativa conflitante não enriquece",()=>{
  const p={id:"2",produto:"999",medida:"2110x50"} as Produto;
  assert.equal(enriquecerProdutoPeloRegistro(p,{codigo:"999",narrativa:"2110x50x9",conflito:true,vazio:false}),p);
});
