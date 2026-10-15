import test from "node:test";
import assert from "node:assert/strict";
import { consolidarCatalogo, normalizarCodigo } from "../lib/catalogo-consistem";
test("catalogo preserva códigos e identifica narrativas conflitantes",()=>{
  const a=consolidarCatalogo([
    {codigo:"000012",narrativa:"BATENTE 2110X130X30 MDF ULTRA"},
    {codigo:"000012",narrativa:"BATENTE 2110X130X30 MDF ULTRA"},
    {codigo:"5432",narrativa:"PORTA 2100X820X35"},
    {codigo:"5432",narrativa:"PORTA 2100X920X35"},
    {codigo:"810",narrativa:""}
  ]);
  assert.equal(a.find(x=>x.codigo==="000012")?.conflito,false);
  assert.equal(a.find(x=>x.codigo==="5432")?.conflito,true);
  assert.equal(a.find(x=>x.codigo==="810")?.vazio,true);
  assert.equal(normalizarCodigo("000012"),"000012");
});

// Catálogo por código deve completar perfis especiais sem depender da descrição curta do filtro.
import { enriquecerProdutoPeloRegistro } from "../lib/catalogo-consistem";
import type { Produto } from "../types/pcp";
test("suporte trilho usa narrativa completa do código do catálogo",()=>{
  const p={id:"linha1",produto:"987124",descricao:"SUP TRILHO",medida:"",tipo:"",material:"",cor:"",categoria:"OUTROS",quantidade:3,pedido:"123",of:"456",operacoes:[]} as Produto;
  const x=enriquecerProdutoPeloRegistro(p,{codigo:"987124",narrativa:"SUPORTE DO TRILHO (KIT DE CORRER) EM MADEIRA DE PINUS COM 2200x55x45MM RECOBERTO PET BRANCO CARRARA PREMIUM (PEÇA B)",conflito:false,vazio:false});
  assert.equal(x.medida,"2200x55x45");
  assert.equal(x.material,"PINUS");
  assert.equal(x.cor,"PET BRANCO CARRARA PREMIUM");
  assert.equal(x.tipo,"MADEIRA DE PINUS");
  assert.equal(x.quantidade,3);
  assert.equal(x.of,"456");
});

test("catálogo separa revestimento de material estrutural em todos os setores",()=>{
  const casos=[
    {narrativa:"ALIZAR L MAIOR MDF ULTRA 2200x50x9MM RECOBERTO PET BRANCO",esperado:"MDF ULTRA",medida:"2200x50x9"},
    {narrativa:"TRAVESSA BATENTE MDF STANDARD 900x130x30MM",esperado:"MDF STD",medida:"900x130x30"},
    {narrativa:"BAGUETE EM MADEIRA DE PINUS 2100x30x15MM RECOBERTO PET BRANCO",esperado:"PINUS",medida:"2100x30x15"},
    {narrativa:"SUPORTE DE TRILHO MDF 2200x55x45MM RECOBERTO PET BRANCO",esperado:"MDF",medida:"2200x55x45"},
  ];
  for(const [i,c] of casos.entries()){
    const p={id:String(i),produto:String(90000+i),pedido:"P1",of:"OF",descricao:"CURTA",material:"",medida:"",quantidade:2,operacoes:[]} as Produto;
    const out=enriquecerProdutoPeloRegistro(p,{codigo:p.produto,narrativa:c.narrativa,conflito:false,vazio:false});
    assert.equal(out.material,c.esperado,c.narrativa);
    assert.equal(out.medida,c.medida,c.narrativa);
    assert.equal(out.quantidade,2);
  }
});
