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
