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
  assert.equal(primeira.produto.tipo, "COLMEIA");
  assert.equal(primeira.produto.material, "RU");
  assert.equal(primeira.produto.medida, "2100x820x30");
  assert.equal(primeira.produto.cor, "BRANCA");
  assert.equal(segunda.produto.tipo, "SÓLIDA");
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
