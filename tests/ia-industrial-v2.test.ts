import test from "node:test";
import assert from "node:assert/strict";
import {normalizarTermo,termosDaConsulta,correspondeConsulta,processoConhecido} from "../lib/ia/query-language";
import {FONTES_INDUSTRIAIS,fontesAcessiveis} from "../lib/ia/source-catalog";

test("entende perguntas naturais sem exigir frase exata",()=>{
  const descricao="TRAVESSA DE BATENTE MDF ULTRA 747x110x30 RECOBERTO PET BRANCO";
  assert.ok(correspondeConsulta(descricao,"Quais travessas de batentes ultra temos?"));
  assert.ok(correspondeConsulta(descricao,"temos travessas ultra PET BRANCO?"));
  assert.ok(!correspondeConsulta(descricao,"travessa PINUS"));
  assert.deepEqual(termosDaConsulta("quantos alizares e pernas temos?"),["ALIZAR","PERNA"]);
  assert.equal(normalizarTermo("Peças e produção"),"PECAS E PRODUCAO");
});
test("resolve apelidos de setores",()=>{
  assert.equal(processoConhecido("Lixadeira"),"LIXAR");
  assert.equal(processoConhecido("Recobridora 1"),"RECOBRIDORA");
  assert.equal(processoConhecido("recobridora ii"),"RECOBRIDORA-2");
  assert.equal(processoConhecido("Tupia"),"USINAGEM-TUPIA");
});
test("fontes respeitam perfis sem acesso indiscriminado",()=>{
  assert.ok(FONTES_INDUSTRIAIS.length>=7);
  assert.ok(fontesAcessiveis("GERENTE").some(x=>x.modulo==="Programação do gerente"));
  assert.ok(!fontesAcessiveis("LIDER").some(x=>x.modulo==="Programação do gerente"));
  assert.ok(fontesAcessiveis("LIDER").some(x=>x.modulo==="Líderes"));
  assert.equal(fontesAcessiveis("DESCONHECIDO").length,0);
});
