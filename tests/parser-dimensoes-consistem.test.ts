import test from "node:test";
import assert from "node:assert/strict";
import {medidaLinha} from "../lib/filter-parser";
test("Filtro 53 mantém espessura 35 apesar da descrição truncada em x3",()=>{
 assert.equal(medidaLinha({"Descrição":"FO POR S 2100X700X3","Comprimento":"2100","Largura":"700","Espessura":"35"}),"2100x700x35");
});
test("prioriza colunas dimensionais com espessura 9 em vez de 09",()=>{
 assert.equal(medidaLinha({"Descrição":"T A 1200X70X09","Comprimento":"1200","Largura":"70","Espessura":"9"}),"1200x70x9");
});
test("usa texto para famílias sem dados dimensionais nas colunas",()=>{
 assert.equal(medidaLinha({"Descrição":"ALIZAR 2110x50x9"}),"2110x50x9");
});
