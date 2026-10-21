import test from "node:test";
import assert from "node:assert/strict";
import { podeAvancarMedicao, validarItensMedicao } from "../lib/medicoes";

test("aceita itens com conjuntos de dimensões diferentes e unidades explícitas", () => {
  const itens = validarItensMedicao([
    { descricao: "Porta", quantidade: 1, dimensoes: [{ nome: "Altura", valor: 2100, unidade: "mm" }, { nome: "Largura", valor: 800, unidade: "mm" }] },
    { descricao: "Bancada", quantidade: 1, dimensoes: [{ nome: "Comprimento", valor: 1.8, unidade: "m" }, { nome: "Profundidade", valor: 600, unidade: "mm" }] },
  ]);
  assert.equal(itens.length, 2);
  assert.equal(itens[1].dimensoes.length, 2);
});

test("não aceita medição sem descrição, dimensão ou unidade", () => {
  assert.throws(() => validarItensMedicao([]), /1 a 100 itens/);
  assert.throws(() => validarItensMedicao([{ descricao: "Peça", quantidade: 1, dimensoes: [] }]), /ao menos uma dimensão/);
  assert.throws(() => validarItensMedicao([{ descricao: "Peça", quantidade: 1, dimensoes: [{ nome: "Altura", valor: 20, unidade: "" }] }]), /unidade são obrigatórios/);
});

test("rejeita unidades que não estão disponíveis no formulário", () => {
  assert.throws(() => validarItensMedicao([
    { descricao: "Porta", quantidade: 1, dimensoes: [{ nome: "Altura", valor: 2100, unidade: "polegadas" }] },
  ]), /unidade não suportada/);
});

test("bloqueia aprovação sem conferência e revisão sem nova medição", () => {
  assert.equal(podeAvancarMedicao("AGUARDANDO_CONFERENCIA", "APROVAR"), false);
  assert.equal(podeAvancarMedicao("AGUARDANDO_CONFERENCIA", "SOLICITAR_APROVACAO"), true);
  assert.equal(podeAvancarMedicao("AGUARDANDO_APROVACAO", "APROVAR"), true);
  assert.equal(podeAvancarMedicao("APROVADA_PARA_PRODUCAO", "SOLICITAR_APROVACAO"), false);
});