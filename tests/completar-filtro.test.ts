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

test("Filtro 53: alizar STD na descrição preenche Tipo somente daquela peça", () => {
  const a = completarPorRegras(produto("alizar-1", "T A 1100X50X9 RT OL LME PET BCO TXT (STD)", { categoria: "ALIZARES" }));
  const b = completarPorRegras(produto("alizar-2", "T A 1100X50X9 RT OL LME PET BCO TXT", { categoria: "ALIZARES" }));
  assert.equal(a.produto.tipo, "STD");
  assert.equal(a.produto.material, "MDF STD");
  assert.equal(a.produto.medida, "1100x50x9");
  assert.equal(b.produto.tipo, "");
  assert.equal(b.produto.material, "");
});

test("Filtro 53: não presume rebaixo do alizar com RT sem regra homologada", () => {
  const a = completarPorRegras(produto("alizar-3", "2250X50X9 RTO RL80 PET BCO TXT MPMV(STD)", { categoria: "ALIZARES", rebaixo: "" }));
  assert.equal(a.produto.tipo, "STD");
  assert.equal(a.produto.rebaixo, "");
});

test("alizar e baguete nunca recebem rebaixo inferido, mesmo com padrão 42X10", () => {
  const alizar = completarPorRegras(produto("a-rebaixo", "ALIZAR STD 2200X70X12 RT 42X10", { categoria: "ALIZARES", rebaixo: "" }));
  const baguete = completarPorRegras(produto("b-rebaixo", "BAGUETE MDF ULTRA 2110X25X15 42X10", { categoria: "BAGUETE", rebaixo: "" }));
  assert.equal(alizar.produto.rebaixo, "");
  assert.equal(baguete.produto.rebaixo, "");
});

test("Filtro 53 original: UL e ULTR truncados significam MDF ULTRA somente na própria linha", () => {
  for (const desc of ["P A 2200X60X18 RTO RL55 RC PET BCO(ULTR", "TR AL 1100X60X18 RTO RL55 REC PET BCO(UL", "PER ALI 2200X60X18 RTO LME RC PET BCO(UL", "TR AL 1100X60X18 RTO LME REC PET BCO (UL"]) {
    const p = completarPorRegras(produto(desc, desc, { categoria: "ALIZARES" })).produto;
    assert.equal(p.tipo, "ULTRA");
    assert.equal(p.material, "MDF ULTRA");
    assert.equal(p.rebaixo, "");
  }
  const ferragem = completarPorRegras(produto("sem", "FECHADURA PALI", { categoria: "FERRAGEM" })).produto;
  assert.equal(ferragem.tipo, "");
});

test("OF 613147: ULT no fim da descricao equivale a ULTRA", () => {
  const a = completarPorRegras(produto("613147", "T A 1200X70X09 RTO RL55 RC PET CAPUC ULT", { categoria: "ALIZARES" }));
  assert.equal(a.produto.tipo, "ULTRA");
  assert.equal(a.produto.material, "MDF ULTRA");
  assert.equal(a.produto.rebaixo, "");
});
test("nao preencher rebaixo nos alizares e preservar a OF", () => {
  const a = completarPorRegras(produto("613148", "T A 1200X70X09 RTO LME RC PET CAPUCC (UL", { categoria: "ALIZARES", of: "613148" }));
  assert.equal(a.produto.of, "613148");
  assert.equal(a.produto.tipo, "ULTRA");
  assert.equal(a.produto.rebaixo, "");
});

test("Filtro 53: rebaixos de batente e material são extraídos somente da descrição correspondente", () => {
  const amostras = [
    ["M P MDF STD PET TXT BCO 2110X80X30 42X10", "C/REB 42X10", "MDF STD"],
    ["M T ULTRA PET TUR 1000X230X30 42X10 R2L", "C/REB 42X10", "MDF ULTRA"],
    ["1000x130x30 S/RB R1L (MA) PET BC (UL)", "S/REB", "MDF ULTRA"],
    ["2130x150x30 S/REB R2L R1 PET BRC (UL)", "S/REB", "MDF ULTRA"],
    ["CJ M ULTRA PET BCO CAR 2110X90X30 42X10", "C/REB 42X10", "MDF ULTRA"],
  ];
  for (const [descricao, esperado, material] of amostras) {
    const lido = completarPorRegras(produto(descricao, descricao, { categoria: "BATENTE" })).produto;
    assert.equal(lido.rebaixo, esperado, descricao);
    assert.equal(lido.material, material, descricao);
  }
});

test("Filtro 53: alizar, baguete e ferragens não recebem rebaixo nem material emprestado", () => {
  const alizar = completarPorRegras(produto("al", "T A 1200X70X09 RTO RL55 RC PET CAPUC ULT", { categoria: "ALIZARES" })).produto;
  const baguete = completarPorRegras(produto("bg", "BAGUETE 1000X35X10 RTO 42X10", { categoria: "BAGUETE" })).produto;
  const ferragem = completarPorRegras(produto("fer", "FECHADURA BANHEIRO PALI 4053-PY-R23", { categoria: "FERRAGEM" })).produto;
  assert.equal(alizar.tipo, "ULTRA");
  assert.equal(alizar.rebaixo, "");
  assert.equal(baguete.rebaixo, "");
  assert.equal(ferragem.rebaixo, "");
  assert.equal(ferragem.material, "");
});

test("alizar reconhece U UL ULT e ULTR isolados como Ultra", () => {
  for (const sigla of ["U", "UL", "ULT", "ULTR"]) {
    const p = completarPorRegras(produto("sigla-"+sigla, "T A 1200X70X09 RTO RL55 PET CAPUC ("+sigla, { categoria: "ALIZARES" })).produto;
    assert.equal(p.tipo, "ULTRA", sigla);
    assert.equal(p.material, "MDF ULTRA", sigla);
    assert.equal(p.rebaixo, "", sigla);
  }
  const p = completarPorRegras(produto("outro", "FERRAGEM COD U300", { categoria: "FERRAGEM" })).produto;
  assert.equal(p.material, "");
});

test("Kit de correr com ULT e máscara PINUS conflitantes não recebe material arbitrário", () => {
  const item = completarPorRegras(produto("kit-pin-ultra", "CA KIT L MAI ULT", {
    categoria: "KIT CORRER", descricaoModelo: "KIT DE CORRER EM MADEIRA DE PINUS",
    material: "", tipo: "",
  }));
  assert.equal(item.produto.material, "");
  assert.equal(item.produto.tipo, "");
});

test("Tipo STD e descrição ULTRA conflitantes não substituem material", () => {
  const item = completarPorRegras(produto("conflito-tipo", "SUP TRILHO ULTRA", {
    categoria: "SUPORTE TRILHO", tipo: "STD", material: "",
  }));
  assert.equal(item.produto.tipo, "STD");
  assert.equal(item.produto.material, "");
});
