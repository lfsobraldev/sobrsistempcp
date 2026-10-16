import test from "node:test";
import assert from "node:assert/strict";
import type { Produto } from "../types/pcp";
import { completarPorRegras } from "../lib/ia/completar-filtro";
import { auditarRelacoes, confiancaLinha } from "../lib/ia/validacao";
import { compactarHistorico, saudacaoSimples, selecionarFerramentas } from "../lib/ia/roteador";

const prod = (o: Record<string, unknown>) => ({ id: "1", pedido: "100", of: "10", produto: "", descricao: "", tipo: "", material: "", medida: "", cor: "", categoria: "", canal: "", rebaixo: "", acabamento: "", quantidade: 1, operacoes: [{ quantidadePlanejada: 1, quantidadeProduzida: 0 }], ...o }) as unknown as Produto;

test("completar: abreviação de cor BCO só com evidência na própria linha", () => {
  const r = completarPorRegras(prod({ descricao: "PE AL 2200X50X9 RTO BCO" }));
  assert.equal(r.produto.cor, "BRANCO");
  assert.equal(completarPorRegras(prod({ descricao: "PE AL 2200X50X9 RTO" })).produto.cor, "");
});

test("completar: não sobrescreve campo preenchido", () => {
  const r = completarPorRegras(prod({ descricao: "PE AL 2200X50X9 BCO", cor: "CINZA" }));
  assert.equal(r.produto.cor, "CINZA");
});

test("auditoria: OF em vários pedidos, linha repetida e sem rota", () => {
  const a = auditarRelacoes([
    prod({ id: "1", pedido: "1", of: "9", descricao: "X" }),
    prod({ id: "2", pedido: "2", of: "9", descricao: "Y", operacoes: [] }),
    prod({ id: "3", pedido: "3", of: "8", descricao: "Z" }),
    prod({ id: "4", pedido: "3", of: "8", descricao: "Z" }),
  ]);
  const tipos = a.achados.map((x) => x.tipo);
  assert.ok(tipos.includes("OF_EM_VARIOS_PEDIDOS"));
  assert.ok(tipos.includes("LINHA_REPETIDA"));
  assert.ok(tipos.includes("SEM_ROTA"));
  assert.equal(a.achados[0].gravidade, "ALTA");
});

test("confiança: linha incompleta pontua menos e lista o que falta", () => {
  const c = confiancaLinha(prod({ descricao: "A", material: "", medida: "" }));
  assert.ok(c.score < 100);
  assert.deepEqual(c.faltando, ["material", "medida"]);
});

test("roteador: seleciona subconjunto, cai para todas quando vago, e compacta histórico", () => {
  const todas = { auditar_consistencia: 1, resumo_producao: 1, navegar: 1, gerar_romaneio: 1, buscar_pedido: 1 };
  const sub = selecionarFerramentas("há inconsistência no pedido 27019?", todas);
  assert.ok("auditar_consistencia" in sub && !("gerar_romaneio" in sub));
  assert.equal(Object.keys(selecionarFerramentas("hmm", todas)).length, 5);
  assert.ok(saudacaoSimples("Bom dia!"));
  assert.ok(!saudacaoSimples("bom dia, quantas travessas?"));
  const h = compactarHistorico(Array.from({ length: 30 }, (_, i) => ({ role: (i % 2 ? "assistant" : "user") as "user" | "assistant", content: "x".repeat(5000) })), 12);
  assert.equal(h.length, 12);
  assert.equal(h[9].content.length, 1500);
  assert.equal(h[11].content.length, 5000);
});
