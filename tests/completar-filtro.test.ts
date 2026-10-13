import test from "node:test";
import assert from "node:assert/strict";
import { completarPorRegras } from "../lib/ia/completar-filtro";
import type { Produto } from "../types/pcp";

function produto(id: string, descricao: string, extras: Partial<Produto> = {}): Produto {
  return {
    id, filtro: "51", pedido: "100", item: "1", produto: "PORTA",
    descricao, tipo: "", canal: "", rebaixo: "", acabamento: "",
    cor: "", quantidade: 12, pedidoCliente: "", statusEngenharia: "",
    of: "OF-100", percentualProduto: 0, codigoModelo: "",
    descricaoModelo: "", outrasCaracteristicas: "", categoria: "PORTA",
    material: "", medida: "", prioridade: "NORMAL", operacoes: [], ...extras,
  };
}

test("completa apenas informações descritas na mesma linha", () => {
  const primeira = completarPorRegras(produto("1", "PORTA COLMEIA RU 2100X820X30 BRANCA"));
  const segunda = completarPorRegras(produto("2", "PORTA SOLIDA MDF 2100X900X35 PRETA"));
  assert.equal(primeira.produto.tipo, "");
  assert.equal(primeira.produto.material, "RU");
  assert.equal(primeira.produto.medida, "2100x820x30");
  assert.equal(primeira.produto.cor, "BRANCA");
  assert.equal(segunda.produto.tipo, "");
  assert.equal(segunda.produto.material, "MDF");
  assert.equal(segunda.produto.medida, "2100x900x35");
  assert.equal(segunda.produto.cor, "PRETA");
});

test("não altera campos existentes nem atributos críticos", () => {
  const p = produto("3", "PORTA COLMEIA RU 2100X820X30 BRANCA", {
    cor: "AZUL", material: "STD", quantidade: 72, of: "OF-72",
  });
  const { produto: p2 } = completarPorRegras(p);
  assert.equal(p2.cor, "AZUL");
  assert.equal(p2.material, "STD");
  assert.equal(p2.quantidade, 72);
  assert.equal(p2.of, "OF-72");
  assert.equal(p.cor, "AZUL");
});

test("não inventa dados em descrições sem atributos", () => {
  const { produto: p } = completarPorRegras(produto("4", "PORTA SEM OUTRAS ESPECIFICACOES"));
  assert.equal(p.tipo, "");
  assert.equal(p.material, "");
  assert.equal(p.medida, "");
  assert.equal(p.cor, "");
});

test("preenche marcos pela propria descrição sem contaminar a linha seguinte", () => {
  const marco = completarPorRegras(produto("5", "M ULTRA PET CA MA 2110X210X30 42X10 R2L", { categoria: "BATENTE - PERNA" }));
  const outro = completarPorRegras(produto("6", "FECHADURA BANHEIRO PALI 4053", { categoria: "FERRAGEM" }));
  assert.equal(marco.produto.tipo, "MDF ULTRA");
  assert.equal(marco.produto.medida, "2110x210x30");
  assert.equal(marco.produto.rebaixo, "C/REB 42X10");
  assert.equal(outro.produto.tipo, "");
  assert.equal(outro.produto.rebaixo, "");
  assert.equal(outro.produto.medida, "");
});

test("não confunde dimensões com rebaixo nem substitui tipo regulagem existente", () => {
  const a = completarPorRegras(produto("7", "A ULTRA PET TUR 2200X70X12 RG(55) RTO", {
    categoria: "ALIZAR", tipo: "REG 2L(MAIOR 55MM)",
  }));
  assert.equal(a.produto.tipo, "REG 2L(MAIOR 55MM)");
  assert.equal(a.produto.medida, "2200x70x12");
  assert.equal(a.produto.rebaixo, "");
});
